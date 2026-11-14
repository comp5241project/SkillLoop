/** Isolated M2 data boundary. No model call, API route or module UI uses this file. */
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { validateModelProposal, PROMPT_VERSION } = require('./m2-model-proposal.cjs');
const { convertLegacyCatalog, convertStudentCatalog, convertEvaluationCatalog } = require('./legacy-adapter.cjs');
const { validatePreflight } = require('./m2-preflight/validate.cjs');
const { reviewedDiagnosis, reviewedObservation } = require('./m2-reviewed-evidence.cjs');

const ROOT = path.resolve(__dirname, '..');
// Only this module can associate a returned context with its validated source.
// A copy of the visible context has no authority, even if every field matches.
const reviewedContexts = new WeakMap();
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...names].sort().join('|');
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const ids = (value, allowed, min = 1, max = 8) => Array.isArray(value) && value.length >= min && value.length <= max &&
  new Set(value).size === value.length && value.every((id) => typeof id === 'string' && allowed.has(id));
const fail = (message) => { throw new Error(message); };

function buildFactPack({ caseId, caseVersion, conceptId, requirementIds }) {
  if (caseId !== 'cart-checkout' || caseVersion !== 1 || conceptId !== 'edge-cases') fail('Unsupported case, version or concept');
  const definition = convertStudentCatalog(ROOT)[caseId];
  if (definition.caseVersion !== caseVersion || !definition.conceptIds.includes(conceptId) || !definition.capabilities.learning)
    fail('Case learning scope is unavailable');
  const allowed = new Set(definition.requirements.map((r) => r.requirementId));
  if (!ids(requirementIds, allowed, 1, 2)) fail('Unknown requirementId or wrong identifier namespace');
  return {
    schemaVersion: 1, caseId, caseVersion, conceptId,
    title: definition.title, scenario: definition.scenario, aiClaim: definition.aiClaim,
    requirements: definition.requirements.filter((r) => requirementIds.includes(r.requirementId))
      .map(({ requirementId, text: requirementText }) => ({ requirementId, text: requirementText })),
    starterCode: definition.starterCode,
  };
}

function validateFactPack(pack) {
  if (!keys(pack, ['schemaVersion', 'caseId', 'caseVersion', 'conceptId', 'title', 'scenario', 'aiClaim', 'requirements', 'starterCode']) ||
      pack.schemaVersion !== 1 || !Array.isArray(pack.requirements)) fail('Invalid public fact pack shape');
  const canonical = buildFactPack({ caseId: pack.caseId, caseVersion: pack.caseVersion,
    conceptId: pack.conceptId, requirementIds: pack.requirements.map((r) => r?.requirementId) });
  if (JSON.stringify(pack) !== JSON.stringify(canonical)) fail('Public fact pack differs from reviewed source');
  return canonical;
}

function buildTeachingContext({ fixture, factPack, previousObservationId = null,
  previousAttemptId = null, previousActivityId = null }) {
  const pack = validateFactPack(factPack);
  const definition = convertLegacyCatalog(ROOT)[pack.caseId];
  const references = pack.requirements.map((r) => r.requirementId);
  const check = validatePreflight(fixture, definition, references);
  if (!check.ok || fixture.record.result.priorities.indexOf(pack.conceptId) < 0)
    fail(`Invalid diagnosis evidence: ${check.error || 'concept is not a priority'}`);
  const dimension = fixture.record.result.dimensions.find((d) => d.conceptId === pack.conceptId);
  const response = fixture.record.responses.find((r) => r.questionId === `${pack.caseId}-${pack.conceptId}`);
  if (!dimension || !response || !response.explanation?.includes(dimension.evidence))
    fail('Target evidence must quote the original learner explanation');
  const review = reviewedDiagnosis(fixture);
  if (review && (references.length !== 1 || references[0] !== review.requirementId))
    fail('Teaching target differs from reviewed synthetic evidence');
  const previousObservation = previousObservationId === null ? { state: 'not_observed' } :
    reviewedObservation({ observationId: previousObservationId, attemptId: previousAttemptId,
      activityId: previousActivityId, review, caseId: pack.caseId, caseVersion: pack.caseVersion,
      conceptId: pack.conceptId });
  const context = {
    schemaVersion: 1, caseId: pack.caseId, caseVersion: pack.caseVersion, conceptId: pack.conceptId,
    factPack: pack, targetSelection: review ? { state: 'reviewed', requirementId: review.requirementId,
      reviewId: review.reviewId } : { state: 'review-required' },
    diagnosis: { source: fixture.record.source, questionSource: fixture.record.questionSource,
      learner: { background: fixture.record.learner.background, goal: fixture.record.learner.goal },
      evidence: { questionId: response.questionId, optionId: response.optionId,
        explanation: response.explanation, quote: dimension.evidence, level: dimension.level,
        gap: dimension.gap }, priorities: [...fixture.record.result.priorities] },
    previousObservation,
  };
  if (review) reviewedContexts.set(context, { fixture: structuredClone(fixture), snapshot: structuredClone(context) });
  return context;
}

function requireReviewedContext(context) {
  const authority = reviewedContexts.get(context);
  if (!authority || !isDeepStrictEqual(context, authority.snapshot)) fail('Teaching target requires review');
  const pack = validateFactPack(context.factPack);
  const references = pack.requirements.map((r) => r.requirementId);
  const check = validatePreflight(authority.fixture, convertLegacyCatalog(ROOT)[pack.caseId], references);
  const review = reviewedDiagnosis(authority.fixture);
  if (!check.ok || !review || references.length !== 1 || references[0] !== review.requirementId ||
      context.caseId !== pack.caseId || context.caseVersion !== pack.caseVersion || context.conceptId !== pack.conceptId ||
      context.targetSelection.state !== 'reviewed' || context.targetSelection.reviewId !== review.reviewId ||
      context.targetSelection.requirementId !== review.requirementId)
    fail('Teaching target requires review');
}

function validateTeachingDraft(draft, context) {
  requireReviewedContext(context);
  if (!keys(draft, ['publicCard', 'internalAssessment', 'metadata'])) fail('Invalid teaching draft shape');
  const { publicCard: card, internalAssessment: assessment, metadata } = draft;
  if (!keys(card, ['caseId', 'caseVersion', 'conceptId', 'objective', 'requirementRefs', 'explanation', 'codeExample', 'exercise']) ||
      card.caseId !== context.caseId || card.caseVersion !== context.caseVersion || card.conceptId !== context.conceptId ||
      !text(card.objective, 240) || !text(card.explanation, 1200) ||
      !ids(card.requirementRefs, new Set(context.factPack.requirements.map((r) => r.requirementId)), 1, 2))
    fail('Invalid public card or requirement references');
  if (!keys(card.codeExample, ['kind', 'excerpt', 'prompt']) || card.codeExample.kind !== 'trace' ||
      !text(card.codeExample.excerpt, 600) || !context.factPack.starterCode.includes(card.codeExample.excerpt) ||
      !text(card.codeExample.prompt, 300)) fail('Code excerpt is not from public starter code');
  if (!keys(card.exercise, ['kind', 'prompt', 'publicHints']) || card.exercise.kind !== 'short-answer' ||
      !text(card.exercise.prompt, 400) || !Array.isArray(card.exercise.publicHints) ||
      card.exercise.publicHints.length > 3 || !card.exercise.publicHints.every((hint) => text(hint, 180)))
    fail('Invalid public exercise');
  if (!keys(assessment, ['targetGap', 'diagnosisEvidence', 'expectedElements', 'observableCriteria', 'followUpPolicy', 'status']) ||
      !text(assessment.targetGap, 200) || assessment.diagnosisEvidence !== context.diagnosis.evidence.quote ||
      !Array.isArray(assessment.expectedElements) || !assessment.expectedElements.length ||
      !assessment.expectedElements.every((x) => text(x, 240)) ||
      !Array.isArray(assessment.observableCriteria) || !assessment.observableCriteria.length ||
      !assessment.observableCriteria.every((x) => text(x, 240)) ||
      !keys(assessment.followUpPolicy, ['correct', 'partial', 'incorrect']) ||
      !Object.values(assessment.followUpPolicy).every((x) => text(x, 240)) || assessment.status !== 'untrusted-proposal')
    fail('Internal rubric is invalid or claims authority');
  if (!keys(metadata, ['schemaVersion', 'promptVersion', 'origin', 'validationStatus']) ||
      metadata.schemaVersion !== 1 || !text(metadata.promptVersion, 80) ||
      metadata.origin !== 'ai-proposal' || metadata.validationStatus !== 'structurally-validated-needs-review')
    fail('Invalid internal generation metadata');
  if (metadata.promptVersion === PROMPT_VERSION &&
      card.codeExample.excerpt !== selectReviewedCodeExcerpt(context).excerpt)
    fail('Bound code excerpt differs from reviewed public source selection');
  const privateCode = convertEvaluationCatalog(ROOT)[context.caseId].referenceCode;
  if ([card.objective, card.explanation, card.codeExample.prompt, card.exercise.prompt,
    ...card.exercise.publicHints].some((value) => value.includes(privateCode)))
    fail('Reference solution in public card');
  return draft;
}

function selectReviewedCodeExcerpt(context) {
  // The private WeakMap association and full snapshot are checked before selecting source.
  requireReviewedContext(context);
  const requirementId = context.targetSelection.requirementId;
  const excerpt = requirementId === 'empty-cart' ? 'return total / count;' :
    requirementId === 'discount' ? 'return total * (1 - discountPercent / 100);' : null;
  const starterCode = context.factPack.starterCode;
  const start = excerpt === null ? -1 : starterCode.indexOf(excerpt);
  if (start < 0 || starterCode.indexOf(excerpt, start + 1) !== -1)
    fail('No unique reviewed public starter-code excerpt');
  const requirement = context.factPack.requirements.find((item) => item.requirementId === requirementId);
  if (!requirement) fail('Reviewed requirement differs from public Fact Pack');
  const sha256 = (value) => createHash('sha256').update(value).digest('hex');
  const sourceReference = { caseId: context.caseId, caseVersion: context.caseVersion,
    requirementId, requirementTextSha256: sha256(requirement.text),
    starterCodeSha256: sha256(starterCode), excerptStart: start, excerptLength: excerpt.length,
    diagnosisQuestionId: context.diagnosis.evidence.questionId,
    diagnosisOptionId: context.diagnosis.evidence.optionId,
    reviewId: context.targetSelection.reviewId };
  return { excerpt, sourceReference };
}

function assembleModelTeachingDraft(proposal, context) {
  const { excerpt, sourceReference } = selectReviewedCodeExcerpt(context);
  validateModelProposal(proposal);
  const requirementId = context.targetSelection.requirementId;
  const content = proposal.publicContent;
  const publicProse = [content.objective, content.explanation, content.codeTracePrompt,
    content.exercise.prompt, ...content.exercise.publicHints];
  if (publicProse.some((value) => value.includes(context.diagnosis.evidence.quote)))
    fail('Private diagnosis evidence in public teaching content');
  const draft = {
    publicCard: { caseId: context.caseId, caseVersion: context.caseVersion,
      conceptId: context.conceptId, objective: content.objective,
      requirementRefs: [requirementId], explanation: content.explanation,
      codeExample: { kind: 'trace', excerpt, prompt: content.codeTracePrompt },
      exercise: { kind: 'short-answer', prompt: content.exercise.prompt,
        publicHints: [...content.exercise.publicHints] } },
    internalAssessment: { targetGap: proposal.internalProposal.targetGap,
      diagnosisEvidence: context.diagnosis.evidence.quote,
      expectedElements: [...proposal.internalProposal.expectedElements],
      observableCriteria: [...proposal.internalProposal.observableCriteria],
      followUpPolicy: { ...proposal.internalProposal.followUpPolicy }, status: 'untrusted-proposal' },
    metadata: { schemaVersion: 1, promptVersion: PROMPT_VERSION, origin: 'ai-proposal',
      validationStatus: 'structurally-validated-needs-review' },
  };
  return { draft, sourceReference };
}

function projectPublicCard(draft, context) {
  validateTeachingDraft(draft, context);
  const card = draft.publicCard;
  return { caseId: card.caseId, caseVersion: card.caseVersion, conceptId: card.conceptId,
    objective: card.objective, requirementRefs: [...card.requirementRefs], explanation: card.explanation,
    codeExample: { kind: card.codeExample.kind, excerpt: card.codeExample.excerpt, prompt: card.codeExample.prompt },
    exercise: { kind: card.exercise.kind, prompt: card.exercise.prompt,
      publicHints: [...card.exercise.publicHints] } };
}

module.exports = { buildFactPack, validateFactPack, buildTeachingContext, validateTeachingDraft,
  projectPublicCard, assembleModelTeachingDraft, selectReviewedCodeExcerpt };
