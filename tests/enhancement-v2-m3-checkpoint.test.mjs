import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createM3StudioServer } = require('../scripts/m3-studio-server.cjs');
const { createStudioSession } = require('../enhancement-v2/m3-studio-session.cjs');
const clone = structuredClone;
const form = () => ({ brief: { topic: 'Empty cart and numeric averages', learnerLevel: 'beginner',
  objectives: [{ objectiveId: 'obj-empty-cart', text: 'Explain the empty-cart average result.',
    requirementIds: ['empty-cart'] }], constraints: 'Use one trace.' },
content: { title: 'Trace the empty-cart average',
  objectives: [{ objectiveId: 'obj-empty-cart', text: 'Trace an empty cart and return numeric zero.',
    requirementIds: ['empty-cart'] }],
  explanation: 'The published case requires numeric zero for an empty cart. Check the count before dividing to avoid a zero denominator.',
  codeExample: { kind: 'trace', excerpt: 'return total / count;',
    prompt: 'Trace count and total when averagePrice receives an empty item array.' },
  exercises: [{ exerciseId: 'ex-empty-cart-manual', kind: 'short-answer',
    prompt: 'What should averagePrice([]) return and why must division be guarded?',
    requirementIds: ['empty-cart'], publicHints: ['Check the empty-cart requirement.'],
    teacherAnswerGuidance: ['Return numeric zero.', 'Avoid dividing by zero.'] }] } });

async function withServer(run) {
  const session = createStudioSession();
  const server = createM3StudioServer(session);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    if (body && Object.hasOwn(body, 'expectedRevision') && !Object.hasOwn(body, 'expectedDraftId'))
      body = { ...body, expectedDraftId: session.state().draft?.draftId ?? null };
    const response = await fetch(base + route, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const getState = async () => (await (await fetch(base + '/api/state')).json());
  try { await run({ session, post, getState }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('checkpoint saves a valid draft and reopen restores content at a newer revision', async () => withServer(async ({ post, getState }) => {
  const first = await post('/api/checkpoint', { expectedRevision: null, form: form() });
  assert.equal(first.status, 200);
  assert.equal(first.body.draft.revision, 1);
  assert.equal(first.body.checkpoint.revision, 1);
  const id = first.body.draft.draftId;
  const changed = form(); changed.content.explanation += ' This is a later local edit.';
  const second = await post('/api/manual', { expectedRevision: 1, form: changed });
  assert.equal(second.status, 200);
  assert.equal(second.body.draft.revision, 2);
  assert.equal(second.body.draft.draftId, id);
  assert.equal((await getState()).checkpoint.revision, 1);
  assert.equal((await post('/api/reopen-checkpoint', { expectedRevision: 2, confirmReplace: false })).status, 409);
  const reopened = await post('/api/reopen-checkpoint', { expectedRevision: 2, confirmReplace: true });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.draft.revision, 3);
  assert.equal(reopened.body.draft.draftId, id);
  assert.equal(reopened.body.draft.content.explanation, form().content.explanation);
  assert.equal(reopened.body.checkpoint.revision, 1);
  const preview = await post('/api/preview-accepted', {});
  assert.equal(preview.status, 200);
  assert.equal(JSON.stringify(preview.body).includes('teacherAnswerGuidance'), false);
}));

test('invalid checkpoint save leaves the previous checkpoint and draft intact', async () => withServer(async ({ post, getState }) => {
  await post('/api/checkpoint', { expectedRevision: null, form: form() });
  const before = await getState();
  const bad = form(); bad.content.exercises[0].teacherAnswerGuidance = [];
  const failed = await post('/api/checkpoint', { expectedRevision: 1, form: bad });
  assert.equal(failed.status, 422);
  assert.ok(failed.body.fields['content.exercises[0].teacherAnswerGuidance']);
  assert.deepEqual(await getState(), before);
}));

test('exported private JSON restores editable content in a fresh local session', async () => {
  let exported, oldId;
  await withServer(async ({ post }) => {
    const saved = await post('/api/checkpoint', { expectedRevision: null, form: form() });
    oldId = saved.body.draft.draftId;
    exported = await post('/api/export', { expectedRevision: 1 });
    assert.equal(exported.status, 200);
    assert.match(exported.body.filename, /^skillloop-cart-checkout-edge-cases-draft-[0-9a-f-]+\.json$/);
    assert.equal(exported.body.document.format, 'skillloop-teacher-draft-v1');
    assert.equal(exported.body.document.draft.caseRef.caseVersion, 1);
    assert.equal(exported.body.document.draft.revision, 1);
    assert.deepEqual(exported.body.document.draft.content.exercises[0].teacherAnswerGuidance,
      form().content.exercises[0].teacherAnswerGuidance);
    const serialized = JSON.stringify(exported.body.document);
    for (const secret of ['referenceCode', 'WeakMap', 'apiKey', 'privateEvaluation'])
      assert.equal(serialized.includes(secret), false);
  });
  await withServer(async ({ post, getState }) => {
    const imported = await post('/api/import', { expectedRevision: null, confirmReplace: true,
      jsonText: JSON.stringify(exported.body.document) });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.draft.origin, 'imported');
    assert.equal(imported.body.draft.revision, 1);
    assert.notEqual(imported.body.draft.draftId, oldId);
    assert.equal(imported.body.importSource.verified, false);
    assert.deepEqual(imported.body.draft.content, form().content);
    const edited = form(); edited.content.explanation += ' Continue editing after import.';
    const saved = await post('/api/manual', { expectedRevision: 1, form: edited });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.draft.revision, 2);
    assert.equal(saved.body.draft.origin, 'manual');
    assert.equal((await getState()).draft.content.explanation, edited.content.explanation);
    assert.equal((await post('/api/preview', edited)).status, 200);
  });
});

test('exported controlled Mock draft imports without recovering process-local trust', async () => {
  let document;
  await withServer(async ({ post }) => {
    const generated = await post('/api/proposal', { brief: form().brief });
    assert.equal(generated.status, 200);
    const accepted = await post('/api/accept', { expectedRevision: null,
      proposalId: generated.body.proposal.proposalId, confirmReplace: true });
    assert.equal(accepted.body.draft.origin, 'mock-proposal');
    const exported = await post('/api/export', { expectedRevision: 1 });
    assert.equal(exported.status, 200);
    document = exported.body.document;
    assert.equal(document.draft.provenance.origin, 'mock-proposal');
  });
  await withServer(async ({ post }) => {
    const imported = await post('/api/import', { expectedRevision: null,
      confirmReplace: true, jsonText: JSON.stringify(document) });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.draft.origin, 'imported');
    assert.deepEqual(imported.body.importSource, {
      declaredOrigin: 'mock-proposal', sourceRevision: 1, verified: false });
    const reexport = await post('/api/export', { expectedRevision: 1 });
    assert.equal(reexport.body.document.draft.provenance.origin, 'imported');
    assert.equal(reexport.body.document.draft.provenance.proposalId, null);
  });
});

test('corrupt JSON, wrong case facts and invalid references never partially import', async () => withServer(async ({ post, getState }) => {
  await post('/api/checkpoint', { expectedRevision: null, form: form() });
  const valid = (await post('/api/export', { expectedRevision: 1 })).body.document;
  const before = await getState();
  const candidates = ['{broken', ...[
    (value) => { value.draft.schemaVersion = 2; },
    (value) => { value.draft.status = 'published'; },
    (value) => { value.draft.caseRef.caseId = 'quiz-permissions'; },
    (value) => { value.draft.caseRef.caseVersion = 2; },
    (value) => { value.draft.caseRef.publicFactsDigest = '0'.repeat(64); },
    (value) => { value.draft.brief.objectives[0].requirementIds = ['issue-empty-cart']; },
    (value) => { value.draft.content.exercises[0].teacherAnswerGuidance = []; },
    (value) => { value.draft.content.exercises[0].privateTest = 'secret'; },
    (value) => { value.draft.provenance = { origin: 'mock-proposal',
      proposalId: 'forged', templateVersion: 'm3-mock-v1' }; },
    (value) => { value.draft.referenceCode = 'private'; },
  ].map((change) => { const value = clone(valid); change(value); return JSON.stringify(value); })];
  for (const jsonText of candidates) {
    const failed = await post('/api/import', { expectedRevision: 1, confirmReplace: true, jsonText });
    assert.equal(failed.status, 422);
    assert.deepEqual(await getState(), before);
  }
}));

test('two tab snapshots use authoritative revision; stale saves and checkpoints fail', async () => withServer(async ({ post, getState }) => {
  await post('/api/checkpoint', { expectedRevision: null, form: form() });
  const tabA = (await getState()).draft;
  const tabB = (await getState()).draft;
  assert.equal(tabA.revision, tabB.revision);
  const a = form(); a.content.explanation += ' Tab A saved this change.';
  const savedA = await post('/api/manual', { expectedRevision: tabA.revision, form: a });
  assert.equal(savedA.status, 200);
  assert.equal(savedA.body.draft.revision, 2);
  const b = form(); b.content.explanation += ' Tab B unsaved work remains local.';
  const stale = await post('/api/manual', { expectedRevision: tabB.revision, form: b });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'revision-conflict');
  assert.equal((await post('/api/checkpoint', { expectedRevision: tabB.revision, form: b })).status, 409);
  assert.equal((await post('/api/export', { expectedRevision: tabB.revision })).status, 409);
  assert.equal((await getState()).draft.content.explanation, a.content.explanation);
  assert.match(b.content.explanation, /unsaved work/);
  const current = await post('/api/manual', { expectedRevision: 2, form: b });
  assert.equal(current.status, 200);
  assert.equal(current.body.draft.revision, 3);
}));

test('import conflicts on stale revision and keeps the current valid session', async () => withServer(async ({ post, getState }) => {
  await post('/api/checkpoint', { expectedRevision: null, form: form() });
  const document = (await post('/api/export', { expectedRevision: 1 })).body.document;
  const changed = form(); changed.content.explanation += ' Newer edit.';
  await post('/api/manual', { expectedRevision: 1, form: changed });
  const before = await getState();
  const failed = await post('/api/import', { expectedRevision: 1, confirmReplace: true,
    jsonText: JSON.stringify(document) });
  assert.equal(failed.status, 409);
  assert.equal(failed.body.code, 'revision-conflict');
  assert.deepEqual(await getState(), before);
  const imported = await post('/api/import', { expectedRevision: 2, confirmReplace: true,
    jsonText: JSON.stringify(document) });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.draft.origin, 'imported');
  assert.equal(imported.body.draft.revision, 1);
  assert.equal((await getState()).checkpoint, null);
}));

test('same revision number from a replaced draft cannot authorize a stale tab', async () => withServer(async ({ post, getState }) => {
  const initial = await post('/api/checkpoint', { expectedRevision: null, form: form() });
  const oldId = initial.body.draft.draftId;
  const document = (await post('/api/export', { expectedRevision: 1 })).body.document;
  const imported = await post('/api/import', { expectedDraftId: oldId, expectedRevision: 1,
    confirmReplace: true, jsonText: JSON.stringify(document) });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.draft.revision, 1);
  assert.notEqual(imported.body.draft.draftId, oldId);
  const stale = await post('/api/manual', { expectedDraftId: oldId, expectedRevision: 1, form: form() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'revision-conflict');
  assert.equal((await getState()).draft.draftId, imported.body.draft.draftId);
}));
