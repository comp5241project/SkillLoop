import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixtures, reviewedVariants } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const authored = require('../knowledge-map/learning-content.js')['cart-checkout'];
const { createTeachingDemonstration, selectAuthoredFallback, authoredComparators } =
  require('../enhancement-v2/m2-teaching-demo.cjs');
const { createMockTeachingProvider } = require('../enhancement-v2/m2-demo-mock.cjs');
const { generateTeachingCard, reviewTeachingCard, studentTeachingResponse } =
  require('../enhancement-v2/m2-teaching-generator.cjs');

test('A, B and reviewed paraphrase demonstrate distinct targets over one canonical case', async () => {
  const previews = [];
  for (const fixture of [fixtures[0], fixtures[1], reviewedVariants[0]]) {
    const demo = await createTeachingDemonstration(fixture);
    const preview = demo.internalPreview(); previews.push(preview);
    assert.equal(preview.visibility, 'internal-evaluation');
    assert.equal(preview.origin, 'mock-ai-proposal');
    assert.equal(preview.generationStatus, 'success');
    assert.equal(preview.reviewState, 'generated-pending-review');
    assert.equal(preview.caseId, 'cart-checkout');
    assert.equal(preview.caseVersion, 1);
    assert.equal(preview.conceptId, 'edge-cases');
    assert.equal(preview.target.diagnosisEvidence,
      fixture.record.result.dimensions.find((x) => x.conceptId === 'edge-cases').evidence);
    assert.equal(preview.card.requirementRefs[0], preview.target.requirementId);
    assert.equal(preview.card.codeExample.kind, 'trace');
    assert.equal(preview.card.exercise.kind, 'short-answer');
    assert.deepEqual(demo.studentDelivery(), { state: 'generated-pending-review' });
    const originalExplanation = preview.card.explanation;
    preview.card.explanation = 'Changed preview copy';
    assert.notEqual(demo.internalPreview().card.explanation, 'Changed preview copy');
    preview.card.explanation = originalExplanation;
  }
  assert.equal(new Set(previews.map((p) => p.publicFactsDigest)).size, 1);
  assert.deepEqual(previews.map((p) => p.target.requirementId), ['empty-cart', 'discount', 'empty-cart']);
  assert.notEqual(previews[0].card.objective, previews[1].card.objective);
  assert.notEqual(previews[0].card.explanation, previews[1].card.explanation);
  assert.notEqual(previews[0].card.codeExample.excerpt, previews[1].card.codeExample.excerpt);
  assert.notEqual(previews[0].card.exercise.prompt, previews[1].card.exercise.prompt);
  assert.equal(previews[0].card.exercise.prompt, previews[2].card.exercise.prompt);
  assert.notEqual(previews[0].target.diagnosisEvidence, previews[2].target.diagnosisEvidence);
});

test('authored fallback is an explicit safe projection of the canonical edge-cases card', async () => {
  const demo = await createTeachingDemonstration(fixtures[0]);
  const before = demo.internalPreview();
  assert.deepEqual(demo.studentDelivery(), { state: 'generated-pending-review' });
  const selected = demo.selectAuthoredFallback();
  assert.equal(selected.state, 'authored-fallback-selected');
  assert.equal(selected.origin, 'authored');
  assert.equal(selected.card.conceptId, 'edge-cases');
  assert.equal(selected.card.explanation, authored['edge-cases'].explanation);
  assert.equal(selected.card.example, authored['edge-cases'].example);
  assert.deepEqual(selected.card.exercise, {
    kind: authored['edge-cases'].exercise.kind, prompt: authored['edge-cases'].exercise.prompt,
    options: authored['edge-cases'].exercise.options,
  });
  assert.equal(JSON.stringify(selected).includes('internalAssessment'), false);
  assert.equal(JSON.stringify(selected).includes('evaluationTrace'), false);
  assert.equal('correct' in selected.card.exercise, false);
  assert.equal('focus' in selected.card, false);
  assert.deepEqual(demo.studentDelivery(), { state: 'generated-pending-review' });
  assert.deepEqual(demo.internalPreview(), before);
  selected.card.exercise.options[0] = 'changed copy';
  assert.equal(selectAuthoredFallback().card.exercise.options[0], authored['edge-cases'].exercise.options[0]);
});

test('authored comparison identifies code-reading separately without switching fallback concept', () => {
  const comparison = authoredComparators();
  assert.deepEqual(comparison.edgeCases, { origin: 'authored', card: selectAuthoredFallback().card });
  assert.equal(comparison.codeReading.origin, 'authored');
  assert.equal(comparison.codeReading.card.conceptId, 'code-reading');
  assert.equal(comparison.codeReading.card.explanation, authored['code-reading'].explanation);
  assert.equal(comparison.codeReading.card.exercise.prompt, authored['code-reading'].exercise.prompt);
  assert.equal(selectAuthoredFallback().card.conceptId, 'edge-cases');
});

test('provider error and invalid proposal never silently select authored content', async () => {
  let calls = 0;
  const failed = await createTeachingDemonstration(fixtures[0], { async generate() { calls++; throw new Error('unavailable'); } });
  assert.equal(calls, 1);
  assert.equal(failed.internalPreview().generationStatus, 'provider-error');
  assert.equal(failed.internalPreview().card, null);
  assert.deepEqual(failed.studentDelivery(), { state: 'rejected' });
  assert.equal('origin' in failed.studentDelivery(), false);
  assert.equal(failed.selectAuthoredFallback().origin, 'authored');
  assert.deepEqual(failed.studentDelivery(), { state: 'rejected' });
  const invalid = await createTeachingDemonstration(fixtures[1], { async generate() { return '{bad json'; } });
  assert.equal(invalid.internalPreview().generationStatus, 'invalid-output');
  assert.deepEqual(invalid.studentDelivery(), { state: 'rejected' });
  assert.equal(invalid.selectAuthoredFallback().card.explanation, authored['edge-cases'].explanation);
});

test('unreviewed diagnosis stays pending without provider call and can choose authored fallback', async () => {
  const changed = structuredClone(reviewedVariants[0]);
  changed.record.learner.goal = 'internship';
  let calls = 0;
  const demo = await createTeachingDemonstration(changed, { async generate() { calls++; throw new Error('must not call'); } });
  assert.equal(calls, 0);
  assert.equal(demo.internalPreview().generationStatus, 'review-required');
  assert.equal(demo.internalPreview().card, null);
  assert.deepEqual(demo.studentDelivery(), { state: 'rejected' });
  assert.equal(demo.selectAuthoredFallback().origin, 'authored');
  assert.equal(demo.internalPreview().generationStatus, 'review-required');
  const wrong = structuredClone(fixtures[0]); wrong.caseVersion = 2;
  assert.equal((await createTeachingDemonstration(wrong)).internalPreview().generationStatus, 'invalid-input');
});

test('demo Mock cannot use M2-04 synthetic approval; review and factual gates remain in force', async () => {
  const generated = await generateTeachingCard({ fixture: fixtures[0], caseId: 'cart-checkout',
    caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['empty-cart'] }, createMockTeachingProvider());
  assert.equal(generated.status, 'success');
  assert.equal(reviewTeachingCard(generated, 'synthetic-a-acceptance-approval').state, 'generated-pending-review');
  assert.deepEqual(studentTeachingResponse(generated), { state: 'generated-pending-review' });
  const contradiction = { async generate(request) { const d = await createMockTeachingProvider().generate(request);
    d.publicCard.explanation = 'The empty-cart requirement is to return 999.'; return d; } };
  const rejected = await createTeachingDemonstration(fixtures[0], contradiction);
  assert.equal(rejected.internalPreview().generationStatus, 'invalid-output');
  assert.deepEqual(rejected.studentDelivery(), { state: 'rejected' });
  assert.equal(rejected.selectAuthoredFallback().origin, 'authored');
  assert.equal(rejected.internalPreview().generationStatus, 'invalid-output');
});

test('explicit authored selection leaves a synthetically rejected AI draft rejected', async () => {
  const originalMock = createMockTeachingProvider();
  const b = await generateTeachingCard({ fixture: fixtures[1], caseId: 'cart-checkout',
    caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['discount'] }, {
    async generate(request) {
      const proposal = await originalMock.generate(request);
      proposal.metadata.promptVersion = 'mock-m2-1'; // Existing pinned M2-04 rejection fixture.
      return proposal;
    },
  });
  assert.equal(b.status, 'success');
  assert.equal(reviewTeachingCard(b, 'synthetic-b-acceptance-rejection').state, 'rejected');
  assert.deepEqual(studentTeachingResponse(b), { state: 'rejected' });
  assert.equal(selectAuthoredFallback().origin, 'authored');
  assert.deepEqual(studentTeachingResponse(b), { state: 'rejected' });
});
