import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixtures, reviewedVariants } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { convertEvaluationCatalog } = require('../enhancement-v2/legacy-adapter.cjs');
const { convertLegacyCatalog } = require('../enhancement-v2/legacy-adapter.cjs');
const { validatePreflight } = require('../enhancement-v2/m2-preflight/validate.cjs');
const diagnosisModel = require('../learning-path/diagnosis-model.js');
const diagnosisData = require('../learning-path/data.js');
const { buildFactPack, validateFactPack, buildTeachingContext, validateTeachingDraft, projectPublicCard } =
  require('../enhancement-v2/m2-teaching-contract.cjs');

const aPack = () => buildFactPack({ caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['empty-cart'] });
const aContext = () => buildTeachingContext({ fixture: fixtures[0], factPack: aPack() });
const draftFor = (context) => ({
  publicCard: { caseId: context.caseId, caseVersion: context.caseVersion, conceptId: context.conceptId,
    objective: 'Trace the empty-cart behavior against the stated requirement.', requirementRefs: ['empty-cart'],
    explanation: 'The required result is numeric zero for an empty cart.',
    codeExample: { kind: 'trace', excerpt: 'return total / count;', prompt: 'What happens when both values are zero?' },
    exercise: { kind: 'short-answer', prompt: 'What should averagePrice([]) return, and what check would reveal the defect?',
      publicHints: ['Start with the published requirement.'] } },
  internalAssessment: { targetGap: 'Empty-cart result', diagnosisEvidence: context.diagnosis.evidence.quote,
    expectedElements: ['Numeric zero', 'Division by zero'], observableCriteria: ['States required result'],
    followUpPolicy: { correct: 'Try a nearby boundary.', partial: 'Trace the count.', incorrect: 'Review the requirement.' },
    status: 'untrusted-proposal' },
  metadata: { schemaVersion: 1, promptVersion: 'm2-card-1', origin: 'ai-proposal',
    validationStatus: 'structurally-validated-needs-review' },
});
const rejectsReview = (draft, context) => {
  assert.throws(() => validateTeachingDraft(draft, context), /requires review/);
  assert.throws(() => projectPublicCard(draft, context), /requires review/);
};

test('public fact pack is versioned, source-bound and contains only selected requirements', () => {
  const pack = aPack();
  assert.deepEqual(validateFactPack(pack), pack);
  assert.deepEqual(pack.requirements.map((r) => r.requirementId), ['empty-cart']);
  assert.match(pack.starterCode, /averagePrice/);
  for (const field of ['referenceCode', 'implementationNote', 'publicIssues', 'publicTests', 'evaluation', 'teacherDraft'])
    assert.equal(field in pack, false);
});

test('fact pack rejects wrong version, case, concept and all cross-namespace IDs', () => {
  const base = { caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['empty-cart'] };
  for (const change of [{ caseVersion: 2 }, { caseId: 'notes-save' }, { conceptId: 'unknown' },
    { requirementIds: ['discount-range'] }, { requirementIds: ['empty-average'] }, { requirementIds: ['missing'] }])
    assert.throws(() => buildFactPack({ ...base, ...change }));
  const changed = aPack(); changed.requirements[0].text = 'Invented requirement';
  assert.throws(() => validateFactPack(changed), /differs/);
  const nested = aPack(); nested.requirements[0].private = { answer: 'hidden' };
  assert.throws(() => validateFactPack(nested), /differs/);
});

test('teaching context traces actual diagnosis evidence and distinguishes observation states', () => {
  const context = aContext();
  assert.equal(context.previousObservation.state, 'not_observed');
  assert.equal(context.diagnosis.evidence.quote, fixtures[0].record.responses[3].explanation);
  const bPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases', requirementIds: ['discount'] });
  const b = buildTeachingContext({ fixture: fixtures[1], factPack: bPack,
    previousObservationId: 'cart-edge-trace-1', previousAttemptId: 'b-diagnosis-1',
    previousActivityId: 'reviewed-trace-1' });
  assert.equal(b.previousObservation.state, 'validated');
  assert.match(b.diagnosis.evidence.quote, /discount 0 and 100 only/);
  assert.deepEqual(buildTeachingContext({ fixture: fixtures[0], factPack: aPack(),
    previousObservationId: { state: 'validated', outcome: 'correct' } }).previousObservation, { state: 'untrusted' });
  assert.throws(() => buildTeachingContext({ fixture: fixtures[0], factPack: bPack }), /Teaching target/);
});

test('observations require reviewed learner, attempt, activity and record provenance', () => {
  const request = { previousObservationId: 'cart-edge-trace-1', previousAttemptId: 'b-diagnosis-1',
    previousActivityId: 'reviewed-trace-1' };
  const bPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['discount'] });
  assert.equal(buildTeachingContext({ fixture: fixtures[1], factPack: bPack, ...request }).previousObservation.state, 'validated');
  for (const input of [
    { fixture: fixtures[0], factPack: aPack(), ...request },
    { fixture: fixtures[1], factPack: bPack, ...request, previousAttemptId: 'a-diagnosis-1' },
    { fixture: fixtures[1], factPack: bPack, ...request, previousActivityId: 'different-activity' },
    { fixture: fixtures[1], factPack: bPack, ...request, previousObservationId: 'unknown' },
    { fixture: fixtures[1], factPack: bPack, previousObservationId: 'cart-edge-trace-1' },
  ]) {
    const observation = buildTeachingContext(input).previousObservation;
    assert.deepEqual(observation, { state: 'untrusted' });
    assert.equal(JSON.stringify(observation).includes('The learner stated'), false);
  }
  const missingProvenance = structuredClone(fixtures[1]); delete missingProvenance.provenance;
  const context = buildTeachingContext({ fixture: missingProvenance, factPack: bPack, ...request });
  assert.deepEqual(context.targetSelection, { state: 'review-required' });
  assert.deepEqual(context.previousObservation, { state: 'untrusted' });
});

test('reviewed variants select by validated record, while unsupported records require review', () => {
  const variant = reviewedVariants[0];
  assert.deepEqual(validatePreflight(variant, convertLegacyCatalog(process.cwd())['cart-checkout'], ['empty-cart']), { ok: true });
  assert.notEqual(variant.record.responses[3].explanation, fixtures[0].record.responses[3].explanation);
  const renamed = structuredClone(variant); renamed.fixtureId = 'arbitrary-new-label';
  const context = buildTeachingContext({ fixture: renamed, factPack: aPack() });
  assert.deepEqual(context.targetSelection, { state: 'reviewed', requirementId: 'empty-cart', reviewId: 'cart-empty-2' });
  assert.equal(aContext().targetSelection.requirementId, 'empty-cart');
  const bPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['discount'] });
  assert.equal(buildTeachingContext({ fixture: fixtures[1], factPack: bPack }).targetSelection.requirementId, 'discount');
  const unsupported = structuredClone(variant);
  unsupported.record.learner.goal = 'internship'; // still a valid Module 1 record, but not reviewed here
  const unresolved = buildTeachingContext({ fixture: unsupported, factPack: aPack() });
  assert.deepEqual(unresolved.targetSelection, { state: 'review-required' });
  assert.throws(() => validateTeachingDraft(draftFor(unresolved), unresolved), /requires review/);
  const ambiguous = structuredClone(variant);
  ambiguous.record.responses[3].explanation = 'I would investigate these edge cases further.';
  ambiguous.record.result = diagnosisModel.buildLocalDiagnosis(diagnosisData.findCase('cart-checkout'), ambiguous.record.responses);
  assert.deepEqual(validatePreflight(ambiguous, convertLegacyCatalog(process.cwd())['cart-checkout'], ['empty-cart']), { ok: true });
  assert.deepEqual(buildTeachingContext({ fixture: ambiguous, factPack: aPack() }).targetSelection,
    { state: 'review-required' });
});

test('context rejects invalid diagnosis, wrong version and fabricated evidence', () => {
  const wrong = structuredClone(fixtures[0]); wrong.caseVersion = 2;
  assert.throws(() => buildTeachingContext({ fixture: wrong, factPack: aPack() }), /Invalid diagnosis/);
  const falseEvidence = structuredClone(fixtures[0]);
  falseEvidence.record.result.dimensions[3].evidence = 'I passed all hidden tests.';
  assert.throws(() => buildTeachingContext({ fixture: falseEvidence, factPack: aPack() }), /Invalid diagnosis/);
  const missing = structuredClone(fixtures[0]); missing.record.responses.pop();
  assert.throws(() => buildTeachingContext({ fixture: missing, factPack: aPack() }), /Invalid diagnosis/);
});

test('valid draft is projected without rubric or metadata and does not alias source', () => {
  const context = aContext(); const draft = draftFor(context);
  assert.equal(validateTeachingDraft(draft, context), draft);
  const card = projectPublicCard(draft, context);
  assert.equal('internalAssessment' in card, false);
  assert.equal('metadata' in card, false);
  assert.equal(JSON.stringify(card).includes('untrusted-proposal'), false);
  card.requirementRefs[0] = 'changed'; card.exercise.publicHints[0] = 'changed';
  assert.equal(draft.publicCard.requirementRefs[0], 'empty-cart');
  assert.equal(draft.publicCard.exercise.publicHints[0], 'Start with the published requirement.');
});

test('draft rejects malformed fields, unknown nested data and private metadata in public structures', () => {
  const context = aContext();
  const variants = [
    (d) => { d.publicCard.requirementRefs = ['discount-range']; },
    (d) => { d.publicCard.caseVersion = 2; },
    (d) => { d.publicCard.codeExample.excerpt = 'return 999;'; },
    (d) => { d.publicCard.exercise.hiddenAnswer = 'zero'; },
    (d) => { d.publicCard.codeExample.private = { answer: 'zero' }; },
    (d) => { d.publicCard.internalAssessment = { answer: 'zero' }; },
    (d) => { d.publicCard.explanation = ''; },
    (d) => { d.internalAssessment.status = 'approved'; },
    (d) => { d.metadata.validationStatus = 'trusted'; },
    (d) => { d.internalAssessment.diagnosisEvidence = 'Fabricated evidence'; },
  ];
  for (const change of variants) {
    const draft = draftFor(context); change(draft);
    assert.throws(() => projectPublicCard(draft, context));
  }
  const solution = draftFor(context);
  solution.publicCard.explanation = convertEvaluationCatalog(process.cwd())['cart-checkout'].referenceCode;
  assert.throws(() => projectPublicCard(solution, context), /Reference solution/);
});

test('reviewed A, B and paraphrase retain authority at both draft boundaries', () => {
  const bPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['discount'] });
  for (const context of [aContext(),
    buildTeachingContext({ fixture: fixtures[1], factPack: bPack }),
    buildTeachingContext({ fixture: reviewedVariants[0], factPack: aPack() })]) {
    const draft = draftFor(context);
    draft.publicCard.requirementRefs = [context.targetSelection.requirementId];
    assert.equal(validateTeachingDraft(draft, context), draft);
    assert.deepEqual(projectPublicCard(draft, context).requirementRefs, draft.publicCard.requirementRefs);
  }
});

test('exact prior bypass: an unreviewed context cannot self-declare review', () => {
  const unsupported = structuredClone(reviewedVariants[0]);
  unsupported.record.learner.goal = 'internship';
  const context = buildTeachingContext({ fixture: unsupported, factPack: aPack() });
  const draft = draftFor(context);
  rejectsReview(draft, context);
  const forged = structuredClone(context);
  forged.targetSelection = { state: 'reviewed', requirementId: 'empty-cart', reviewId: 'made-up' };
  rejectsReview(draft, forged);
  context.targetSelection = { state: 'reviewed', requirementId: 'empty-cart', reviewId: 'cart-empty-2' };
  rejectsReview(draft, context);
});

test('copied targets, changed requirements and evidence cannot retain reviewed authority', () => {
  const bPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['discount'] });
  const b = buildTeachingContext({ fixture: fixtures[1], factPack: bPack });
  const unsupported = structuredClone(reviewedVariants[0]);
  unsupported.record.learner.goal = 'internship';
  const unreviewed = buildTeachingContext({ fixture: unsupported, factPack: aPack() });
  unreviewed.targetSelection = structuredClone(b.targetSelection);
  rejectsReview(draftFor(unreviewed), unreviewed);
  for (const change of [
    (c) => { c.targetSelection.reviewId = 'made-up'; },
    (c) => { c.targetSelection.requirementId = 'discount'; },
    (c) => { c.diagnosis.evidence.quote = 'Changed learner evidence'; },
    (c) => { c.factPack.requirements[0].requirementId = 'discount'; },
    (c) => { c.caseVersion = 2; },
  ]) {
    const context = aContext();
    const draft = draftFor(context);
    change(context);
    rejectsReview(draft, context);
  }
});

test('cloned or reconstructed reviewed contexts cannot manufacture authority', () => {
  const context = aContext();
  const draft = draftFor(context);
  rejectsReview(draft, structuredClone(context));
  rejectsReview(draft, JSON.parse(JSON.stringify(context)));
  rejectsReview(draft, { ...context });
});
