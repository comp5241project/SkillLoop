/** Offline experiment only. Importing never creates a provider or performs I/O. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { fixtures, reviewedVariants } = require('./m2-preflight/diagnosis-fixtures.json');
const { buildFactPack } = require('./m2-teaching-contract.cjs');
const { createAuthorizedLiveProvider, createQuotaTestSession, prepareOutputDirectory,
  assertOutputDirectory, LIVE_TOKEN, DEFAULT_MODEL, DEFAULT_PRICE_CEILING,
  PROMPT_VERSION, MODEL_OUTPUT_PROTOCOL_VERSION } =
  require('./m2-openrouter-provider.cjs');
const authored = structuredClone(require('../knowledge-map/learning-content.js')['cart-checkout']);

const DIMENSIONS = ['diagnosisRelevance', 'objectiveAlignment', 'factualCorrectness', 'explanationQuality',
  'exerciseAnswerability', 'assessmentConsistency', 'meaningfulPersonalization', 'privateDisclosure'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scenarios = Object.freeze([
  Object.freeze({ label: 'student-a', fixture: fixtures[0], requirementId: 'empty-cart' }),
  Object.freeze({ label: 'student-b', fixture: fixtures[1], requirementId: 'discount' }),
  Object.freeze({ label: 'reviewed-paraphrase', fixture: reviewedVariants[0], requirementId: 'empty-cart' }),
]);

function reviewRow(candidateId, scenario, requirementId, diagnosisEvidence) {
  return { candidateId, scenario, requirementId, diagnosisEvidence,
    reviewerId: null, reviewedAt: null,
    dimensions: Object.fromEntries(DIMENSIONS.map((name) => [name, { score: null, evidence: null }])),
    hardFailReason: null, total: null, decision: null };
}

function reviewCandidate(candidateId, scenario, requirementId, diagnosisEvidence, card, assessment) {
  return { candidateId, scenario, requirementId, diagnosisEvidence,
    card: { objective: card.objective, explanation: card.explanation, example: card.example,
      exercise: { kind: card.exercise.kind, prompt: card.exercise.prompt,
        options: card.exercise.options, publicHints: card.exercise.publicHints } },
    assessment: { expectedElements: assessment.expectedElements,
      observableCriteria: assessment.observableCriteria } };
}

async function writePrivate(file, value, key) {
  const serialized = JSON.stringify(value, null, 2);
  if (key && serialized.includes(key)) throw new Error('Secret appeared in evaluation artifact');
  await fs.writeFile(file, serialized, { flag: 'wx', mode: 0o600 });
}

async function runOfflineEvaluation({ mode = 'fake', fetchImpl, env = process.env,
  model = env.M2_OPENROUTER_MODEL || DEFAULT_MODEL, priceCeiling = DEFAULT_PRICE_CEILING,
  outputDirectory, repetitions = 3, budgetUsd = 1, liveOptIn = null,
  transportTimeoutMs = 19000, outerTimeoutMs = 20000, smoke = false,
  smokeScenario = 'student-a', campaignId = null } = {}) {
  const directory = assertOutputDirectory(outputDirectory);
  if (model !== DEFAULT_MODEL && priceCeiling === DEFAULT_PRICE_CEILING)
    throw new Error('A different model requires verified price ceilings');
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3 ||
      typeof budgetUsd !== 'number' || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 1 ||
      !Number.isInteger(outerTimeoutMs) || outerTimeoutMs < 1 || outerTimeoutMs > 20000 ||
      transportTimeoutMs >= outerTimeoutMs) throw new Error('Invalid experiment limits');
  if (!['fake', 'live'].includes(mode)) throw new Error('Invalid experiment mode');
  if (typeof smoke !== 'boolean' || (smoke && repetitions !== 1))
    throw new Error('Single-call smoke mode requires one repetition');
  if (smoke && !scenarios.some((scenario) => scenario.label === smokeScenario) ||
      campaignId !== null && !['m2-06b-real-evaluation', 'm2-06b-contract-v2-smoke'].includes(campaignId))
    throw new Error('Invalid experiment scenario or campaign');
  if (mode === 'fake' && (typeof fetchImpl !== 'function' || fetchImpl === globalThis.fetch))
    throw new Error('Fake mode requires injected fake fetch, not global fetch');
  const activeScenarios = smoke ? scenarios.filter((scenario) => scenario.label === smokeScenario) : scenarios;
  const limits = smoke ? { generationLimit: 1, attemptLimit: 1 } : {};
  const prepared = mode === 'live'
    ? await createAuthorizedLiveProvider({ env, liveOptIn, outputDirectory: directory, model,
      priceCeiling, repetitions, budgetUsd, transportTimeoutMs, outerTimeoutMs, ...limits })
    : { directory: await prepareOutputDirectory(directory), session: createQuotaTestSession({
      fetchImpl, model, priceCeiling, transportTimeoutMs, outerTimeoutMs, repetitions, budgetUsd,
      ...limits }) };
  const session = prepared.session;
  const runId = randomUUID();
  const rows = []; const sourceMap = []; const candidates = []; const recordFiles = [];
  let spentUsd = 0; let attemptedCalls = 0; let stopReason = null;
  for (const scenario of activeScenarios) {
    for (let runNumber = 1; runNumber <= repetitions; runNumber++) {
      // Local precheck: five cents per permitted attempt; the session guards transport.
      if (spentUsd + (smoke ? 0.05 : 0.10) > budgetUsd) { stopReason = 'budget-reservation'; break; }
      const factPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
        conceptId: 'edge-cases', requirementIds: [scenario.requirementId] });
      const started = performance.now();
      const beforeAttempts = session.snapshot().attempts;
      const result = await session.generateTeachingCard({ fixture: scenario.fixture, caseId: 'cart-checkout',
        caseVersion: 1, conceptId: 'edge-cases', requirementIds: [scenario.requirementId] },
      { timeoutMs: outerTimeoutMs });
      const events = session.drainTelemetry();
      const actualAttempts = session.snapshot().attempts - beforeAttempts;
      const attempts = Math.max(events.length, result.attempts ?? 0, actualAttempts);
      attemptedCalls += actualAttempts;
      const verifiable = actualAttempts > 0 && events.length === actualAttempts && events.every((event) =>
        event.usage && typeof event.billedCostUsd === 'number' && typeof event.estimatedCostUsd === 'number');
      const knownBilledCostUsd = events.reduce((sum, event) => sum + (event.billedCostUsd ?? 0), 0);
      const billedCostUsd = verifiable ? events.reduce((sum, event) => sum + event.billedCostUsd, 0) : null;
      const estimatedCostUsd = verifiable ? events.reduce((sum, event) => sum + event.estimatedCostUsd, 0) : null;
      spentUsd += knownBilledCostUsd;
      const candidateId = randomUUID();
      const record = { candidateId, scenario: scenario.label, runNumber, caseId: 'cart-checkout',
        caseVersion: 1, conceptId: 'edge-cases', factPackHash: hash(factPack),
        promptVersion: PROMPT_VERSION, modelOutputProtocolVersion: MODEL_OUTPUT_PROTOCOL_VERSION,
        requestHashes: events.map((event) => event.requestHash), model,
        routedProviders: events.map((event) => event.routedProvider),
        generationStatus: result.status, validationOutcome: result.status === 'success' ?
          'deterministic-pass-human-review-required' : result.code || result.status,
        attempts, latencyMs: Math.round(performance.now() - started),
        timeoutEvents: result.timeoutEvents ?? 0, usage: verifiable ? {
          inputTokens: events.reduce((sum, event) => sum + event.usage.inputTokens, 0),
          outputTokens: events.reduce((sum, event) => sum + event.usage.outputTokens, 0),
          cacheHitTokens: events.reduce((sum, event) => sum + event.usage.cacheHitTokens, 0),
          cacheMissTokens: events.reduce((sum, event) => sum + event.usage.cacheMissTokens, 0) } : null,
        billedCostUsd, estimatedCostUsd,
        knownBilledCostUsd, billingComplete: verifiable,
        attemptBilling: events.map((event) => ({ usage: event.usage, billedCostUsd: event.billedCostUsd,
          estimatedCostUsd: event.estimatedCostUsd, code: event.code })).concat(
          Array.from({ length: attempts - events.length }, () => ({ usage: null, billedCostUsd: null,
            estimatedCostUsd: null, code: 'UNRESOLVED' }))),
        draftFingerprint: result.status === 'success' ? hash(result) : null,
        humanReviewStatus: 'pending',
        // Internal-only evidence. Never feed this record to studentTeachingResponse.
        internalDraft: result.status === 'success' ? result : null,
        rawResponses: events.map((event) => event.rawContent),
        attemptCodes: events.map((event) => event.code) };
      if (campaignId) record.campaignId = campaignId;
      const file = path.join(directory, `${candidateId}.json`);
      await writePrivate(file, record, env.OPENROUTER_API_KEY);
      recordFiles.push(file);
      if (result.status === 'success') {
        const diagnosisEvidence = result.evaluationTrace.evidenceQuote;
        rows.push(reviewRow(candidateId, scenario.label, scenario.requirementId, diagnosisEvidence));
        candidates.push(reviewCandidate(candidateId, scenario.label, scenario.requirementId, diagnosisEvidence,
          { objective: result.publicCard.objective, explanation: result.publicCard.explanation,
            example: result.publicCard.codeExample.excerpt + '\n' + result.publicCard.codeExample.prompt,
            exercise: { kind: result.publicCard.exercise.kind, prompt: result.publicCard.exercise.prompt,
              options: [], publicHints: result.publicCard.exercise.publicHints } },
          result.internalAssessment));
      }
      sourceMap.push({ candidateId, source: 'model-proposal', scenario: scenario.label });
      if (events.some((event) => event.code === 'COST_EXCEEDS_ESTIMATE')) stopReason = 'pricing-exceeded';
      else if (!verifiable) stopReason = 'usage-or-cost-unverifiable';
      else if (smoke && result.status !== 'success') stopReason = 'generation-failed';
      else if (record.usage.inputTokens > 6000) stopReason = 'input-token-threshold';
      else if (spentUsd > budgetUsd) stopReason = 'budget-exceeded';
      else if (attemptedCalls > (smoke ? 1 : 18)) stopReason = 'attempt-limit';
      if (stopReason) break;
    }
    if (stopReason) break;
  }
  for (const scenario of activeScenarios) {
    for (const conceptId of scenario.label === 'student-a' ? ['edge-cases', 'code-reading'] : ['edge-cases']) {
      const candidateId = randomUUID();
      const card = authored[conceptId];
      const evidence = scenario.fixture.record.result.dimensions.find((x) => x.conceptId === 'edge-cases').evidence;
      rows.push(reviewRow(candidateId, scenario.label, scenario.requirementId, evidence));
      candidates.push(reviewCandidate(candidateId, scenario.label, scenario.requirementId, evidence,
        { objective: card.focus, explanation: card.explanation, example: card.example,
          exercise: { kind: card.exercise.kind, prompt: card.exercise.prompt,
            options: [...card.exercise.options], publicHints: [] } },
        { expectedElements: [card.exercise.options[card.exercise.correct]], observableCriteria: [] }));
      sourceMap.push({ candidateId, source: 'authored', conceptId, scenario: scenario.label });
    }
  }
  await writePrivate(path.join(directory, `${runId}-review-worksheet.json`), rows, env.OPENROUTER_API_KEY);
  await writePrivate(path.join(directory, `${runId}-review-candidates.json`), candidates, env.OPENROUTER_API_KEY);
  await writePrivate(path.join(directory, `${runId}-source-map.json`), sourceMap, env.OPENROUTER_API_KEY);
  return { status: stopReason ? 'stopped' : 'ready-for-human-review', stopReason,
    plannedGenerations: activeScenarios.length * repetitions, completedGenerations: recordFiles.length,
    attemptedCalls, billedCostUsd: stopReason === 'usage-or-cost-unverifiable' ? null : spentUsd,
    outputDirectory: directory, runId };
}

module.exports = { runOfflineEvaluation, assertOutputDirectory, reviewRow, LIVE_TOKEN };
