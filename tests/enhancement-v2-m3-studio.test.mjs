import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { createM3StudioServer } = require('../scripts/m3-studio-server.cjs');
const { createStudioSession } = require('../enhancement-v2/m3-studio-session.cjs');
const { validateTeacherDraft } = require('../enhancement-v2/m3-teacher-draft.cjs');
const clone = structuredClone;
const brief = () => ({ topic: 'Empty cart and numeric averages', learnerLevel: 'beginner',
  objectives: [{ objectiveId: 'obj-empty-cart', text: 'Explain the empty-cart average result.',
    requirementIds: ['empty-cart'] }], constraints: 'Use one trace.' });
const form = () => ({ brief: brief(), content: { title: 'Trace the empty-cart average',
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
  const post = async (route, body, extraHeaders = {}) => {
    if (body && Object.hasOwn(body, 'expectedRevision') && !Object.hasOwn(body, 'expectedDraftId'))
      body = { ...body, expectedDraftId: session.state().draft?.draftId ?? null };
    const response = await fetch(base + route, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Studio-Request': '1', ...extraHeaders },
    body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const get = async (route) => fetch(base + route);
  try { await run({ base, post, get, session }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('real HTTP studio serves canonical public facts and manual draft creation', async () => withServer(async ({ post, get }) => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Teacher Authoring Studio/);
  const state = await (await get('/api/state')).json();
  assert.equal(state.case.caseId, 'cart-checkout');
  assert.ok(state.case.requirements.some((item) => item.requirementId === 'empty-cart'));
  assert.equal(JSON.stringify(state).includes('referenceCode'), false);
  const valid = await post('/api/validate', form());
  assert.deepEqual(valid, { status: 200, body: { valid: true } });
  assert.equal((await (await get('/api/state')).json()).draft, null);
  const saved = await post('/api/manual', { expectedRevision: null, form: form() });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.draft.status, 'draft-only');
  assert.equal(saved.body.draft.origin, 'manual');
  assert.equal((await (await get('/api/state')).json()).draft.draftId, saved.body.draft.draftId);
}));

test('Mock proposal stays server-held, acceptance preserves trusted provenance and needs confirmation', async () => withServer(async ({ post, get, session }) => {
  await post('/api/manual', { expectedRevision: null, form: form() });
  const generated = await post('/api/proposal', { brief: brief() });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.proposal.source, 'deterministic-mock');
  assert.equal(generated.body.proposal.brief.topic, brief().topic);
  assert.match(generated.body.proposal.explanation, /zero denominator/);
  assert.equal('caseRef' in generated.body.proposal, false);
  assert.equal('provenance' in generated.body.proposal, false);
  assert.equal('publicCase' in generated.body.proposal, false);
  const id = generated.body.proposal.proposalId;
  assert.equal((await post('/api/accept', { proposalId: id })).status, 409);
  assert.equal((await post('/api/accept', { proposalId: 'forged', confirmReplace: true })).status, 409);
  const accepted = await post('/api/accept', { proposalId: id, confirmReplace: true,
    expectedRevision: 1 });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.draft.origin, 'mock-proposal');
  assert.equal(accepted.body.draft.status, 'draft-only');
  assert.equal(session.state().draft.origin, 'mock-proposal');
  assert.equal((await post('/api/accept', { proposalId: id, confirmReplace: true })).status, 409);
  assert.equal((await (await get('/api/state')).json()).proposal, null);
}));

test('rejecting Mock keeps accepted draft and unsaved form content untouched', async () => withServer(async ({ post, get }) => {
  const saved = await post('/api/manual', { expectedRevision: null, form: form() });
  const generated = await post('/api/proposal', { brief: brief() });
  const unsaved = form(); unsaved.content.explanation += ' Unsaved teacher edit remains in the browser.';
  const rejected = await post('/api/reject', { proposalId: generated.body.proposal.proposalId });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.rejected, true);
  assert.deepEqual(rejected.body.draft, saved.body.draft);
  assert.equal((await (await get('/api/state')).json()).proposal, null);
  assert.match(unsaved.content.explanation, /Unsaved teacher edit/);
}));

test('editing explanation and exercise passes through HTTP validation and preview projection', async () => withServer(async ({ post, get }) => {
  const edited = form();
  edited.content.explanation += ' A teacher can discuss this branch before the return.';
  edited.content.exercises[0].prompt += ' Explain the relevant branch.';
  edited.content.exercises[0].teacherAnswerGuidance.push('Mention the zero-count guard.');
  const preview = await post('/api/preview', edited);
  assert.equal(preview.status, 200);
  assert.match(preview.body.preview.explanation, /teacher can discuss/);
  assert.match(preview.body.preview.exercises[0].prompt, /relevant branch/);
  const { case: publicCase } = await (await get('/api/state')).json();
  assert.deepEqual(preview.body.preview.requirements,
    publicCase.requirements.filter(({ requirementId }) => requirementId === 'empty-cart'));
  const publicJson = JSON.stringify(preview.body.preview);
  assert.equal(publicJson.includes('teacherAnswerGuidance'), false);
  assert.equal(publicJson.includes('zero-count guard'), false);
  assert.equal(publicJson.includes('publicFactsDigest'), false);
  assert.equal(publicJson.includes('provenance'), false);
  const saved = await post('/api/manual', { expectedRevision: null, form: edited });
  assert.equal(saved.body.draft.content.exercises[0].teacherAnswerGuidance.length, 3);
  const multiReference = form();
  multiReference.brief.objectives[0].requirementIds = ['empty-cart', 'discount'];
  multiReference.content.objectives[0].requirementIds = ['empty-cart', 'discount'];
  assert.equal((await post('/api/manual', { expectedRevision: saved.body.draft.revision,
    form: multiReference })).status, 200);
}));

test('invalid form returns field errors without replacing the accepted draft', async () => withServer(async ({ post, get }) => {
  const saved = await post('/api/manual', { expectedRevision: null, form: form() });
  const invalid = form(); invalid.brief.topic = 'x'; invalid.content.explanation = 'short';
  invalid.content.exercises[0].teacherAnswerGuidance = [];
  const response = await post('/api/manual', { expectedRevision: saved.body.draft.revision, form: invalid });
  assert.equal(response.status, 422);
  assert.ok(response.body.fields['brief.topic']);
  assert.ok(response.body.fields['content.explanation']);
  assert.ok(response.body.fields['content.exercises[0].teacherAnswerGuidance']);
  assert.deepEqual((await (await get('/api/state')).json()).draft, saved.body.draft);
  const wrongReference = form(); wrongReference.brief.objectives[0].requirementIds = ['issue-empty-cart'];
  assert.ok((await post('/api/proposal', { brief: wrongReference.brief })).body.fields['brief.objectives[0].requirementIds']);
}));

test('static browser surface renders text safely and has no publish route', async () => withServer(async ({ post, get }) => {
  const js = await (await get('/studio.js')).text();
  const html = await (await get('/')).text();
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML|document\.write|\beval\s*\(/);
  assert.doesNotMatch(html, /<button[^>]*>\s*Publish\s*<\/button>/i);
  assert.match(html, /Student-facing draft preview — not published/);
  const page = await get('/');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await post('/api/publish', {})).status, 404);
  const injected = form();
  injected.content.explanation += ' <img src=x onerror=alert(1)>';
  const preview = await post('/api/preview', injected);
  assert.equal(preview.status, 200);
  assert.match(preview.body.preview.explanation, /<img/);
  const source = await readFile(new URL('../enhancement-v2/studio/studio.js', import.meta.url), 'utf8');
  assert.equal(source.includes('innerHTML'), false);
}));

test('loopback server rejects foreign host and cross-origin or non-studio POSTs', async () => withServer(async ({ base, post }) => {
  assert.equal((await post('/api/manual', form(), { Origin: 'https://other.example' })).status, 403);
  const noHeader = await fetch(base + '/api/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form()) });
  assert.equal(noHeader.status, 403);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(base + '/', { headers: { Host: 'other.example' } }, (response) => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
}));

test('real studio event handlers preview current manual, adopted, imported and restored material', async () =>
  withServer(async ({ base, get, session }) => {
    class Element {
      constructor(tag = 'div', id = '') {
        this.tag = tag; this.id = id; this.dataset = {}; this.children = [];
        this.value = ''; this.hidden = false; this.listeners = new Map(); this._text = '';
      }
      set textContent(value) { this.replaceChildren(); this._text = String(value); }
      get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
      append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
      replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
      addEventListener(type, listener) { this.listeners.set(type, listener); }
      dispatch(type) { this.listeners.get(type)?.(); }
      focus() { this.focused = true; }
      get selectedOptions() { return this.children.filter((child) => child.selected); }
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
      querySelectorAll(selector) {
        const attribute = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
        const key = attribute?.[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const matches = (node) => selector.startsWith('#') ? node.id === selector.slice(1) :
          attribute && Object.hasOwn(node.dataset, key) &&
          (attribute[2] === undefined || node.dataset[key] === attribute[2]);
        const found = [];
        const visit = (node) => { for (const child of node.children) {
          if (matches(child)) found.push(child);
          visit(child);
        } };
        visit(this);
        return found;
      }
    }
    const root = new Element();
    const ids = ['requirements', 'starter-code', 'topic', 'learner-level', 'constraints',
      'title', 'explanation', 'code-excerpt', 'code-prompt', 'objectives', 'exercises',
      'editing-state', 'preview-panel', 'preview-title', 'preview-content', 'proposal-panel', 'proposal-content',
      'editor', 'message', 'add-objective', 'add-exercise', 'example-beginner',
      'example-intermediate', 'validate', 'manual', 'generate', 'preview-button', 'reject', 'accept',
      'checkpoint', 'reopen-checkpoint', 'export-json', 'import-file', 'import-json',
      'conflict-warning', 'reload-latest', 'revision-state', 'checkpoint-state'];
    const nodes = Object.fromEntries(ids.map((id) => [id, new Element('div', id)]));
    root.append(...Object.values(nodes));
    nodes['preview-panel'].hidden = true;
    nodes['proposal-panel'].hidden = true;
    const document = { createElement: (tag) => new Element(tag),
      querySelector: (selector) => root.querySelector(selector),
      querySelectorAll: (selector) => root.querySelectorAll(selector) };
    let confirmReplace = true;
    let holdPreview = false;
    let releasePreview;
    const source = await (await get('/studio.js')).text();
    vm.runInNewContext(source, { document, window: { confirm: () => confirmReplace },
      fetch: async (route, options) => {
        const hold = route === '/api/preview' && holdPreview;
        const response = await fetch(base + route, options);
        if (!hold) return response;
        const body = await response.json();
        await new Promise((resolve) => { releasePreview = resolve; });
        return { ok: response.ok, status: response.status, json: async () => body };
      } }, { filename: 'studio.js' });
    const waitFor = async (condition) => {
      for (let attempt = 0; attempt < 300; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Timed out waiting for studio UI state: ${nodes.message.textContent}`);
    };
    const input = (id, value) => { nodes[id].value = value; nodes.editor.dispatch('input'); };
    const rowValue = (row, name, value) => {
      row.querySelector(`[data-field="${name}"]`).value = value;
      nodes.editor.dispatch('input');
    };
    const click = (id) => nodes[id].dispatch('click');
    await waitFor(() => nodes.requirements.children.length === 5);
    const initial = form();
    for (const [id, value] of [['topic', initial.brief.topic], ['constraints', initial.brief.constraints],
      ['title', initial.content.title], ['explanation', initial.content.explanation],
      ['code-excerpt', initial.content.codeExample.excerpt],
      ['code-prompt', initial.content.codeExample.prompt]]) input(id, value);
    const objective = nodes.objectives.children[0], exercise = nodes.exercises.children[0];
    rowValue(objective, 'objectiveId', initial.brief.objectives[0].objectiveId);
    rowValue(objective, 'objectiveText', initial.brief.objectives[0].text);
    rowValue(objective, 'materialObjectiveText', initial.content.objectives[0].text);
    rowValue(exercise, 'exerciseId', initial.content.exercises[0].exerciseId);
    rowValue(exercise, 'exercisePrompt', initial.content.exercises[0].prompt);
    rowValue(exercise, 'publicHints', initial.content.exercises[0].publicHints.join('\n'));
    rowValue(exercise, 'teacherAnswerGuidance', initial.content.exercises[0].teacherAnswerGuidance.join('\n'));
    click('manual');
    await waitFor(() => session.state().draft?.origin === 'manual');
    await waitFor(() => nodes.message.textContent.startsWith('Manual draft kept'));
    const marker = 'PREVIEW BEFORE REPLACEMENT';
    input('explanation', `${marker}: the empty cart must return numeric zero before division.`);
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    assert.match(nodes['preview-content'].textContent, /PREVIEW BEFORE REPLACEMENT/);
    assert.doesNotMatch(nodes['preview-content'].textContent, /Avoid dividing by zero/);
    assert.equal(nodes['preview-title'].focused, true);

    holdPreview = true;
    click('preview-button');
    await waitFor(() => releasePreview);
    input('explanation', 'An intervening edit invalidates the pending preview.');
    input('explanation', `${marker}: the empty cart must return numeric zero before division.`);
    holdPreview = false;
    releasePreview();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(nodes['preview-panel'].hidden, true);
    assert.equal(nodes['preview-content'].textContent, '');

    input('explanation', `${marker}: edit after preview, still numeric zero before division.`);
    assert.equal(nodes['preview-panel'].hidden, true);
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    click('generate');
    await waitFor(() => !nodes['proposal-panel'].hidden);
    click('reject');
    await waitFor(() => nodes['proposal-panel'].hidden);
    assert.match(nodes.explanation.value, /edit after preview/);
    assert.equal(session.state().draft.origin, 'manual');

    click('generate');
    await waitFor(() => !nodes['proposal-panel'].hidden);
    confirmReplace = false;
    click('accept');
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(nodes.explanation.value, /edit after preview/);
    assert.equal(session.state().draft.origin, 'manual');
    assert.equal(nodes['proposal-panel'].hidden, false);
    confirmReplace = true;
    click('accept');
    await waitFor(() => session.state().draft?.origin === 'mock-proposal');
    await waitFor(() => nodes.message.textContent.startsWith('Mock Proposal accepted'));
    assert.equal(session.state().draft.status, 'draft-only');
    assert.equal(nodes['preview-panel'].hidden, true);
    assert.equal(nodes['preview-content'].textContent, '');
    await waitFor(() => nodes.explanation.value.includes('zero denominator'));
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    assert.match(nodes['preview-content'].textContent, /zero denominator/);
    assert.doesNotMatch(nodes['preview-content'].textContent, /PREVIEW BEFORE REPLACEMENT/);
    assert.doesNotMatch(nodes['preview-content'].textContent, /Return numeric 0/);

    input('topic', 'x');
    assert.equal(nodes['preview-panel'].hidden, true);
    click('preview-button');
    await waitFor(() => nodes.message.textContent === 'Correct the highlighted fields.');
    assert.equal(nodes['preview-panel'].hidden, true);
    assert.equal(nodes.topic.value, 'x');

    input('topic', initial.brief.topic);
    const external = form(); external.content.explanation += ' Updated from another browser tab.';
    session.saveManual({ expectedDraftId: session.state().draft.draftId,
      expectedRevision: 1, form: external });
    const unsaved = 'This valid explanation remains in the stale browser tab after a conflict.';
    input('explanation', unsaved);
    click('manual');
    await waitFor(() => !nodes['conflict-warning'].hidden);
    assert.match(nodes['conflict-warning'].textContent, /Revision conflict/);
    assert.equal(nodes['reload-latest'].hidden, false);
    assert.equal(nodes.explanation.value, unsaved);
    assert.equal(session.state().draft.revision, 2);
    confirmReplace = false;
    click('reload-latest');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(nodes.explanation.value, unsaved);
    confirmReplace = true;
    click('reload-latest');
    await waitFor(() => nodes['revision-state'].textContent.includes('revision 2'));
    assert.equal(nodes.explanation.value, external.content.explanation);
    assert.equal(nodes['conflict-warning'].hidden, true);

    const current = session.state().draft;
    const exported = session.exportDraft({ expectedDraftId: current.draftId,
      expectedRevision: current.revision });
    input('explanation', 'Unsaved import failure marker remains in this browser form after invalid JSON.');
    nodes['import-file'].files = [{ text: async () => '{broken' }];
    click('import-json');
    await waitFor(() => nodes.message.textContent.includes('not valid JSON'));
    assert.match(nodes.explanation.value, /Unsaved import failure marker/);
    assert.equal(session.state().draft.revision, 2);
    nodes['import-file'].files = [{ text: async () => JSON.stringify(exported.document) }];
    click('import-json');
    await waitFor(() => nodes.message.textContent.startsWith('Imported content'));
    assert.equal(session.state().draft.origin, 'imported');
    assert.equal(nodes['preview-panel'].hidden, true);
    assert.equal(nodes['preview-content'].textContent, '');
    assert.match(nodes['revision-state'].textContent, /imported from declared manual \(unverified\)/);
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    assert.match(nodes['preview-content'].textContent, /Updated from another browser tab/);
    assert.doesNotMatch(nodes['preview-content'].textContent, /Unsaved import failure marker|Return numeric 0/);

    input('topic', 'x');
    click('manual');
    await waitFor(() => nodes.message.textContent === 'Correct the highlighted fields.');
    assert.equal(session.state().draft.origin, 'imported');
    assert.match(nodes['revision-state'].textContent, /imported from declared manual \(unverified\)/);
    assert.equal(nodes.topic.value, 'x');
    input('topic', initial.brief.topic);
    input('explanation', `${external.content.explanation} Saved after import.`);
    click('manual');
    await waitFor(() => nodes.message.textContent.startsWith('Manual draft kept'));
    assert.equal(session.state().draft.origin, 'manual');
    assert.equal(session.state().draft.revision, 2);
    assert.match(nodes['revision-state'].textContent, /revision 2 · manual/);
    assert.doesNotMatch(nodes['revision-state'].textContent, /imported from declared/);

    nodes['import-file'].files = [{ text: async () => JSON.stringify(exported.document) }];
    click('import-json');
    await waitFor(() => nodes.message.textContent.startsWith('Imported content'));
    assert.match(nodes['revision-state'].textContent, /imported from declared manual \(unverified\)/);
    const imported = session.state().draft;
    session.saveManual({ expectedDraftId: imported.draftId, expectedRevision: imported.revision,
      form: external });
    const stillUnsaved = `${external.content.explanation} Unsaved after conflict.`;
    input('explanation', stillUnsaved);
    click('manual');
    await waitFor(() => !nodes['conflict-warning'].hidden);
    assert.equal(nodes.explanation.value, stillUnsaved);
    assert.match(nodes['revision-state'].textContent, /imported from declared manual \(unverified\)/);

    click('reload-latest');
    await waitFor(() => nodes['revision-state'].textContent.includes('revision 2 · manual'));
    nodes['import-file'].files = [{ text: async () => JSON.stringify(exported.document) }];
    click('import-json');
    await waitFor(() => nodes.message.textContent.startsWith('Imported content'));
    click('checkpoint');
    await waitFor(() => nodes.message.textContent.startsWith('Checkpoint saved'));
    assert.equal(session.state().draft.origin, 'imported');
    assert.match(nodes['revision-state'].textContent, /imported from declared manual \(unverified\)/);
    input('explanation', `${external.content.explanation} Checkpoint update after import.`);
    click('checkpoint');
    await waitFor(() => nodes['revision-state'].textContent.includes('revision 2 · manual'));
    assert.doesNotMatch(nodes['revision-state'].textContent, /imported from declared/);
    const checkpointExplanation = nodes.explanation.value;
    const htmlLike = '<img src=x onerror=alert(1)>';
    input('explanation', `${checkpointExplanation} Later edit ${htmlLike}`);
    click('manual');
    await waitFor(() => nodes['revision-state'].textContent.includes('revision 3 · manual'));
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    assert.ok(nodes['preview-content'].textContent.includes(htmlLike));
    click('reopen-checkpoint');
    await waitFor(() => nodes.message.textContent.startsWith('Checkpoint content restored'));
    assert.equal(nodes['preview-panel'].hidden, true);
    assert.equal(nodes.explanation.value, checkpointExplanation);
    click('preview-button');
    await waitFor(() => !nodes['preview-panel'].hidden);
    assert.ok(nodes['preview-content'].textContent.includes(checkpointExplanation));
    assert.doesNotMatch(nodes['preview-content'].textContent, /Later edit|Return numeric 0/);
  }));
