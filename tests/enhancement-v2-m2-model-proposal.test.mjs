import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { fixtures, reviewedVariants } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { createMockTeachingProvider } = require('../enhancement-v2/m2-demo-mock.cjs');
const { proposalFromMockDraft } = require('./m2-model-proposal-fixture.cjs');
const { generateTeachingCard, studentTeachingResponse, reviewTeachingCard } =
  require('../enhancement-v2/m2-teaching-generator.cjs');
const { buildFactPack, buildTeachingContext, assembleModelTeachingDraft, validateTeachingDraft } =
  require('../enhancement-v2/m2-teaching-contract.cjs');
const { MODEL_OUTPUT_PROTOCOL_VERSION, PROMPT_VERSION, validateModelProposal } =
  require('../enhancement-v2/m2-model-proposal.cjs');

const input = (fixture, requirementId) => ({ fixture, caseId: 'cart-checkout',
  caseVersion: 1, conceptId: 'edge-cases', requirementIds: [requirementId] });
const provider = (change = (proposal) => proposal) => ({
  outputProtocolVersion: MODEL_OUTPUT_PROTOCOL_VERSION,
  async generate(request) {
    const mockDraft = await createMockTeachingProvider().generate(request);
    return change(proposalFromMockDraft(mockDraft), request);
  },
});

test('A, B and reviewed paraphrase bind separate trusted evidence and exact public source slices', async () => {
  const seen = [];
  for (const [fixture, requirementId, excerpt] of [
    [fixtures[0], 'empty-cart', 'return total / count;'],
    [fixtures[1], 'discount', 'return total * (1 - discountPercent / 100);'],
    [reviewedVariants[0], 'empty-cart', 'return total / count;'],
  ]) {
    let sent;
    const base = provider();
    const result = await generateTeachingCard(input(fixture, requirementId), {
      ...base, async generate(request) { sent = request; return base.generate(request); },
    });
    assert.equal(result.status, 'success');
    assert.equal(result.reviewStatus, 'human-review-required');
    assert.equal(result.generationMetadata.schemaVersion, 1);
    assert.equal(result.generationMetadata.promptVersion, PROMPT_VERSION);
    assert.equal(result.evaluationTrace.modelOutputProtocolVersion, 2);
    assert.equal(result.evaluationTrace.evidenceQuote,
      fixture.record.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence);
    assert.equal(result.publicCard.requirementRefs[0], requirementId);
    assert.equal(result.publicCard.codeExample.excerpt, excerpt);
    assert.equal(sent.case.selectedTraceExcerpt, excerpt);
    const factPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
      conceptId: 'edge-cases', requirementIds: [requirementId] });
    const ref = result.evaluationTrace.sourceReference;
    assert.equal(ref.requirementId, requirementId);
    assert.equal(ref.starterCodeSha256, createHash('sha256').update(factPack.starterCode).digest('hex'));
    assert.equal(factPack.starterCode.slice(ref.excerptStart, ref.excerptStart + ref.excerptLength), excerpt);
    assert.equal(ref.requirementTextSha256,
      createHash('sha256').update(factPack.requirements[0].text).digest('hex'));
    assert.deepEqual(studentTeachingResponse(result), { state: 'generated-pending-review' });
    assert.equal(reviewTeachingCard(result, 'synthetic-a-acceptance-approval').state,
      'generated-pending-review');
    assert.equal(JSON.stringify(result.publicCard).includes(result.evaluationTrace.evidenceQuote), false);
    assert.equal('sourceReference' in result.publicCard, false);
    seen.push(result.evaluationTrace.evidenceQuote);
  }
  assert.notEqual(seen[0], seen[1]);
  assert.notEqual(seen[0], seen[2]);
});

test('forged context and model-supplied source fields cannot gain authority', async () => {
  const factPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['empty-cart'] });
  const context = buildTeachingContext({ fixture: fixtures[0], factPack });
  const proposal = await provider().generate({ case: { caseId: 'cart-checkout',
    caseVersion: 1, conceptId: 'edge-cases' }, target: { requirementId: 'empty-cart',
    evidence: { quote: context.diagnosis.evidence.quote } } });
  for (const field of ['diagnosisEvidence', 'caseId', 'requirementRefs', 'codeExample', 'metadata']) {
    const forged = structuredClone(proposal);
    forged[field] = 'caller-controlled';
    assert.throws(() => validateModelProposal(forged));
    assert.equal((await generateTeachingCard(input(fixtures[0], 'empty-cart'),
      provider(() => forged))).status, 'invalid-output');
  }
  const copied = structuredClone(context);
  assert.throws(() => assembleModelTeachingDraft(proposal, copied), /requires review/);
  context.diagnosis.evidence.quote += ' edited';
  assert.throws(() => assembleModelTeachingDraft(proposal, context), /requires review/);
  const unreviewed = structuredClone(reviewedVariants[0]);
  unreviewed.record.learner.goal = 'internship';
  let calls = 0;
  const noCall = { outputProtocolVersion: 2, generate() { calls++; return proposal; } };
  assert.equal((await generateTeachingCard(input(unreviewed, 'empty-cart'), noCall)).status,
    'review-required');
  assert.equal(calls, 0);
});

test('model prose is never truncated and old whole-draft output is not silently converted', async () => {
  for (const change of [
    (p) => { p.publicContent.objective = 'x'.repeat(241); },
    (p) => { p.internalProposal.targetGap = 'x'.repeat(201); },
    (p) => { p.publicContent.exercise.publicHints = ['x'.repeat(181)]; },
    (p) => { p.publicContent.explanation = 'The empty-cart requirement is to return 999.'; },
  ]) {
    const result = await generateTeachingCard(input(fixtures[0], 'empty-cart'), provider((p) => {
      change(p); return p;
    }));
    assert.equal(result.status, 'invalid-output');
    assert.equal(result.publicCard, null);
    assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  }
  const wholeDraft = { outputProtocolVersion: 2,
    generate: (request) => createMockTeachingProvider().generate(request) };
  assert.equal((await generateTeachingCard(input(fixtures[0], 'empty-cart'), wholeDraft)).status,
    'invalid-output');
  const valid = await generateTeachingCard(input(fixtures[0], 'empty-cart'), provider());
  assert.equal(valid.status, 'success');
  const verifiedContext = buildTeachingContext({ fixture: fixtures[0],
    factPack: buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
      conceptId: 'edge-cases', requirementIds: ['empty-cart'] }) });
  const assembled = assembleModelTeachingDraft(await provider().generate({ case: { caseId: 'cart-checkout',
    caseVersion: 1, conceptId: 'edge-cases' }, target: { requirementId: 'empty-cart',
    evidence: { quote: verifiedContext.diagnosis.evidence.quote } } }), verifiedContext);
  assert.equal(validateTeachingDraft(assembled.draft, verifiedContext), assembled.draft);
  assembled.draft.publicCard.codeExample.excerpt = 'return total * (1 - discountPercent / 100);';
  assert.throws(() => validateTeachingDraft(assembled.draft, verifiedContext), /Bound code excerpt differs/);
});
