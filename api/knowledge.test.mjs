import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './knowledge.mjs';
import { validateGraph } from './_knowledge-model.mjs';

globalThis.window = {};
await import('../knowledge-map/data.js');
const sample = window.SkillLoopGraph;

function request(op, method = 'GET', body, cookie) {
  return new Request(`https://skillloop.example/api/knowledge?op=${op}`, {
    method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: 'https://skillloop.example' }),
      ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function withBackend(mock, run) {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  globalThis.fetch = mock;
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
}

function reply(data, status = 200) { return Response.json(data, { status }); }

test('session reports when account backend is unavailable', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await handler.fetch(request('session'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { signedIn: false, backendConfigured: false });
  } finally {
    if (previousUrl !== undefined) process.env.SUPABASE_URL = previousUrl;
    if (previousKey !== undefined) process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test('sample graph is valid and broken links are rejected', () => {
  assert.equal(validateGraph(sample), sample);
  const broken = structuredClone(sample);
  broken.relations[0].target = 'missing-concept';
  assert.throws(() => validateGraph(broken), /Invalid endpoints/);
  const removed = structuredClone(sample);
  removed.topics = removed.topics.filter((topic) => topic.id !== 'software-testing');
  assert.throws(() => validateGraph(removed), /shared concept ID/);
  const badDate = structuredClone(sample);
  badDate.events[0].source.publishedDate = '2024-02-31';
  assert.throws(() => validateGraph(badDate), /must be a date/);
});

test('public endpoint serves only the current publication', async () => {
  const paths = [];
  await withBackend(async (url) => {
    paths.push(new URL(url).pathname);
    if (new URL(url).pathname.endsWith('skillloop_graphs')) return reply([{ current_version: '2026-10-21.1' }]);
    if (new URL(url).pathname.endsWith('skillloop_publications')) return reply([{ payload: sample }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).graph.publication.version, '2026-10-21.1');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(paths, ['/rest/v1/skillloop_graphs', '/rest/v1/skillloop_publications']);
  });
});

test('anonymous directory requests only published graphs and returns public metadata', async () => {
  const requests = [];
  await withBackend(async (url, options) => {
    const parsed = new URL(url);
    requests.push({ parsed, options });
    if (parsed.pathname.endsWith('/skillloop_graphs') && parsed.searchParams.has('order'))
      return reply([{ id: 'software-development', title: 'Software development', current_version: '2026-10-21.1' }]);
    if (parsed.pathname.endsWith('/skillloop_graphs')) return reply([{ current_version: '2026-10-21.1' }]);
    if (parsed.pathname.endsWith('/skillloop_publications')) return reply([{ payload: sample }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-graphs'));
    assert.equal(response.status, 200);
    const { graphs, unavailableCount } = await response.json();
    assert.equal(graphs.length, 1);
    assert.equal(unavailableCount, 0);
    assert.deepEqual(Object.keys(graphs[0]).sort(), ['conceptCount', 'description', 'id', 'title', 'version']);
    assert.equal(graphs[0].conceptCount, 7);
    assert.equal(requests[0].parsed.searchParams.get('current_version'), 'not.is.null');
    assert.equal(requests.every(({ options }) => !options.headers.Authorization), true);
    assert.equal(requests.some(({ parsed }) => parsed.pathname.endsWith('/skillloop_drafts')), false);
  });
});

test('directory reports unavailable publications without claiming an empty catalog', async () => {
  await withBackend(async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/skillloop_graphs') && parsed.searchParams.has('order'))
      return reply([
        { id: 'software-development', title: 'Software development', current_version: '2026-10-21.1' },
        { id: 'missing-publication', title: 'Unavailable publication', current_version: '2026-10-21.1' },
      ]);
    if (parsed.pathname.endsWith('/skillloop_graphs')) return reply([{ current_version: '2026-10-21.1' }]);
    if (parsed.pathname.endsWith('/skillloop_publications'))
      return reply(parsed.searchParams.get('graph_id') === 'eq.missing-publication' ? [] : [{ payload: sample }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-graphs'));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.graphs.map((graph) => graph.id), ['software-development']);
    assert.equal(result.unavailableCount, 1);
  });
});

test('directory pages expose all published resources without querying private drafts', async () => {
  const queries = [];
  await withBackend(async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/skillloop_graphs') && parsed.searchParams.has('order')) {
      queries.push({ offset: parsed.searchParams.get('offset'), limit: parsed.searchParams.get('limit'),
        order: parsed.searchParams.get('order'), authorized: Boolean(options.headers.Authorization) });
      const offset = Number(parsed.searchParams.get('offset'));
      return reply(Array.from({ length: Math.max(0, Math.min(25, 26 - offset)) }, (_, index) => ({
        id: `graph-${offset + index}`, title: `Graph ${offset + index}`, current_version: '2026-10-21.1',
      })));
    }
    if (parsed.pathname.endsWith('/skillloop_graphs')) return reply([{ current_version: '2026-10-21.1' }]);
    if (parsed.pathname.endsWith('/skillloop_publications')) return reply([{ payload: sample }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const first = await handler.fetch(request('public-graphs'));
    const firstPage = await first.json();
    assert.equal(firstPage.graphs.length, 24);
    assert.equal(firstPage.hasMore, true);
    const second = await handler.fetch(new Request('https://skillloop.example/api/knowledge?op=public-graphs&page=1'));
    const secondPage = await second.json();
    assert.deepEqual(secondPage.graphs.map((graph) => graph.id), ['graph-24', 'graph-25']);
    assert.equal(secondPage.hasMore, false);
    assert.deepEqual(queries, [
      { offset: '0', limit: '25', order: 'created_at.desc,id.asc', authorized: false },
      { offset: '24', limit: '25', order: 'created_at.desc,id.asc', authorized: false },
    ]);
    const invalid = await handler.fetch(new Request('https://skillloop.example/api/knowledge?op=public-graphs&page=-1'));
    assert.equal(invalid.status, 400);
  });
});

test('login issues HttpOnly cookies and a student cannot read drafts', async () => {
  await withBackend(async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/token')) return reply({ access_token: 'student-jwt', refresh_token: 'refresh', expires_in: 3600 });
    if (path.endsWith('/user')) return reply({ id: 'student-id', email: 'student@example.test' });
    if (path.endsWith('/skillloop_roles')) return reply([{ role: 'student' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const login = await handler.fetch(request('login', 'POST', { email: 'student@example.test', password: 'secret' }));
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /Secure/);
    const draft = await handler.fetch(request('draft', 'GET', undefined, 'sl_knowledge_access=student-jwt'));
    assert.equal(draft.status, 403);
    assert.match((await draft.json()).error, /Teacher/);
  });
});

test('teacher validation stops invalid drafts before the database RPC', async () => {
  let rpcCalls = 0;
  await withBackend(async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user')) return reply({ id: 'teacher-id', email: 'teacher@example.test' });
    if (path.endsWith('/skillloop_roles')) return reply([{ role: 'teacher' }]);
    if (path.includes('/rpc/')) rpcCalls++;
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const broken = structuredClone(sample);
    broken.events[0].source.url = 'http://insecure.example';
    const response = await handler.fetch(request('draft', 'POST', { payload: broken, expectedRevision: null },
      'sl_knowledge_access=teacher-jwt'));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /HTTPS/);
    assert.equal(rpcCalls, 0);
  });
});

test('failed publish does not overwrite the published version', async () => {
  let currentVersion = '2026-10-20.1';
  await withBackend(async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user')) return reply({ id: 'teacher-id', email: 'teacher@example.test' });
    if (path.endsWith('/skillloop_roles')) return reply([{ role: 'teacher' }]);
    if (path.endsWith('/skillloop_drafts')) return reply([{ revision: '11111111-1111-4111-8111-111111111111', payload: sample }]);
    if (path.endsWith('/rpc/skillloop_publish_draft')) return reply({ message: 'Publication version already used' }, 409);
    if (path.endsWith('/skillloop_graphs')) return reply([{ current_version: currentVersion }]);
    if (path.endsWith('/skillloop_publications')) return reply([{ payload: { ...sample, publication: { ...sample.publication, version: currentVersion } } }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('publish', 'POST',
      { revision: '11111111-1111-4111-8111-111111111111', reviewed: true },
      'sl_knowledge_access=teacher-jwt'));
    assert.equal(response.status, 409);
    assert.equal(currentVersion, '2026-10-20.1');
    const publicResponse = await handler.fetch(request('public'));
    assert.equal((await publicResponse.json()).graph.publication.version, currentVersion);
  });
});

test('duplicate account reference is idempotent', async () => {
  await withBackend(async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user')) return reply({ id: 'student-id', email: 'student@example.test' });
    if (path.endsWith('/skillloop_roles')) return reply([]);
    if (path.endsWith('/rpc/skillloop_reference_node')) return reply(false);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('reference', 'POST', { conceptId: 'software-testing' },
      'sl_knowledge_access=student-jwt'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, created: false });
  });
});

test('teacher discovery records prompt and sources but does not publish', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai';
  const paths = [];
  let log;
  try {
    await withBackend(async (url, options) => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (path.endsWith('/user')) return reply({ id: 'teacher-id', email: 'teacher@example.test' });
      if (path.endsWith('/skillloop_roles')) return reply([{ role: 'teacher' }]);
      if (path.endsWith('/skillloop_discovery_runs') && options.method === 'GET') return reply([]);
      if (path === '/v1/responses') return reply({ output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://report.example/story#section', title: 'Report' }] } },
        { type: 'message', content: [{ type: 'output_text', text: 'Reported event; verify the date.' }] },
      ] });
      if (path.endsWith('/skillloop_discovery_runs') && options.method === 'POST') {
        log = JSON.parse(options.body);
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected ${url}`);
    }, async () => {
      const response = await handler.fetch(request('discover', 'POST',
        { query: 'software testing incident in 2024' }, 'sl_knowledge_access=teacher-jwt'));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.sources[0].url, 'https://report.example/story');
      assert.match(log.input_text, /software testing incident in 2024/);
      assert.equal(log.sources[0].title, 'Report');
      assert.equal(paths.some((path) => path.includes('skillloop_publications')), false);
    });
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
