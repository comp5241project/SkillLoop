/** Isolated orchestration for an injected provider. No real AI client is imported. */
const { buildFactPack, buildTeachingContext, validateTeachingDraft, projectPublicCard } =
  require('./m2-teaching-contract.cjs');
const { validateFactualClaims } = require('./m2-factual-gate.cjs');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { trustedDecision } = require('./m2-review-registry.cjs');

const MAX_REQUEST_CHARS = 12000;
const MAX_RESPONSE_CHARS = 12000;
const DEFAULT_TIMEOUT_MS = 1000;
const fail = (status, code) => ({ status, code, publicCard: null });
const generatedDrafts = new WeakMap();
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function providerRequest(context) {
  const { factPack, diagnosis, targetSelection, previousObservation } = context;
  const request = {
    schemaVersion: 1, task: 'propose-personalized-teaching-card',
    case: { caseId: factPack.caseId, caseVersion: factPack.caseVersion, conceptId: factPack.conceptId,
      title: factPack.title, scenario: factPack.scenario, aiClaim: factPack.aiClaim,
      requirements: factPack.requirements.map(({ requirementId, text }) => ({ requirementId, text })),
      starterCode: factPack.starterCode },
    target: { requirementId: targetSelection.requirementId,
      evidence: { quote: diagnosis.evidence.quote, questionId: diagnosis.evidence.questionId,
        optionId: diagnosis.evidence.optionId, explanation: diagnosis.evidence.explanation,
        level: diagnosis.evidence.level, gap: diagnosis.evidence.gap } },
    learner: { background: diagnosis.learner.background, goal: diagnosis.learner.goal },
    previousObservation: previousObservation.state === 'validated'
      ? { state: 'validated', activityId: previousObservation.activityId,
        outcome: previousObservation.outcome, observed: previousObservation.observed }
      : { state: previousObservation.state },
  };
  // Check the precise payload sent to the provider, not the authority-bearing context.
  const serialized = JSON.stringify(request);
  if (serialized.length > MAX_REQUEST_CHARS) throw new Error('Generation request exceeds size limit');
  return JSON.parse(serialized);
}

async function callProvider(provider, request, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let settled = false;
  const work = Promise.resolve().then(() => provider.generate(request, { signal: controller.signal }))
    .then((value) => { settled = true; return value; }, (error) => { settled = true; throw error; });
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Provider timed out'),
        { code: 'TIMEOUT' })), timeoutMs); }),
    ]);
  } catch (error) {
    if (error?.code === 'TIMEOUT') {
      controller.abort();
      // A provider that ignores AbortSignal may keep running. Never overlap its retry.
      if (!settled) await Promise.race([work.then(() => {}, () => {}),
        new Promise((resolve) => setTimeout(resolve, 25))]);
      if (!settled) error.code = 'TIMEOUT_UNCANCELLED';
    }
    throw error;
  } finally { clearTimeout(timer); }
}

async function generateTeachingCard(input, provider, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!provider || typeof provider.generate !== 'function' || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > 20000) return fail('invalid-input', 'invalid-provider');
  let context;
  try {
    // Never accept a caller-supplied Teaching Context or targetSelection as authority.
    if (!input || typeof input !== 'object' || 'context' in input || 'targetSelection' in input)
      return fail('invalid-input', 'untrusted-context');
    const factPack = buildFactPack({ caseId: input.caseId, caseVersion: input.caseVersion,
      conceptId: input.conceptId, requirementIds: input.requirementIds });
    context = buildTeachingContext({ fixture: input.fixture, factPack,
      previousObservationId: input.previousObservationId ?? null,
      previousAttemptId: input.previousAttemptId ?? null,
      previousActivityId: input.previousActivityId ?? null });
  } catch { return fail('invalid-input', 'invalid-teaching-input'); }
  if (context.targetSelection.state !== 'reviewed') return { ...fail('review-required', 'target-not-reviewed'),
    authoredFallbackAvailable: true };
  if (context.previousObservation.state === 'untrusted') return fail('invalid-input', 'untrusted-observation');
  let request;
  try { request = providerRequest(context); } catch { return fail('invalid-input', 'request-too-large'); }

  let proposed;
  let attempts = 0;
  let timeoutEvents = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    try {
      proposed = await callProvider(provider, structuredClone(request), timeoutMs);
      break;
    } catch (error) {
      if (error?.code === 'TIMEOUT' || error?.code === 'TIMEOUT_UNCANCELLED') timeoutEvents++;
      const transient = ['TIMEOUT', 'RATE_LIMITED', 'NETWORK_ERROR'].includes(error?.code);
      if (!transient || attempt === 2) return { ...fail('provider-error', transient ? 'transient-failure' : 'provider-failure'),
        attempts: attempt, timeoutEvents, authoredFallbackAvailable: true };
    }
  }
  let draft;
  try {
    if (typeof proposed === 'string') {
      if (proposed.length > MAX_RESPONSE_CHARS) throw new Error('Response too large');
      draft = JSON.parse(proposed);
    } else {
      const serialized = JSON.stringify(proposed);
      if (!serialized || serialized.length > MAX_RESPONSE_CHARS) throw new Error('Response too large');
      draft = JSON.parse(serialized);
    }
    validateTeachingDraft(draft, context);
    validateFactualClaims(draft, context.factPack);
    const publicCard = projectPublicCard(draft, context);
    const result = { status: 'success', publicCard,
      internalAssessment: structuredClone(draft.internalAssessment),
      generationMetadata: structuredClone(draft.metadata),
      evaluationTrace: { caseId: context.caseId, caseVersion: context.caseVersion,
        conceptId: context.conceptId, requirementId: context.targetSelection.requirementId,
        reviewId: context.targetSelection.reviewId, evidenceQuote: context.diagnosis.evidence.quote },
      attempts, timeoutEvents, reviewStatus: 'human-review-required' };
    generatedDrafts.set(result, { snapshot: structuredClone(result), fingerprint: digest(result),
      decision: 'generated-pending-review' });
    return result;
  } catch { return { ...fail('invalid-output', 'draft-validation-failed'), attempts,
    timeoutEvents, authoredFallbackAvailable: true }; }
}

function reviewTeachingCard(result, reviewId) {
  const record = result && typeof result === 'object' ? generatedDrafts.get(result) : null;
  if (!record || !isDeepStrictEqual(result, record.snapshot)) return { state: 'rejected', code: 'draft-integrity-failed' };
  if (record.decision === 'approved' || record.decision === 'rejected') return { state: record.decision };
  if (typeof reviewId !== 'string') return { state: 'generated-pending-review' };
  const decision = trustedDecision(reviewId, record.fingerprint, result.publicCard.caseId,
    result.publicCard.caseVersion);
  if (!decision) return { state: 'generated-pending-review' };
  record.decision = decision.decision;
  record.provenance = decision.provenance;
  return { state: record.decision };
}

function studentTeachingResponse(result) {
  const record = result && typeof result === 'object' ? generatedDrafts.get(result) : null;
  if (!record || !isDeepStrictEqual(result, record.snapshot)) return { state: 'rejected' };
  if (record.decision !== 'approved') return { state: record.decision };
  const card = record.snapshot.publicCard;
  return { state: 'approved', card: {
    caseId: card.caseId, caseVersion: card.caseVersion, conceptId: card.conceptId,
    objective: card.objective, requirementRefs: [...card.requirementRefs], explanation: card.explanation,
    codeExample: { kind: card.codeExample.kind, excerpt: card.codeExample.excerpt, prompt: card.codeExample.prompt },
    exercise: { kind: card.exercise.kind, prompt: card.exercise.prompt,
      publicHints: [...card.exercise.publicHints] },
  } };
}

module.exports = { generateTeachingCard, reviewTeachingCard, studentTeachingResponse };
