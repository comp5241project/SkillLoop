import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './knowledge.mjs';
import { validateGraph } from './_knowledge-model.mjs';

globalThis.window = {};
await import('../knowledge-map/data.js');
const sample = window.SkillLoopGraph;
const reply = (data, status = 200) => Response.json(data, { status });
function request(op, method = 'GET', body, query = '', cookie = '') {
  return new Request(`https://skillloop.example/api/knowledge?op=${op}${query}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json', Origin: 'https://skillloop.example' } : {}),
      ...(cookie ? { Cookie: `sl_knowledge_access=${cookie}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function backend(mock, run) {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL, previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test';
  globalThis.fetch = mock;
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
}

test('seven seed concepts have dedicated valid questions and a 300-node graph validates', () => {
  assert.deepEqual(sample.topics.map((topic) => topic.id), [
    'foundations', 'requirements', 'code-reading', 'software-testing', 'communication', 'ai-code-review', 'edge-cases',
  ]);
  assert.equal(new Set(sample.questions.map((question) => question.topicId)).size, 7);
  assert.equal(validateGraph(sample), sample);
  const large = structuredClone(sample);
  large.publication.id = 'large-class';
  large.topics = Array.from({ length: 300 }, (_, index) => ({ ...structuredClone(sample.topics[0]),
    id: `concept-${index}`, title: `Concept ${index}`, order: index + 1,
    position: { x: index % 20 * 210, y: Math.floor(index / 20) * 120 } }));
  large.relations = Array.from({ length: 299 }, (_, index) => ({ id: `edge-${index}`,
    source: `concept-${index}`, target: `concept-${index + 1}`, type: 'related',
    reason: 'This concept is linked to the next concept in the course.' }));
  large.events = []; large.activities = []; large.questions = [];
  assert.equal(validateGraph(large), large);
});

test('a public historical version is requested only from the selected graph', async () => {
  const queries = [];
  await backend(async (url) => {
    const u = new URL(url); queries.push(u);
    if (u.pathname.endsWith('skillloop_graphs')) return reply([{ current_version: 'v2' }]);
    if (u.pathname.endsWith('skillloop_publications')) return reply([{ payload: sample }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public', 'GET', undefined, '&graph=other-class&version=v1'));
    assert.equal(response.status, 200);
    assert.equal(queries[0].searchParams.get('id'), 'eq.other-class');
    assert.equal(queries[1].searchParams.get('graph_id'), 'eq.other-class');
    assert.equal(queries[1].searchParams.get('version'), 'eq.v1');
  });
});

test('teacher drafts are filtered by graph ID and role', async () => {
  const queries = [];
  await backend(async (url) => {
    const u = new URL(url); queries.push(u);
    if (u.pathname.endsWith('/user')) return reply({ id: 'teacher-id', email: 'teacher@example.test' });
    if (u.pathname.endsWith('skillloop_roles')) return reply([{ role: 'teacher' }]);
    if (u.pathname.endsWith('skillloop_drafts')) return reply([]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('draft', 'GET', undefined, '&graph=other-class', 'teacher-token'));
    assert.equal(response.status, 200);
    assert.equal(queries.at(-1).searchParams.get('graph_id'), 'eq.other-class');
  });
});

test('personal graph maps separate teacher references, notes and manual links', async () => {
  await backend(async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user')) return reply({ id: 'student-id', email: 'student@example.test' });
    if (path.endsWith('skillloop_roles')) return reply([]);
    if (path.endsWith('skillloop_references')) return reply([
      { graph_id: 'graph-one', concept_id: 'start', source_version: 'v1', title_snapshot: 'Start',
        description_snapshot: 'First', note: '', position_x: 40, position_y: 50 },
      { graph_id: 'graph-two', concept_id: 'start', source_version: 'v2', title_snapshot: 'Start again',
        description_snapshot: 'Second', note: '', position_x: 60, position_y: 70 },
    ]);
    if (path.endsWith('skillloop_personal_nodes')) return reply([{ id: '11111111-1111-4111-8111-111111111111',
      title: 'My idea', body: 'Remember this', position_x: 80, position_y: 90 }]);
    if (path.endsWith('skillloop_personal_edges')) return reply([{ id: '22222222-2222-4222-8222-222222222222',
      source_key: 'graph-one:start', target_key: 'note:11111111-1111-4111-8111-111111111111', reason: 'My link' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('personal', 'GET', undefined, '', 'student-token'));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.nodes.map((node) => node.id), ['graph-one:start', 'graph-two:start',
      'note:11111111-1111-4111-8111-111111111111']);
    assert.equal(data.edges[0].target, data.nodes[2].id);
  });
});

test('referencing a historical version uses the version-aware RPC', async () => {
  let rpcBody;
  await backend(async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user')) return reply({ id: 'student-id', email: 'student@example.test' });
    if (path.endsWith('skillloop_roles')) return reply([]);
    if (path.endsWith('skillloop_reference_node_version')) { rpcBody = JSON.parse(options.body); return reply(true); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('reference', 'POST',
      { graphId: 'graph-one', conceptId: 'start', sourceVersion: 'v1' }, '', 'student-token'));
    assert.equal(response.status, 200);
    assert.equal(rpcBody.p_version, 'v1');
    assert.equal(rpcBody.p_graph, 'graph-one');
  });
});

test('personal connection reason update is scoped to the signed-in owner', async () => {
  const edgeId = '22222222-2222-4222-8222-222222222222';
  let patchRequest;
  await backend(async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/user')) return reply({ id: 'student-id', email: 'student@example.test' });
    if (parsed.pathname.endsWith('skillloop_roles')) return reply([]);
    if (parsed.pathname.endsWith('skillloop_personal_edges')) {
      patchRequest = { parsed, options };
      return reply([{ id: edgeId, reason: 'Updated reason' }]);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('update-personal-edge', 'POST',
      { id: edgeId, reason: 'Updated reason' }, '', 'student-token'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).edge.reason, 'Updated reason');
    assert.equal(patchRequest.options.method, 'PATCH');
    assert.equal(patchRequest.parsed.searchParams.get('user_id'), 'eq.student-id');
    assert.deepEqual(JSON.parse(patchRequest.options.body), { reason: 'Updated reason' });
  });
});
