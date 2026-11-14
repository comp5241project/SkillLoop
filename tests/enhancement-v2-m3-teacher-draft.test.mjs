import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { convertStudentCatalog, convertEvaluationCatalog } = require('../enhancement-v2/legacy-adapter.cjs');
const { createMockTeacherAuthor } = require('../enhancement-v2/m3-mock-author.cjs');
const { makeCaseRef, validateCaseRef, validateTeacherDraft, validateTeacherProposal,
  createManualDraft, generateTeacherProposal, adoptTeacherProposal, rejectTeacherProposal,
  draftPreview, stableSerialize } = require('../enhancement-v2/m3-teacher-draft.cjs');
const clone = structuredClone;
const ref = () => makeCaseRef({ caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' });
const briefA = () => ({ topic: 'Empty cart and numeric averages', learnerLevel: 'beginner',
  objectives: [{ objectiveId: 'obj-empty-cart', text: 'Explain the empty-cart average result.',
    requirementIds: ['empty-cart'] }], constraints: 'Use one trace and one short-answer exercise.' });
const briefB = () => ({ topic: 'Discount boundary validation', learnerLevel: 'intermediate',
  objectives: [{ objectiveId: 'obj-discount', text: 'Check both inclusive discount endpoints.',
    requirementIds: ['discount'] }], constraints: 'Include values just outside the range.' });
const manualContent = () => ({ title: 'Trace the empty-cart average',
  objectives: [{ objectiveId: 'obj-empty-cart', text: 'Trace an empty cart and return numeric zero.',
    requirementIds: ['empty-cart'] }],
  explanation: 'The published case allows an empty cart. It requires a numeric zero for its total and average. Check for an empty count before dividing.',
  codeExample: { kind: 'trace', excerpt: 'return total / count;',
    prompt: 'Trace count and total when averagePrice receives an empty item array.' },
  exercises: [{ exerciseId: 'ex-empty-cart-manual', kind: 'short-answer',
    prompt: 'What should averagePrice([]) return and why must the division be guarded?',
    requirementIds: ['empty-cart'], publicHints: ['Check the empty-cart requirement.'],
    teacherAnswerGuidance: ['Return numeric zero.', 'Avoid dividing by zero.'] }] });
const manual = () => createManualDraft({ caseRef: ref(), brief: briefA(), content: manualContent() });
const mock = createMockTeacherAuthor();

test('manual TeacherDraft is valid, versioned and draft-only without a provider', () => {
  const draft = manual();
  assert.equal(validateTeacherDraft(draft), draft);
  assert.equal(draft.schemaVersion, 1);
  assert.equal(draft.status, 'draft-only');
  assert.equal(draft.revision, 1);
  assert.equal(draft.provenance.origin, 'manual');
  assert.equal(draft.provenance.proposalId, null);
  assert.equal(draft.caseRef.kind, 'case-bound');
});

test('case reference digest is stable over canonical M1 Student View and not a second fact copy', () => {
  const publicCase = convertStudentCatalog(root)['cart-checkout'];
  const privateCase = convertEvaluationCatalog(root)['cart-checkout'];
  assert.equal(validateCaseRef(ref()).starterCode, publicCase.starterCode);
  assert.equal(ref().publicFactsDigest, makeCaseRef().publicFactsDigest);
  assert.equal(stableSerialize({ b: 1, a: { z: 2, x: 3 } }),
    stableSerialize({ a: { x: 3, z: 2 }, b: 1 }));
  const serialized = JSON.stringify(manual());
  assert.equal(serialized.includes(publicCase.starterCode), false);
  assert.equal(serialized.includes(privateCase.referenceCode), false);
  assert.equal('requirements' in manual().caseRef, false);
});

test('unsupported case, version and concept fail before authoring', () => {
  for (const identity of [
    { caseId: 'quiz-permissions', caseVersion: 1, conceptId: 'edge-cases' },
    { caseId: 'cart-checkout', caseVersion: 2, conceptId: 'edge-cases' },
    { caseId: 'cart-checkout', caseVersion: 1, conceptId: 'software-testing' },
  ]) assert.throws(() => makeCaseRef(identity), /Unsupported/);
  const wrong = ref(); wrong.caseVersion = 2;
  assert.throws(() => validateCaseRef(wrong), /Unsupported/);
});

test('beginner empty-cart Mock proposal has grounded objectives, trace and exercise', async () => {
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  assert.equal(validateTeacherProposal(proposal), proposal);
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.provenance.origin, 'mock-proposal');
  assert.deepEqual(proposal.content.objectives[0].requirementIds, ['empty-cart']);
  assert.match(proposal.content.explanation, /zero denominator/);
  assert.equal(proposal.content.codeExample.excerpt, 'return total / count;');
  assert.match(proposal.content.exercises[0].prompt, /averagePrice\(\[\]\)/);
  assert.ok(proposal.content.exercises[0].teacherAnswerGuidance.length > 0);
});

test('intermediate discount Mock proposal covers inclusive endpoints and invalid neighbors', async () => {
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefB() }, mock);
  assert.deepEqual(proposal.content.objectives[0].requirementIds, ['discount']);
  assert.match(proposal.content.explanation, /0 through 100/);
  assert.match(proposal.content.codeExample.prompt, /-1, 0, 100 and 101/);
  assert.match(proposal.content.exercises[0].prompt, /accept\/reject/);
  assert.deepEqual(proposal.content.exercises[0].teacherAnswerGuidance.slice(0, 2),
    ['Reject -1 and 101.', 'Accept 0 and 100.']);
});

test('Mock scenarios differ in target, teaching depth, code observation and exercise design', async () => {
  const a = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  const b = await generateTeacherProposal({ caseRef: ref(), brief: briefB() }, mock);
  assert.deepEqual(a.caseRef, b.caseRef);
  for (const key of ['objectives', 'explanation', 'codeExample', 'exercises'])
    assert.notDeepEqual(a.content[key], b.content[key]);
  assert.notEqual(a.content.objectives[0].requirementIds[0], b.content.objectives[0].requirementIds[0]);
});

test('adoption is explicit, creates a separate editable draft and preserves Mock provenance', async () => {
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  assert.equal('draftId' in proposal, false);
  const before = clone(proposal);
  const draft = adoptTeacherProposal(proposal);
  assert.equal(draft.status, 'draft-only');
  assert.equal(draft.provenance.proposalId, proposal.proposalId);
  assert.equal(draft.provenance.origin, 'mock-proposal');
  assert.deepEqual(proposal, before);
  draft.content.explanation = 'A teacher can edit this draft text without changing its case reference.';
  assert.notEqual(draft.content.explanation, proposal.content.explanation);
  assert.deepEqual(draft.caseRef, proposal.caseRef);
});

test('rejection returns an unchanged draft snapshot and never adopts content', async () => {
  const draft = manual();
  const snapshot = clone(draft);
  const proposal = await generateTeacherProposal({ caseRef: draft.caseRef, brief: draft.brief, draft }, mock);
  const rejected = rejectTeacherProposal(proposal, draft);
  assert.equal(rejected.decision, 'rejected');
  assert.deepEqual(rejected.draft, snapshot);
  assert.deepEqual(draft, snapshot);
  assert.notEqual(rejected.draft, draft);
});

test('manual creation accepts teacher-supplied material without any Mock call', () => {
  const draft = manual();
  assert.equal(draft.content.explanation, manualContent().explanation);
  assert.equal(draft.provenance.origin, 'manual');
});

test('unknown requirements and issue/test IDs cannot substitute for requirementId', async () => {
  for (const wrongId of ['missing-requirement', 'empty-cart-issue', 'empty-cart-test']) {
    const brief = briefA(); brief.objectives[0].requirementIds = [wrongId];
    assert.throws(() => createManualDraft({ caseRef: ref(), brief, content: manualContent() }), /requirementId/);
    await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief }, mock), /requirementId/);
  }
  const source = require('../docs/team-samples/samples.json').cases['cart-checkout'];
  for (const wrongId of [source.issues[0].issueId, source.tests[0].testId]) {
    const brief = briefA(); brief.objectives[0].requirementIds = [wrongId];
    assert.throws(() => createManualDraft({ caseRef: ref(), brief, content: manualContent() }), /requirementId/);
  }
});

test('modified public facts, digest and caller-supplied fact objects are rejected', async () => {
  const altered = ref(); altered.publicFactsDigest = '0'.repeat(64);
  assert.throws(() => createManualDraft({ caseRef: altered, brief: briefA(), content: manualContent() }), /digest/);
  const proposalInput = { caseRef: ref(), brief: briefA(), publicCase: { starterCode: 'forged' } };
  await assert.rejects(generateTeacherProposal(proposalInput, mock), /Invalid|modified|public/);
  const publicCase = convertStudentCatalog(root)['cart-checkout']; publicCase.starterCode = 'forged';
  await assert.rejects(mock.generate({ caseRef: ref(), brief: briefA(), publicCase }), /modified public case/);
  assert.equal(validateCaseRef(ref()).starterCode.includes('return total / count;'), true);
});

test('provider receives only a detached M1 Student View and cannot rewrite canonical facts', async () => {
  const original = convertStudentCatalog(root)['cart-checkout'];
  let captured;
  const provider = { generate(request) {
    captured = clone(request);
    request.publicCase.requirements[0].text = 'provider mutation';
    request.publicCase.starterCode = 'provider mutation';
    return manualContent();
  } };
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, provider);
  assert.deepEqual(proposal.provenance, { origin: 'unverified-provider', templateVersion: null });
  assert.deepEqual(Object.keys(captured).sort(), ['brief', 'caseRef', 'publicCase']);
  assert.deepEqual(captured.publicCase, original);
  for (const field of ['referenceCode', 'publicIssues', 'publicTests', 'teacherDraft'])
    assert.equal(field in captured.publicCase, false);
  assert.equal(validateCaseRef(proposal.caseRef).starterCode, original.starterCode);
  assert.deepEqual(proposal.brief, briefA());
});

test('custom providers cannot acquire or forge controlled Mock provenance', async () => {
  const mockProposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  const provider = { source: 'deterministic-mock', origin: 'mock-proposal',
    templateVersion: 'm3-mock-v1', providerVersion: 'm3-mock-v1',
    generate: async () => clone(mockProposal.content) };
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, provider);
  assert.deepEqual(proposal.provenance, { origin: 'unverified-provider', templateVersion: null });
  assert.equal(validateTeacherProposal(proposal), proposal);
  const adopted = adoptTeacherProposal(proposal);
  assert.deepEqual(adopted.provenance, { origin: 'unverified-provider',
    proposalId: proposal.proposalId, templateVersion: null });
  assert.equal(validateTeacherDraft(adopted), adopted);
  assert.equal(JSON.stringify(draftPreview(adopted)).includes('provenance'), false);

  const forged = clone(proposal);
  forged.provenance = { origin: 'mock-proposal', templateVersion: 'm3-mock-v1' };
  assert.throws(() => validateTeacherProposal(forged), /provenance/);
  assert.throws(() => adoptTeacherProposal(forged), /provenance/);
  assert.equal(validateTeacherProposal(mockProposal), mockProposal);
  const clonedMock = clone(mockProposal);
  assert.throws(() => validateTeacherProposal(clonedMock), /provenance/);
  assert.throws(() => adoptTeacherProposal(clonedMock), /provenance/);
  const importedMock = JSON.parse(JSON.stringify(mockProposal));
  assert.throws(() => validateTeacherProposal(importedMock), /provenance/);
  assert.throws(() => adoptTeacherProposal(importedMock), /provenance/);
  const mockDraft = adoptTeacherProposal(mockProposal);
  assert.equal(mockDraft.status, 'draft-only');
  assert.equal(validateTeacherDraft(clone(mockDraft)).provenance.origin, 'mock-proposal');
  mockProposal.content.explanation += ' Changed after Mock generation.';
  assert.throws(() => validateTeacherProposal(mockProposal), /provenance/);
  const forgedDraft = manual();
  forgedDraft.provenance = clone(mockDraft.provenance);
  assert.throws(() => validateTeacherDraft(forgedDraft), /provenance/);
  assert.equal(manual().provenance.origin, 'manual');
  await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief: briefA(),
    origin: 'mock-proposal' }, provider), /Invalid/);
});

test('strict nested fields exclude evaluation material and preview excludes teacher answers', async () => {
  const draft = manual();
  const secret = clone(draft); secret.content.exercises[0].hiddenAnswer = 'private';
  assert.throws(() => validateTeacherDraft(secret), /exercise/);
  const secretBrief = clone(draft); secretBrief.brief.objectives[0].issueId = 'private';
  assert.throws(() => validateTeacherDraft(secretBrief), /objective/);
  const secretCase = clone(draft); secretCase.caseRef.referenceCode = 'private';
  assert.throws(() => validateTeacherDraft(secretCase), /case reference/);
  const hidden = clone(draft);
  Object.defineProperty(hidden.content, 'referenceCode', { value: 'private', enumerable: false });
  assert.throws(() => validateTeacherDraft(hidden), /content/);
  const hiddenManual = manualContent();
  Object.defineProperty(hiddenManual, 'referenceCode', { value: 'private', enumerable: false });
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(),
    content: hiddenManual }), /content/);
  const symbol = clone(draft); symbol.brief[Symbol('private')] = 'private';
  assert.throws(() => validateTeacherDraft(symbol), /brief/);
  const arraySecret = clone(draft);
  arraySecret.content.exercises[0].publicHints.privateEvaluation = 'private';
  assert.throws(() => validateTeacherDraft(arraySecret), /exercise/);
  const arrayManual = manualContent();
  arrayManual.exercises[0].teacherAnswerGuidance.privateEvaluation = 'private';
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(),
    content: arrayManual }), /exercise/);
  const copiedRepair = clone(draft);
  copiedRepair.content.explanation += convertEvaluationCatalog(root)['cart-checkout'].referenceCode;
  assert.throws(() => validateTeacherDraft(copiedRepair), /Reference repair/);
  const preview = draftPreview(draft);
  assert.equal(preview.status, 'draft-preview-only');
  assert.equal(JSON.stringify(preview).includes('teacherAnswerGuidance'), false);
  assert.equal(JSON.stringify(preview).includes('Avoid dividing by zero'), false);
  assert.equal(JSON.stringify(preview).includes('provenance'), false);
  assert.equal(JSON.stringify(preview).includes('publicFactsDigest'), false);
  preview.objectives[0].requirementIds[0] = 'changed';
  preview.exercises[0].publicHints[0] = 'changed';
  assert.deepEqual(draft.content.objectives[0].requirementIds, ['empty-cart']);
  assert.deepEqual(draft.content.exercises[0].publicHints, ['Check the empty-cart requirement.']);
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  const wrong = clone(proposal); wrong.content.teacherDraft = { secret: 'private' };
  assert.throws(() => validateTeacherProposal(wrong), /content/);
  const mergedKey = clone(proposal); delete mergedKey.brief; delete mergedKey.caseRef;
  mergedKey['brief|caseRef'] = { private: 'hidden' };
  assert.throws(() => validateTeacherProposal(mergedKey), /identity/);
});

test('published, approved, unknown and extra status fields are rejected', async () => {
  for (const status of ['published', 'approved', 'unknown']) {
    const draft = manual(); draft.status = status;
    assert.throws(() => validateTeacherDraft(draft), /draft-only/);
  }
  const extra = manual(); extra.privateEvaluation = {};
  assert.throws(() => validateTeacherDraft(extra), /draft-only/);
  const proposal = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  for (const status of ['published', 'approved', 'rejected']) {
    const wrong = clone(proposal); wrong.status = status;
    assert.throws(() => validateTeacherProposal(wrong), /status/);
  }
});

test('duplicate and invalid objective or exercise IDs are rejected', () => {
  const duplicateObjective = briefA(); duplicateObjective.objectives.push(clone(duplicateObjective.objectives[0]));
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: duplicateObjective,
    content: manualContent() }), /Duplicate objectiveId/);
  const wrongObjective = briefA(); wrongObjective.objectives[0].objectiveId = 'empty-cart';
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: wrongObjective,
    content: manualContent() }), /objective/);
  const duplicateExercise = manualContent(); duplicateExercise.exercises.push(clone(duplicateExercise.exercises[0]));
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(),
    content: duplicateExercise }), /Duplicate exerciseId/);
  const wrongExercise = manualContent(); wrongExercise.exercises[0].exerciseId = 'test-empty-cart';
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(), content: wrongExercise }), /exercise/);
});

test('missing teaching content, answer guidance and noncanonical code are rejected', () => {
  const noAnswer = manualContent(); noAnswer.exercises[0].teacherAnswerGuidance = [];
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(), content: noAnswer }), /answer guidance/);
  const badCode = manualContent(); badCode.codeExample.excerpt = 'return referenceCode;';
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(), content: badCode }), /canonical public starter/);
  const short = manualContent(); short.explanation = 'Too short';
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(), content: short }), /teaching content/);
  const oversized = manualContent(); oversized.explanation = 'a'.repeat(2001);
  assert.throws(() => createManualDraft({ caseRef: ref(), brief: briefA(), content: oversized }), /teaching content/);
});

test('adoption updates only a matching base revision and always stays draft-only', async () => {
  const draft = manual();
  const original = clone(draft);
  const proposal = await generateTeacherProposal({ caseRef: draft.caseRef, brief: draft.brief, draft }, mock);
  const updated = adoptTeacherProposal(proposal, draft);
  assert.equal(updated.revision, draft.revision + 1);
  assert.equal(updated.draftId, draft.draftId);
  assert.equal(updated.status, 'draft-only');
  assert.deepEqual(updated.caseRef, draft.caseRef);
  assert.deepEqual(draft, original);
  assert.throws(() => adoptTeacherProposal(proposal, updated), /stale/);
  const different = manual(); assert.throws(() => adoptTeacherProposal(proposal, different), /stale/);
  assert.throws(() => adoptTeacherProposal(proposal, null), /draft-only|stale/);
  const unbound = await generateTeacherProposal({ caseRef: ref(), brief: briefA() }, mock);
  assert.throws(() => adoptTeacherProposal(unbound, draft), /cannot replace/);
});

test('invalid Mock output is rejected before it can become a Proposal or Draft', async () => {
  const invalidProvider = { generate: async () => ({ ...manualContent(), teacherSecret: true }) };
  await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief: briefA() }, invalidProvider), /content/);
  const hiddenProvider = { generate: async () => {
    const content = manualContent();
    Object.defineProperty(content.exercises[0], 'hiddenAnswer', { value: 'private', enumerable: false });
    return content;
  } };
  await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief: briefA() }, hiddenProvider), /exercise/);
  await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief: briefA() }, null), /provider/);
  const unsupported = briefA(); unsupported.learnerLevel = 'advanced';
  await assert.rejects(generateTeacherProposal({ caseRef: ref(), brief: unsupported }, mock), /No reviewed Mock template/);
});
