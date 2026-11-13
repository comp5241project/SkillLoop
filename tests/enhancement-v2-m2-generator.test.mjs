import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixtures, reviewedVariants } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { generateTeachingCard } = require('../enhancement-v2/m2-teaching-generator.cjs');
const { convertEvaluationCatalog } = require('../enhancement-v2/legacy-adapter.cjs');
const { buildFactPack, buildTeachingContext, projectPublicCard } = require('../enhancement-v2/m2-teaching-contract.cjs');

const input = (fixture, requirementId) => ({ fixture, caseId: 'cart-checkout', caseVersion: 1,
  conceptId: 'edge-cases', requirementIds: [requirementId] });
const makeDraft = (request) => {
  const empty = request.target.requirementId === 'empty-cart';
  return { publicCard: { caseId: request.case.caseId, caseVersion: request.case.caseVersion,
    conceptId: request.case.conceptId,
    objective: empty ? 'Trace empty-cart behavior.' : 'Check inclusive discount boundaries.',
    requirementRefs: [request.target.requirementId],
    explanation: empty ? 'For an empty cart, total and count are zero; 0/0 yields NaN, but the requirement says numeric 0.'
      : 'Discounts 0 and 100 are valid endpoints; -1 and 101 must be rejected.',
    codeExample: { kind: 'trace', excerpt: empty ? 'return total / count;' : 'return total * (1 - discountPercent / 100);',
      prompt: empty ? 'Trace both zero values.' : 'Trace the unchecked discount.' },
    exercise: { kind: 'short-answer', prompt: empty ? 'What must averagePrice([]) return?'
      : 'Which of -1, 0, 100 and 101 are accepted?', publicHints: ['Use the published requirement.'] } },
    internalAssessment: { targetGap: empty ? 'Empty-cart result' : 'Discount boundary',
      diagnosisEvidence: request.target.evidence.quote,
      expectedElements: empty ? ['numeric 0', 'NaN from 0/0'] : ['accept 0 and 100', 'reject -1 and 101'],
      observableCriteria: ['Names the requirement and expected behavior'],
      followUpPolicy: { correct: 'Try a related input.', partial: 'Trace the boundary.', incorrect: 'Read the requirement.' },
      status: 'untrusted-proposal' },
    metadata: { schemaVersion: 1, promptVersion: 'mock-m2-1', origin: 'ai-proposal',
      validationStatus: 'structurally-validated-needs-review' } };
};
const spy = (respond) => {
  const calls = [];
  return { calls, provider: { async generate(request) { calls.push(structuredClone(request)); return respond(request, calls.length); } } };
};

test('reviewed A and B generate distinct valid mock cards from the same public case', async () => {
  for (const [fixture, requirementId] of [[fixtures[0], 'empty-cart'], [fixtures[1], 'discount']]) {
    const { calls, provider } = spy((request) => JSON.stringify(makeDraft(request)));
    const result = await generateTeachingCard(input(fixture, requirementId), provider);
    assert.equal(result.status, 'success'); assert.equal(calls.length, 1);
    assert.equal(result.publicCard.requirementRefs[0], requirementId);
    assert.equal(result.evaluationTrace.requirementId, requirementId);
    assert.equal(result.evaluationTrace.evidenceQuote, fixture.record.responses[3].explanation);
    assert.equal(result.internalAssessment.status, 'untrusted-proposal');
    assert.equal(result.reviewStatus, 'human-review-required');
    assert.equal('internalAssessment' in result.publicCard, false);
    assert.equal('generationMetadata' in result.publicCard, false);
    const request = calls[0];
    assert.deepEqual(Object.keys(request).sort(), ['case','learner','previousObservation','schemaVersion','target','task']);
    const privateCode = convertEvaluationCatalog(process.cwd())['cart-checkout'].referenceCode;
    assert.equal(JSON.stringify(request).includes(privateCode), false);
    for (const forbidden of ['referenceCode','hiddenAssertions','internalAssessment','reviewId','learnerId','attemptId','teacherDraft'])
      assert.equal(JSON.stringify(request).includes(`"${forbidden}"`), false);
  }
});

test('reviewed paraphrase works, while unreviewed and forged contexts never call provider', async () => {
  const { calls, provider } = spy(makeDraft);
  const good = await generateTeachingCard(input(reviewedVariants[0], 'empty-cart'), provider);
  assert.equal(good.status, 'success'); assert.equal(calls.length, 1);
  const unreviewed = structuredClone(reviewedVariants[0]); unreviewed.record.learner.goal = 'internship';
  assert.equal((await generateTeachingCard(input(unreviewed, 'empty-cart'), provider)).status, 'review-required');
  assert.equal(calls.length, 1);
  const forged = { ...input(unreviewed, 'empty-cart'), targetSelection: { state: 'reviewed' } };
  assert.equal((await generateTeachingCard(forged, provider)).status, 'invalid-input');
  const reconstructed = buildTeachingContext({ fixture: fixtures[0], factPack: buildFactPack({
    caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['empty-cart'] }) });
  assert.throws(() => projectPublicCard(makeDraft({ case: reconstructed.factPack, target: {
    requirementId: 'empty-cart', evidence: { quote: reconstructed.diagnosis.evidence.quote } } }),
    structuredClone(reconstructed)), /requires review/);
  assert.equal((await generateTeachingCard({ ...input(fixtures[0], 'empty-cart'), context: reconstructed }, provider)).status, 'invalid-input');
  assert.equal(calls.length, 1);
});

test('invalid inputs and untrusted observations skip provider calls', async () => {
  const { calls, provider } = spy(makeDraft);
  for (const change of [{ caseVersion: 2 }, { caseId: 'notes-save' }, { requirementIds: ['discount-range'] },
    { requirementIds: ['discount'] }]) {
    assert.equal((await generateTeachingCard({ ...input(fixtures[0], 'empty-cart'), ...change }, provider)).status, 'invalid-input');
  }
  const bad = await generateTeachingCard({ ...input(fixtures[1], 'discount'),
    previousObservationId: 'cart-edge-trace-1', previousAttemptId: 'wrong',
    previousActivityId: 'reviewed-trace-1' }, provider);
  assert.equal(bad.status, 'invalid-input'); assert.equal(calls.length, 0);
});

test('malformed and contradictory mock output never yields a public card', async () => {
  const mutators = [
    () => '{bad json',
    (r) => { const d = makeDraft(r); d.publicCard.requirementRefs = ['discount']; return d; },
    (r) => { const d = makeDraft(r); d.publicCard.explanation = 'Invented requirement'; d.publicCard.caseVersion = 2; return d; },
    (r) => { const d = makeDraft(r); d.publicCard.exercise.hiddenAnswer = 'zero'; return d; },
    (r) => { const d = makeDraft(r); d.publicCard.codeExample.excerpt = 'return 999;'; return d; },
    (r) => { const d = makeDraft(r); d.internalAssessment.status = 'approved'; return d; },
  ];
  for (const respond of mutators) {
    const { calls, provider } = spy(respond);
    const result = await generateTeachingCard(input(fixtures[0], 'empty-cart'), provider);
    assert.equal(result.status, 'invalid-output'); assert.equal(result.publicCard, null);
    assert.equal(calls.length, 1);
  }
});

test('transient failures retry once; permanent failures and invalid outputs do not retry', async () => {
  const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
  const transient = spy((request, count) => { if (count === 1) throw timeout; return makeDraft(request); });
  const recovered = await generateTeachingCard(input(fixtures[0], 'empty-cart'), transient.provider);
  assert.equal(recovered.status, 'success'); assert.equal(recovered.attempts, 2);
  assert.equal(transient.calls.length, 2);
  const exhausted = spy(() => { throw timeout; });
  const failed = await generateTeachingCard(input(fixtures[0], 'empty-cart'), exhausted.provider);
  assert.equal(failed.status, 'provider-error'); assert.equal(failed.publicCard, null);
  assert.equal(exhausted.calls.length, 2);
  const permanent = spy(() => { throw new Error('provider rejected'); });
  assert.equal((await generateTeachingCard(input(fixtures[0], 'empty-cart'), permanent.provider)).status, 'provider-error');
  assert.equal(permanent.calls.length, 1);
  const hanging = spy(() => new Promise(() => {}));
  const timedOut = await generateTeachingCard(input(fixtures[0], 'empty-cart'), hanging.provider, { timeoutMs: 5 });
  assert.equal(timedOut.status, 'provider-error'); assert.equal(timedOut.publicCard, null);
  assert.equal(hanging.calls.length, 1); // Unsettled provider work must not overlap a retry.
});
