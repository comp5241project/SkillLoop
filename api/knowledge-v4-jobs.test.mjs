import test from 'node:test';
import assert from 'node:assert/strict';
import { runAIJob } from './_knowledge-v4-jobs.mjs';

test('queued planning job stores one proposal and recovers after a completed write', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY',
    'KNOWLEDGE_V4_OPENROUTER_MODEL'].map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  process.env.OPENROUTER_API_KEY = 'model-test';
  process.env.KNOWLEDGE_V4_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
  const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const owner = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const unitId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const revision = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
  const job = { id, unit_id: unitId, owner_id: owner, kind: 'plan', status: 'queued',
    updated_at: new Date().toISOString(), input: { url: null, topic: 'Canvas', revision } };
  let proposal = null;
  let modelCalls = 0;
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw);
    if (url.hostname === 'openrouter.ai') {
      modelCalls += 1;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ title: 'Canvas', summary: 'Learn scene state.',
          guidingQuestion: 'How is state kept?', directions: [{ title: 'State',
            question: 'How does it change?', scope: 'State transitions' }] }) } }] });
    }
    assert.equal(options.headers.apikey, 'service-test');
    if (url.pathname.endsWith('/skillloop_v4_jobs')) {
      if (options.method === 'PATCH') {
        Object.assign(job, JSON.parse(options.body));
        return url.searchParams.get('status') === 'eq.queued' ? Response.json([job]) :
          new Response(null, { status: 204 });
      }
      return Response.json([job]);
    }
    if (url.pathname.endsWith('/skillloop_v4_proposals')) {
      if (options.method === 'POST') {
        proposal = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return Response.json(proposal ? [proposal] : []);
    }
    if (url.pathname.endsWith('/skillloop_v4_unit_drafts')) return Response.json([{
      owner_id: owner, revision, plan_revision: 1, confirmed_plan_revision: null,
      payload: { title: 'Canvas', directions: [], sources: [] },
    }]);
    throw new Error(`Unexpected ${url}`);
  };
  try {
    const result = await runAIJob(id);
    assert.equal(result.id, id);
    assert.equal(result.title, 'Canvas');
    assert.equal(job.status, 'completed');
    assert.equal(proposal.job_id, id);
    assert.equal(proposal.model, 'deepseek/deepseek-v4.1-flash');
    assert.equal(proposal.prompt_version, 'knowledge-v4-plan-1');
    assert.deepEqual(proposal.source_refs, []);
    job.status = 'running';
    const restored = await runAIJob(id);
    assert.equal(restored.id, id);
    assert.equal(job.status, 'completed');
    job.status = 'failed'; job.error = 'A duplicate delivery reported an error.';
    assert.equal((await runAIJob(id)).id, id);
    assert.equal(job.status, 'completed');
    assert.equal(job.error, null);
    assert.equal(modelCalls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
