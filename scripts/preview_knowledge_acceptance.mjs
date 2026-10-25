// Run only against a confirmed disposable preview project. Credentials are read
// from the terminal without echo and are never written to disk or printed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import handler from '../api/knowledge.mjs';

if (process.env.KNOWLEDGE_PREVIEW_WRITES !== 'confirmed') {
  throw new Error('Set KNOWLEDGE_PREVIEW_WRITES=confirmed only for a non-production preview project.');
}
process.loadEnvFile('.env.local');
if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  throw new Error('An interactive terminal is required for test account passwords.');
}

function secret(label) {
  process.stdout.write(`${label}: `);
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\r' || character === '\n') {
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

process.stdin.setRawMode(true);
process.stdin.resume();
const teacherPassword = await secret('Teacher test password');
const studentPassword = await secret('Student test password');
process.stdin.setRawMode(false);
process.stdin.pause();

const origin = 'https://preview.local';
let teacher;
let student;
async function call(op, { method = 'GET', cookie, body, query = {} } = {}) {
  const url = new URL('/api/knowledge', origin);
  url.searchParams.set('op', op);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await handler.fetch(new Request(url, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  const data = await response.json();
  const cookies = response.headers.getSetCookie();
  if (cookie && cookies.length) {
    const parts = new Map(cookie.split('; ').map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index), part.slice(index + 1)];
    }));
    for (const value of cookies) {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      parts.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const refreshed = [...parts].map(([name, token]) => `${name}=${token}`).join('; ');
    if (cookie === teacher) teacher = refreshed;
    if (cookie === student) student = refreshed;
  }
  return { status: response.status, data, cookies };
}
function ok(result, label, expected = 200) {
  assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.data)}`);
  return result.data;
}
async function login(email, password) {
  const result = await call('login', { method: 'POST', body: { email, password } });
  ok(result, `${email} login`);
  return result.cookies.map((value) => value.split(';', 1)[0]).join('; ');
}

teacher = await login('teacher@example.com', teacherPassword);
student = await login('student@example.com', studentPassword);
assert.equal(ok(await call('session', { cookie: teacher }), 'teacher session').role, 'teacher');
assert.equal(ok(await call('session', { cookie: student }), 'student session').role, 'student');

if (process.argv.includes('--concurrent-only')) {
  const graphId = process.env.KNOWLEDGE_PREVIEW_GRAPH_ID;
  if (!graphId) throw new Error('Set KNOWLEDGE_PREVIEW_GRAPH_ID to the preview QA graph.');
  const draft = ok(await call('draft', { cookie: teacher, query: { graph: graphId } }), 'draft before concurrent saves').draft;
  const body = { graphId, payload: draft.payload, expectedRevision: draft.revision };
  const results = await Promise.all([1, 2].map(() => call('draft', { method: 'POST', cookie: teacher, body })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409],
    `Concurrent saves did not produce one winner and one conflict: ${JSON.stringify(results.map((result) => result.status))}`);
  const latest = ok(await call('draft', { cookie: teacher, query: { graph: graphId } }), 'draft after concurrent saves').draft;
  assert.deepEqual(latest.payload, draft.payload, 'Identical concurrent saves changed draft content.');
  assert.notEqual(latest.revision, draft.revision, 'Winning save did not advance the revision.');
  process.stdout.write(`${JSON.stringify({ graphId, oneSaveAccepted: true, staleSaveRejected: true,
    payloadPreserved: true, revisionAdvanced: true })}\n`);
  process.exit(0);
}

if (process.argv.includes('--import-only')) {
  const graphId = process.env.KNOWLEDGE_PREVIEW_GRAPH_ID;
  if (!graphId) throw new Error('Set KNOWLEDGE_PREVIEW_GRAPH_ID to the preview QA graph.');
  const referenceKey = `${graphId}:start`;
  assert.ok(ok(await call('personal', { cookie: student }), 'student personal before import').nodes
    .some((node) => node.id === referenceKey), 'Preview QA reference must exist before import.');
  const noteKey = `note:${randomUUID()}`;
  const edgeId = randomUUID();
  ok(await call('import-personal', { method: 'POST', cookie: student, body: {
    nodes: [{ kind: 'note', id: noteKey, title: 'QA imported browser note',
      body: 'Non-production import acceptance record.', x: 320, y: 240 }],
    edges: [{ id: edgeId, source: referenceKey, target: noteKey,
      reason: 'A restored browser note connected to an existing reference.' }],
  } }), 'account import');
  const personal = ok(await call('personal', { cookie: student }), 'student personal after import');
  assert.ok(personal.nodes.some((node) => node.id === noteKey && node.title === 'QA imported browser note'));
  assert.ok(personal.edges.some((edge) => edge.id === edgeId && edge.source === referenceKey && edge.target === noteKey));
  assert.ok(!ok(await call('personal', { cookie: teacher }), 'teacher personal after import').nodes
    .some((node) => node.id === noteKey));
  process.stdout.write(`${JSON.stringify({ graphId, importedNote: true, importedLink: true,
    existingReferencePreserved: true, crossAccountIsolation: true })}\n`);
  process.exit(0);
}

if (process.argv.includes('--reason-only')) {
  const graphId = process.env.KNOWLEDGE_PREVIEW_GRAPH_ID;
  if (!graphId) throw new Error('Set KNOWLEDGE_PREVIEW_GRAPH_ID to the preview QA graph.');
  const personal = ok(await call('personal', { cookie: student }), 'student personal');
  const edge = personal.edges.find((item) => item.source === `${graphId}:start` && item.kind === 'personal');
  assert.ok(edge, 'Preview QA personal edge was not found.');
  const rejected = await call('update-personal-edge', { method: 'POST', cookie: teacher,
    body: { id: edge.id, reason: 'Teacher must not alter a student connection.' } });
  assert.equal(rejected.status, 404, `Non-owner update returned ${rejected.status}: ${JSON.stringify(rejected.data)}`);
  const bearer = (cookie) => cookie.split('; ').find((part) => part.startsWith('sl_knowledge_access='))?.slice('sl_knowledge_access='.length);
  async function directPatch(cookie, body) {
    const url = new URL('/rest/v1/skillloop_personal_edges', process.env.SUPABASE_URL);
    url.searchParams.set('id', `eq.${edge.id}`);
    url.searchParams.set('select', 'id,reason');
    const response = await fetch(url, { method: 'PATCH', headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${bearer(cookie)}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    }, body: JSON.stringify(body) });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) : null };
  }
  const rlsDenied = await directPatch(teacher, { reason: 'Teacher direct REST update must also be denied.' });
  assert.ok([200, 204].includes(rlsDenied.status) && (!rlsDenied.data || rlsDenied.data.length === 0),
    `Database RLS did not deny the non-owner: ${JSON.stringify(rlsDenied)}`);
  const columnDenied = await directPatch(student, { source_key: edge.target });
  assert.equal(columnDenied.status, 403, `Column grant unexpectedly allowed source edit: ${JSON.stringify(columnDenied)}`);
  const reason = 'Student owner verified this preview connection after migration.';
  ok(await call('update-personal-edge', { method: 'POST', cookie: student,
    body: { id: edge.id, reason } }), 'owner connection update');
  const persisted = ok(await call('personal', { cookie: student }), 'updated student personal').edges.find((item) => item.id === edge.id);
  assert.deepEqual({ source: persisted.source, target: persisted.target, reason: persisted.reason },
    { source: edge.source, target: edge.target, reason });
  process.stdout.write(`${JSON.stringify({ graphId, ownerUpdate: 200, nonOwnerUpdate: rejected.status,
    directNonOwnerRows: rlsDenied.data?.length || 0, sourceColumnWriteDenied: columnDenied.status,
    endpointsPreserved: true, persisted: true })}\n`);
  process.exit(0);
}

let graphId;
let version1;
let noteId;
let edgeId;
if (!process.env.KNOWLEDGE_PREVIEW_GRAPH_ID) {
ok(await call('public-graphs'), 'initial directory');
const title = `QA Knowledge UX ${new Date().toISOString().slice(0, 10)}`;
const created = ok(await call('create-graph', { method: 'POST', cookie: teacher, body: { title } }), 'create graph', 201);
graphId = created.id;
process.stdout.write(`Preview QA graph created: ${graphId}\n`);
assert.equal((await call('public', { query: { graph: graphId } })).status, 404);
assert.equal((await call('draft', { cookie: student, query: { graph: graphId } })).status, 403);
assert.ok(!ok(await call('public-graphs'), 'draft-only directory').graphs.some((graph) => graph.id === graphId));

const draft = ok(await call('draft', { cookie: teacher, query: { graph: graphId } }), 'teacher draft').draft;
assert.equal(draft.revision, created.revision);
const payload = structuredClone(draft.payload);
payload.topics[0].title = 'Starting concept';
payload.topics.push({ ...structuredClone(payload.topics[0]), id: 'review', title: 'Review concept',
  description: 'A second concept for the preview acceptance flow.', order: 2, position: { x: 420, y: 80 } });
payload.relations.push({ id: 'start-review', source: 'start', target: 'review', type: 'supports',
  reason: 'The starting concept supports the review concept.' });
payload.events.push({ id: 'qa-case', title: 'Preview acceptance case',
  summary: 'A synthetic case used only to verify multi-claim and multi-link editing in the preview project.',
  date: '2026-10-23', source: { title: 'Example source for QA', url: 'https://example.com/qa-case',
    publishedDate: '2026-10-23', checkedDate: '2026-10-23' },
  claims: [
    { kind: 'source-supported', text: 'The synthetic source describes the test sequence.', sourceSection: 'Overview' },
    { kind: 'teaching-inference', text: 'The second step offers a useful review exercise.' },
  ], links: [
    { topicId: 'start', kind: 'context', reason: 'The starting concept introduces this synthetic case.' },
    { topicId: 'review', kind: 'application', reason: 'The review concept applies to this synthetic case.' },
  ] });
payload.activities.push({ id: 'qa-activity', kind: 'relation-judgment', relationId: 'start-review',
  topicIds: ['start', 'review'], prompt: 'Does the starting concept support review?',
  options: ['Yes, it provides context.', 'No, they are unrelated.'], answerIndex: 0,
  feedback: 'The relation connects the start and review concepts.' });
payload.questions.push({ id: 'qa-question', topicId: 'start', prompt: 'What follows the starting concept?',
  options: ['Review concept', 'No further concept'], answerIndex: 0,
  feedback: 'The review concept is linked from the start.' });
payload.topics[0].practiceHref = '../correction-lab/';

const saved = ok(await call('draft', { method: 'POST', cookie: teacher,
  body: { graphId, payload, expectedRevision: draft.revision } }), 'save full draft');
assert.equal((await call('draft', { method: 'POST', cookie: teacher,
  body: { graphId, payload, expectedRevision: draft.revision } })).status, 409);
assert.equal((await call('publish', { method: 'POST', cookie: teacher,
  body: { graphId, revision: saved.revision, reviewed: false } })).status, 400);
version1 = ok(await call('publish', { method: 'POST', cookie: teacher,
  body: { graphId, revision: saved.revision, reviewed: true } }), 'publish first version').version;
const publicFirst = ok(await call('public', { query: { graph: graphId } }), 'anonymous public graph').graph;
assert.equal(publicFirst.events[0].claims.length, 2);
assert.equal(publicFirst.events[0].links.length, 2);
assert.equal(publicFirst.activities.length, 1);
assert.equal(publicFirst.topics[0].practiceHref, '../correction-lab/');
assert.ok(ok(await call('public-graphs'), 'published directory').graphs.some((graph) => graph.id === graphId));

const referenced = ok(await call('reference', { method: 'POST', cookie: student,
  body: { graphId, conceptId: 'start', sourceVersion: version1 } }), 'student reference');
assert.equal(referenced.created, true);
noteId = randomUUID();
ok(await call('personal-note', { method: 'POST', cookie: student,
  body: { id: noteId, title: 'QA personal note', body: 'Preview-only note', x: 80, y: 240 } }), 'student note');
edgeId = randomUUID();
ok(await call('personal-edge', { method: 'POST', cookie: student,
  body: { id: edgeId, source: `${graphId}:start`, target: `note:${noteId}`,
    reason: 'This note summarizes the starting concept.' } }), 'student connection');
const studentPersonal = ok(await call('personal', { cookie: student }), 'student personal');
assert.ok(studentPersonal.nodes.some((node) => node.id === `${graphId}:start` && node.sourceVersion === version1));
assert.ok(studentPersonal.edges.some((edge) => edge.id === edgeId));
assert.ok(!ok(await call('personal', { cookie: teacher }), 'teacher personal').edges.some((edge) => edge.id === edgeId));
} else {
  graphId = process.env.KNOWLEDGE_PREVIEW_GRAPH_ID;
  const publicFirst = ok(await call('public', { query: { graph: graphId } }), 'resume public graph').graph;
  version1 = publicFirst.publication.version;
  assert.equal(publicFirst.events[0].claims.length, 2);
  assert.equal(publicFirst.events[0].links.length, 2);
  const personal = ok(await call('personal', { cookie: student }), 'resume student personal');
  const edge = personal.edges.find((item) => item.source === `${graphId}:start`);
  assert.ok(edge, 'Previously created QA connection is required to resume.');
  edgeId = edge.id;
  noteId = edge.target.slice('note:'.length);
  assert.ok(personal.nodes.some((node) => node.id === `${graphId}:start` && node.sourceVersion === version1));
}
const crossAccount = await call('update-personal-edge', { method: 'POST', cookie: teacher,
  body: { id: edgeId, reason: 'Unauthorized change attempt.' } });
assert.ok([403, 404].includes(crossAccount.status), `Cross-account update returned ${crossAccount.status}`);

const currentDraft = ok(await call('draft', { cookie: teacher, query: { graph: graphId } }), 'saved draft').draft;
const nextPayload = structuredClone(currentDraft.payload);
nextPayload.publication.version = version1.replace(/\.\d+$/, (match) => `.${Number(match.slice(1)) + 1}`);
nextPayload.topics[0].title = 'Starting concept revised';
const nextSaved = ok(await call('draft', { method: 'POST', cookie: teacher,
  body: { graphId, payload: nextPayload, expectedRevision: currentDraft.revision } }), 'save second version');
const version2 = ok(await call('publish', { method: 'POST', cookie: teacher,
  body: { graphId, revision: nextSaved.revision, reviewed: true } }), 'publish second version').version;
assert.equal(ok(await call('public', { query: { graph: graphId, version: version1 } }), 'historical public graph').graph.topics[0].title,
  'Starting concept');
assert.equal(ok(await call('public', { query: { graph: graphId } }), 'current public graph').graph.topics[0].title,
  'Starting concept revised');
assert.equal(ok(await call('personal', { cookie: student }), 'versioned personal').nodes.find((node) =>
  node.id === `${graphId}:start`).sourceVersion, version1);

const importNoteId = randomUUID();
const failedImport = await call('import-personal', { method: 'POST', cookie: student, body: {
  nodes: [{ kind: 'note', id: `note:${importNoteId}`, title: 'Rollback sentinel', body: 'Must not persist', x: 10, y: 10 }],
  edges: [{ id: randomUUID(), source: `note:${importNoteId}`, target: 'missing:concept', reason: 'Invalid import endpoint.' }],
} });
assert.ok(failedImport.status >= 400);
assert.ok(!ok(await call('personal', { cookie: student }), 'import rollback').nodes.some((node) => node.id === `note:${importNoteId}`));

const reasonUpdate = await call('update-personal-edge', { method: 'POST', cookie: student,
  body: { id: edgeId, reason: 'Revised connection reason saved by the student.' } });
const result = { graphId, version1, version2, edgeId, noteId,
  publishedInDirectory: true, historicalVersionRetained: true, multiClaimAndLinkRetained: true,
  studentDraftDenied: true, crossAccountEdgeDenied: true, importRollback: true,
  reasonUpdateStatus: reasonUpdate.status, reasonUpdateError: reasonUpdate.status === 200 ? null : reasonUpdate.data.error };
process.stdout.write(`${JSON.stringify(result)}\n`);
