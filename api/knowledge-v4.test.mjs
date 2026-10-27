import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './knowledge-v4.mjs';
import { confirmPlan, createUnitDraft } from './_knowledge-v4-model.mjs';

const unitId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const graphId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const revision = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const teacherId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

function request(op, method = 'GET', body, extra = '') {
  return new Request(`https://skillloop.example/api/knowledge-v4?op=${op}${extra}`, {
    method, headers: { Cookie: 'sl_knowledge_access=teacher-token',
      ...(body ? { 'Content-Type': 'application/json', Origin: 'https://skillloop.example' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function mocked(mock, run) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  globalThis.fetch = async (raw, options) => {
    const url = new URL(raw);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: teacherId, email: 'teacher@example.org' });
    if (url.pathname === '/rest/v1/skillloop_roles') return Response.json([{ role: 'teacher' }]);
    return mock(url, options);
  };
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
    if (originalService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
  }
}

function unit() {
  const value = createUnitDraft(unitId);
  Object.assign(value, { title: 'Canvas', summary: 'Explore the canvas.',
    guidingQuestion: 'How does it work?', sections: [{ id: 'overview', kind: 'overview',
      title: 'Overview', body: 'A canvas has a scene.', evidenceRefs: [] }],
    directions: [{ id: 'scene', graphId, title: 'Scene', question: 'What is a scene?',
      scope: 'Scene structure' }] });
  return confirmPlan(value);
}

test('public Unit request selects a fixed published version without private draft access', async () => {
  const paths = [];
  await mocked((url) => {
    paths.push(url.pathname);
    if (url.pathname.endsWith('/skillloop_v4_units')) return Response.json([
      { id: unitId, title: 'Canvas', current_version: 3, owner_id: teacherId }]);
    if (url.pathname.endsWith('/skillloop_v4_unit_versions')) return Response.json([
      { version: 1, payload: unit(), graph_refs: [{ directionId: 'scene', graphId, version: 2 }],
        published_at: '2026-10-27T00:00:00Z', withdrawn_reason: null }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-unit', 'GET', undefined, `&unit=${unitId}&version=1`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.unit.version, 1);
    assert.equal(body.unit.currentVersion, 3);
    assert.deepEqual(paths, ['/rest/v1/skillloop_v4_units', '/rest/v1/skillloop_v4_unit_versions']);
  });
});

test('an unapplied v0.4 migration gives a service-state message instead of a table name', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_units')) return Response.json({
      message: "Could not find the table 'public.skillloop_v4_units' in the schema cache",
    }, { status: 404 });
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-units'));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'Knowledge v0.4 is not ready on this database.');
  });
});

test('an interrupted AI job is visible after reopening a Unit', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: null, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_jobs')) return Response.json([{
      id: graphId, kind: 'plan', status: 'running', error: null,
      updated_at: '2020-01-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('jobs', 'GET', undefined, `&unit=${unitId}`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).jobs[0].effectiveStatus, 'interrupted');
  });
});

test('teacher can choose an older published Direction Graph Version', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_graphs')) return Response.json([
      { id: graphId, owner_id: teacherId }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_versions')) {
      assert.equal(url.searchParams.get('order'), 'version.desc');
      assert.equal(url.searchParams.get('withdrawn_reason'), 'is.null');
      return Response.json([{ version: 3, published_at: '2026-10-27T00:00:00Z' },
        { version: 1, published_at: '2026-10-20T00:00:00Z' }]);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('graph-versions', 'GET', undefined, `&graph=${graphId}`));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).versions.map((entry) => entry.version), [3, 1]);
  });
});

test('teacher review reads the exact selected Graph Version payload', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_graphs')) return Response.json([
      { id: graphId, owner_id: teacherId }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_versions')) {
      assert.equal(url.searchParams.get('version'), 'eq.1');
      return Response.json([{ version: 1, payload: { title: 'Earlier graph', nodes: [], edges: [] },
        sources: [], published_at: '2026-10-20T00:00:00Z' }]);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('graph-version', 'GET', undefined,
      `&graph=${graphId}&version=1`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).graphVersion.payload.title, 'Earlier graph');
  });
});

test('Direction Planning confirmation uses one atomic RPC', async () => {
  const draft = createUnitDraft(unitId);
  draft.directions = [{ id: 'scene', graphId, title: 'Scene', question: 'What is a scene?',
    scope: 'Scene structure' }];
  const calls = [];
  await mocked((url, options) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: null, payload: draft }]);
    if (url.pathname.endsWith('/rpc/skillloop_v4_confirm_plan')) {
      const input = JSON.parse(options.body);
      assert.match(input.p_fingerprint, /^[0-9a-f]{64}$/);
      return Response.json({ revision: graphId, planRevision: 1 });
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('confirm-plan', 'POST',
      { unitId, expectedRevision: revision }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, graphId);
    assert.deepEqual(calls, ['/rest/v1/skillloop_v4_unit_drafts',
      '/rest/v1/rpc/skillloop_v4_confirm_plan']);
  });
});

test('confirmed Independent Graph reuse copies content into a distinct Direction Graph draft', async () => {
  const copiedFrom = 'teacher-foundations';
  await mocked((url, options) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_graphs')) return Response.json([{
      id: copiedFrom, title: 'Foundations', owner_id: teacherId, current_version: '2026-10-27.1' }]);
    if (url.pathname.endsWith('/skillloop_publications')) return Response.json([{
      payload: { topics: [{ id: 'state', title: 'State',
        lesson: { explanation: 'State stores what the screen will render.' },
        position: { x: 100, y: 80 } }], relations: [] } }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_drafts')) return Response.json([]);
    if (url.pathname.endsWith('/rpc/skillloop_v4_save_graph')) {
      const input = JSON.parse(options.body);
      assert.equal(input.p_graph, graphId);
      assert.notEqual(input.p_graph, copiedFrom);
      assert.equal(input.p_payload.importedFrom.graphId, copiedFrom);
      return Response.json(revision);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('copy-independent-graph', 'POST', {
      unitId, directionId: 'scene', sourceGraphId: copiedFrom,
      sourceVersion: '2026-10-27.1', confirmed: true }));
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.graph.id, graphId);
    assert.equal(result.graph.nodes[0].title, 'State');
    assert.equal(result.graph.nodes[0].claimKind, 'general');
  });
  await mocked(() => { throw new Error('Unconfirmed reuse reached storage.'); }, async () => {
    const response = await handler.fetch(request('copy-independent-graph', 'POST', {
      unitId, directionId: 'scene', sourceGraphId: copiedFrom,
      sourceVersion: '2026-10-27.1', confirmed: false }));
    assert.equal(response.status, 400);
  });
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_graphs')) return Response.json([{
      id: copiedFrom, title: 'Foundations', owner_id: teacherId, current_version: '2026-10-27.1' }]);
    if (url.pathname.endsWith('/skillloop_publications')) return Response.json([{
      payload: { topics: [{ id: 'state', title: 'State',
        lesson: { explanation: 'State stores what the screen will render.' } }], relations: [] } }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_drafts')) return Response.json([{ revision }]);
    throw new Error(`Existing Graph draft was overwritten: ${url}`);
  }, async () => {
    const response = await handler.fetch(request('copy-independent-graph', 'POST', {
      unitId, directionId: 'scene', sourceGraphId: copiedFrom,
      sourceVersion: '2026-10-27.1', confirmed: true }));
    assert.equal(response.status, 409);
  });
});

test('confirmed concept reuse copies one published concept with a local ID and preserves target edits', async () => {
  const sourceGraphId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
  await mocked((url, options) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_graphs')) return Response.json([{
      id: sourceGraphId, owner_id: teacherId }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_versions')) return Response.json([{
      payload: { nodes: [{ id: 'state', title: 'State', description: 'State in the source.',
        claimKind: 'code', evidenceRefs: [{ sourceId: sourceGraphId, location: 'src/state.js' }] }] } }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_drafts')) return Response.json([{
      revision, payload: { schemaVersion: '0.4', id: graphId, directionId: 'scene', title: 'Scene',
        nodes: [{ id: 'state', title: 'Local state', description: 'Existing edit.',
          claimKind: 'general', evidenceRefs: [] }], edges: [] } }]);
    if (url.pathname.endsWith('/rpc/skillloop_v4_save_graph')) {
      const payload = JSON.parse(options.body).p_payload;
      assert.equal(payload.nodes[0].description, 'Existing edit.');
      assert.equal(payload.nodes[1].id, 'state-2');
      assert.deepEqual(payload.nodes[1].evidenceRefs, []);
      assert.deepEqual(payload.nodes[1].reusedFrom,
        { graphId: sourceGraphId, version: 1, nodeId: 'state' });
      return Response.json(revision);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('copy-concept', 'POST', {
      unitId, directionId: 'scene', sourceGraphId, sourceVersion: 1,
      sourceNodeId: 'state', expectedGraphRevision: revision, confirmed: true }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).nodeId, 'state-2');
  });
  await mocked(() => { throw new Error('Unconfirmed concept reuse reached storage.'); }, async () => {
    const response = await handler.fetch(request('copy-concept', 'POST', {
      unitId, directionId: 'scene', sourceGraphId, sourceVersion: 1,
      sourceNodeId: 'state', confirmed: false }));
    assert.equal(response.status, 400);
  });
});

test('publish rejects stale Unit revision before publishing RPC', async () => {
  const paths = [];
  await mocked((url) => {
    paths.push(url.pathname);
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('publish-unit', 'POST', {
      unitId, expectedRevision: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      graphRefs: [{ directionId: 'scene', graphId, version: 1 }],
    }));
    assert.equal(response.status, 409);
    assert.equal(paths.includes('/rest/v1/rpc/skillloop_v4_publish_unit'), false);
  });
});

test('publish passes mixed existing and new Graph Version references into one transaction RPC', async () => {
  const secondId = 'ffffffff-ffff-4fff-ffff-ffffffffffff';
  const publishedUnit = unit();
  publishedUnit.directions.push({ id: 'render', graphId: secondId, title: 'Rendering',
    question: 'How is it drawn?', scope: 'Draw loop' });
  publishedUnit.confirmedPlanFingerprint = confirmPlan(publishedUnit).confirmedPlanFingerprint;
  const calls = [];
  await mocked((url, options) => {
    calls.push({ path: url.pathname, body: options.body && JSON.parse(options.body) });
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 2, confirmed_plan_revision: 2, payload: publishedUnit }]);
    if (url.pathname.endsWith('/skillloop_v4_sources')) return Response.json([]);
    if (url.pathname.endsWith('/skillloop_v4_graph_drafts')) return Response.json([{
      revision, payload: { schemaVersion: '0.4', id: secondId, directionId: 'render',
        title: 'Rendering', nodes: [{ id: 'renderer', title: 'Renderer',
          description: 'Draws the scene.', evidenceRefs: [] }], edges: [] } }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_versions')) return Response.json([{
      sources: [],
      payload: { schemaVersion: '0.4', id: graphId, directionId: 'scene', title: 'Scene',
        nodes: [{ id: 'scene', title: 'Scene', description: 'A scene.', evidenceRefs: [] }], edges: [] } }]);
    if (url.pathname.endsWith('/rpc/skillloop_v4_publish_unit')) return Response.json(4);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const refs = [{ directionId: 'scene', graphId, version: 2 },
      { directionId: 'render', graphId: secondId, draftRevision: revision }];
    const response = await handler.fetch(request('publish-unit', 'POST', {
      unitId, expectedRevision: revision, graphRefs: refs,
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, 4);
    const rpc = calls.find((call) => call.path.endsWith('/rpc/skillloop_v4_publish_unit'));
    assert.deepEqual(rpc.body.p_graph_refs, refs);
    const partial = await handler.fetch(request('publish-unit', 'POST', {
      unitId, expectedRevision: revision, graphRefs: [refs[0]],
    }));
    assert.equal(partial.status, 200);
    assert.deepEqual(calls.at(-1).body.p_graph_refs, [refs[0]]);
    const empty = await handler.fetch(request('publish-unit', 'POST', {
      unitId, expectedRevision: revision, graphRefs: [],
    }));
    assert.equal(empty.status, 400);
  });
});

test('AI generation is blocked before a teacher confirms Direction Planning', async () => {
  const unconfirmed = unit();
  unconfirmed.confirmedPlanFingerprint = null;
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 2, confirmed_plan_revision: null, payload: unconfirmed }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('generate', 'POST', {
      unitId, expectedRevision: revision, directionIds: ['scene'],
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Confirm Direction Planning/);
  });
});

test('AI generation bounds each job to a reviewable Direction batch', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('generate', 'POST', {
      unitId, expectedRevision: revision,
      directionIds: ['scene', 'render', 'state', 'performance'],
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /1–3 confirmed Directions/);
  });
});

test('a pending generation proposal blocks a second batch until teacher review', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_jobs')) return Response.json([]);
    if (url.pathname.endsWith('/skillloop_v4_proposals')) {
      assert.equal(url.searchParams.get('dismissed_at'), 'is.null');
      return Response.json([{ id: graphId }]);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('generate', 'POST', {
      unitId, expectedRevision: revision, directionIds: ['scene'],
    }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Review or dismiss/);
  });
});

test('teacher can dismiss a private proposal without changing the draft', async () => {
  let write;
  await mocked((url, options) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_proposals')) {
      assert.equal(options.method, 'PATCH');
      assert.equal(options.headers.apikey, 'service-test-key');
      assert.equal(url.searchParams.get('owner_id'), `eq.${teacherId}`);
      write = JSON.parse(options.body);
      return Response.json([{ id: graphId }]);
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('dismiss-proposal', 'POST', {
      unitId, proposalId: graphId,
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).dismissed, true);
    assert.ok(Date.parse(write.dismissed_at));
  });
});

test('a missing AI key leaves a failed job and no invented planning proposal', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const writes = [];
  let jobReads = 0;
  try {
    await mocked((url, options) => {
      if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
        owner_id: teacherId, revision, plan_revision: 1, confirmed_plan_revision: null, payload: unit() }]);
      if (url.pathname.endsWith('/skillloop_v4_jobs')) {
        if (options.method === 'GET' && jobReads++ === 0) return Response.json([]);
        if (options.method === 'GET') return Response.json([{
          id: graphId, unit_id: unitId, owner_id: teacherId, kind: 'plan', status: 'queued',
          input: { url: null, topic: 'Canvas rendering', revision }, updated_at: new Date().toISOString(),
        }]);
        assert.equal(options.headers.apikey, 'service-test-key');
        writes.push({ method: options.method, body: JSON.parse(options.body) });
        if (options.method === 'PATCH' && url.searchParams.get('status') === 'eq.queued')
          return Response.json([{ id: graphId, status: 'running' }]);
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('/skillloop_v4_proposals')) return Response.json([]);
      throw new Error(`Unexpected ${url}`);
    }, async () => {
      const response = await handler.fetch(request('analyze', 'POST', { unitId, topic: 'Canvas rendering' }));
      assert.equal(response.status, 503);
      assert.equal(writes[0].body.status, 'queued');
      assert.equal(writes[1].body.status, 'running');
      assert.equal(writes[2].body.status, 'failed');
    });
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('a stale generation proposal cannot be accepted over a changed Unit draft', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 3, confirmed_plan_revision: 3, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_proposals')) return Response.json([{
      unit_revision: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      plan_revision: 2, kind: 'generate', accepted_at: null }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('verify-proposal', 'POST', {
      unitId, proposalId: graphId,
    }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Draft changed/);
  });
});

test('withdrawn Unit URL exposes a notice without reading its content', async () => {
  const calls = [];
  await mocked((url) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith('/skillloop_v4_units')) return Response.json([]);
    if (url.pathname.endsWith('/skillloop_v4_unit_tombstones')) return Response.json([{
      title: 'Canvas', version: 2, reason: 'Needs revision' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-unit', 'GET', undefined, `&unit=${unitId}&version=2`));
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /Needs revision/);
    assert.equal(calls.includes('/rest/v1/skillloop_v4_unit_versions'), false);
  });
});

test('an older withdrawn Version keeps its notice after the Unit is republished', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_units')) return Response.json([{
      id: unitId, title: 'Canvas', current_version: 3, owner_id: teacherId }]);
    if (url.pathname.endsWith('/skillloop_v4_unit_versions')) return Response.json([]);
    if (url.pathname.endsWith('/skillloop_v4_unit_tombstones')) return Response.json([{
      title: 'Canvas', version: 1, reason: 'Needs revision' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-unit', 'GET', undefined, `&unit=${unitId}&version=1`));
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /Needs revision/);
  });
});

test('a withdrawn Graph Version shows its historical notice', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_graphs')) return Response.json([{
      id: graphId, current_version: 2, unit_id: unitId, direction_id: 'scene' }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_versions')) return Response.json([]);
    if (url.pathname.endsWith('/skillloop_v4_graph_tombstones')) return Response.json([{
      title: 'Scene', version: 1, reason: 'Incorrect relationship' }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('public-graph', 'GET', undefined,
      `&graph=${graphId}&version=1`));
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /Incorrect relationship/);
  });
});

test('repeating an AI request ID returns its saved proposal without calling the model', async () => {
  const plan = { title: 'Canvas', summary: 'A canvas Unit', guidingQuestion: 'How?',
    directions: [{ title: 'Scene', question: 'What?', scope: 'Scene state' }], source: null };
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: null, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_jobs')) return Response.json([{
      id: graphId, kind: 'plan', status: 'completed',
      input: { url: null, topic: 'Canvas', revision }, error: null }]);
    if (url.pathname.endsWith('/skillloop_v4_proposals')) return Response.json([{
      id: graphId, payload: plan }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('analyze', 'POST', {
      unitId, requestId: graphId, topic: 'Canvas',
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reused, true);
    assert.equal(body.proposal.title, 'Canvas');
  });
});

test('local graph regeneration refuses a stale Graph draft', async () => {
  await mocked((url) => {
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      revision, plan_revision: 1, confirmed_plan_revision: 1, payload: unit() }]);
    if (url.pathname.endsWith('/skillloop_v4_graph_drafts')) return Response.json([{
      revision, payload: { schemaVersion: '0.4', id: graphId, directionId: 'scene',
        title: 'Scene', nodes: [{ id: 'state', title: 'State', description: 'A scene.', evidenceRefs: [] }], edges: [] } }]);
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler.fetch(request('regenerate-item', 'POST', {
      unitId, expectedRevision: revision, graphId,
      expectedGraphRevision: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      kind: 'node', itemId: 'state',
    }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Graph draft changed/);
  });
});
