import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { send } from '@vercel/queue';
import { HttpError, json, bodyJson, supabase, session, withSession, refreshedHeaders, teacher } from './knowledge.mjs';
import { createUnitDraft, confirmPlan, isPlanConfirmed, validateUnitDraft,
  validatePublishableUnit, validateDirectionGraph, MAX_GENERATION_DIRECTIONS } from './_knowledge-v4-model.mjs';
import { runAIJob } from './_knowledge-v4-jobs.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_GRAPH_ID = /^[a-z][a-z0-9-]{0,63}$/;

function admin(path, options) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, 'Knowledge AI storage is not configured.');
  return supabase(path, { ...options, token: key, keyOverride: key });
}

async function executeSubmittedJob(jobId, auth, request) {
  const useQueue = process.env.KNOWLEDGE_V4_USE_QUEUE === '1' ||
    Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_REGION);
  if (!useQueue) return withSession({ proposal: await runAIJob(jobId) }, auth, request);
  try {
    await send('knowledge-v4-ai', { jobId }, { idempotencyKey: jobId, retentionSeconds: 86400 });
  } catch (error) {
    await admin('/rest/v1/skillloop_v4_jobs', { method: 'PATCH',
      query: { id: `eq.${jobId}`, status: 'eq.queued' },
      body: { status: 'failed', error: 'AI task could not be queued.', updated_at: new Date().toISOString() },
      prefer: 'return=minimal' });
    throw new HttpError(503, 'AI task could not be queued. Retry from the current draft.');
  }
  return withSession({ jobId, status: 'queued' }, auth, request, 202);
}

async function reusedProposal(auth, unitId, requestId, expectedKind, expectedInput) {
  const jobs = await supabase('/rest/v1/skillloop_v4_jobs', { token: auth.token,
    query: { select: 'id,kind,status,input,error,updated_at', unit_id: `eq.${unitId}`,
      idempotency_key: `eq.${requestId}`, limit: '1' } });
  const job = jobs?.[0];
  if (!job) return null;
  if (job.kind !== expectedKind) throw new HttpError(409, 'Request ID was used for another AI operation.');
  if (!isDeepStrictEqual(job.input, expectedInput))
    throw new HttpError(409, 'Request ID belongs to different AI input.');
  if (job.status === 'running' || job.status === 'queued')
    throw new HttpError(409, Date.now() - Date.parse(job.updated_at) > 180000
      ? 'This AI request was interrupted. Retry with a new request ID.'
      : 'This AI request is still running. Reopen the Unit to check saved proposals.');
  if (job.status === 'failed') throw new HttpError(409,
    `Previous AI request failed: ${job.error || 'retry with a new request ID'}`);
  const rows = await supabase('/rest/v1/skillloop_v4_proposals', { token: auth.token,
    query: { select: 'id,payload,dismissed_at', job_id: `eq.${job.id}`, unit_id: `eq.${unitId}`, limit: '1' } });
  if (!rows?.[0]) throw new HttpError(409, 'Completed AI job has no proposal.');
  if (rows[0].dismissed_at) throw new HttpError(409, 'This AI proposal was dismissed. Start a new request.');
  return { id: rows[0].id, ...rows[0].payload };
}

function uuid(value, label = 'ID') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `Invalid ${label}.`);
  return value.toLowerCase();
}

function version(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== String(value))
    throw new HttpError(400, 'Invalid version.');
  return number;
}

function validate(input, fn, options) {
  try { return fn(input, options); }
  catch (error) { throw new HttpError(400, error.message); }
}

async function ownUnitDraft(auth, id) {
  const rows = await supabase('/rest/v1/skillloop_v4_unit_drafts', { token: auth.token,
    query: { select: 'revision,plan_revision,confirmed_plan_revision,payload,updated_at',
      unit_id: `eq.${id}`, limit: '1' } });
  if (!rows?.[0]) throw new HttpError(404, 'Unit draft is unavailable.');
  return rows[0];
}

async function ownGraphDraft(auth, id) {
  const rows = await supabase('/rest/v1/skillloop_v4_graph_drafts', { token: auth.token,
    query: { select: 'revision,payload,updated_at', graph_id: `eq.${id}`, limit: '1' } });
  if (!rows?.[0]) throw new HttpError(404, 'Graph draft is unavailable.');
  return rows[0];
}

async function publicUnit(id, selectedVersion) {
  const units = await supabase('/rest/v1/skillloop_v4_units', { query: {
    select: 'id,title,publisher_name,current_version,owner_id', id: `eq.${id}`, current_version: 'not.is.null',
    withdrawn_at: 'is.null', limit: '1' } });
  if (!units?.[0]) {
    const query = { select: 'title,reason,version', unit_id: `eq.${id}`, limit: '1',
      order: 'version.desc' };
    if (selectedVersion) query.version = `eq.${version(selectedVersion)}`;
    const tombstones = await supabase('/rest/v1/skillloop_v4_unit_tombstones', { query });
    if (tombstones?.[0]) throw new HttpError(410,
      `${tombstones[0].title} · version ${tombstones[0].version} was withdrawn: ${tombstones[0].reason}`);
    throw new HttpError(404, 'Published Unit is unavailable.');
  }
  const currentVersion = units[0].current_version;
  const requested = selectedVersion ? version(selectedVersion) : currentVersion;
  const rows = await supabase('/rest/v1/skillloop_v4_unit_versions', { query: {
    select: 'version,payload,graph_refs,published_at,withdrawn_reason',
    unit_id: `eq.${id}`, version: `eq.${requested}`, limit: '1' } });
  if (rows?.[0]?.withdrawn_reason) throw new HttpError(410,
    `Unit version ${requested} was withdrawn: ${rows[0].withdrawn_reason}`);
  if (!rows?.[0]) {
    const tombstones = await supabase('/rest/v1/skillloop_v4_unit_tombstones', { query: {
      select: 'title,reason,version', unit_id: `eq.${id}`, version: `eq.${requested}`, limit: '1',
    } });
    if (tombstones?.[0]) throw new HttpError(410,
      `${tombstones[0].title} · version ${requested} was withdrawn: ${tombstones[0].reason}`);
    throw new HttpError(404, 'Unit Version is unavailable.');
  }
  return { ...rows[0], id, currentVersion, publisherId: units[0].owner_id,
    publisherName: units[0].publisher_name };
}

async function publicGraph(id, selectedVersion) {
  const graphs = await supabase('/rest/v1/skillloop_v4_graphs', { query: {
    select: 'id,unit_id,direction_id,current_version', id: `eq.${id}`, current_version: 'not.is.null', limit: '1' } });
  if (!graphs?.[0]) {
    const query = { select: 'title,reason,version', graph_id: `eq.${id}`, order: 'version.desc', limit: '1' };
    if (selectedVersion) query.version = `eq.${version(selectedVersion)}`;
    const tombstones = await supabase('/rest/v1/skillloop_v4_graph_tombstones', { query });
    if (tombstones?.[0]) throw new HttpError(410,
      `${tombstones[0].title} · Graph Version ${tombstones[0].version} was withdrawn: ${tombstones[0].reason}`);
    throw new HttpError(404, 'Published Graph is unavailable.');
  }
  const requested = selectedVersion ? version(selectedVersion) : graphs[0].current_version;
  const rows = await supabase('/rest/v1/skillloop_v4_graph_versions', { query: {
    select: 'version,payload,sources,published_at,withdrawn_reason',
    graph_id: `eq.${id}`, version: `eq.${requested}`, limit: '1' } });
  if (!rows?.[0] || rows[0].withdrawn_reason) {
    const tombstones = await supabase('/rest/v1/skillloop_v4_graph_tombstones', { query: {
      select: 'title,reason,version', graph_id: `eq.${id}`, version: `eq.${requested}`, limit: '1' } });
    if (tombstones?.[0]) throw new HttpError(410,
      `${tombstones[0].title} · Graph Version ${requested} was withdrawn: ${tombstones[0].reason}`);
    throw new HttpError(404, 'Graph Version is unavailable.');
  }
  return { ...rows[0], id, currentVersion: graphs[0].current_version,
    unitId: graphs[0].unit_id, directionId: graphs[0].direction_id };
}

async function listPublicUnits(page, filters = {}) {
  const pageNumber = page === null ? 0 : Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 0 || pageNumber > 10000 ||
    String(pageNumber) !== (page ?? '0')) throw new HttpError(400, 'Invalid page.');
  const query = { select: 'id,title,publisher_name,content_type,topics,current_version,owner_id,created_at',
    current_version: 'not.is.null', withdrawn_at: 'is.null',
    order: 'created_at.desc,id.asc', limit: '24', offset: String(pageNumber * 24) };
  const search = filters.search?.trim();
  if (search) {
    if (search.length > 80 || /[(),]/.test(search)) throw new HttpError(400, 'Invalid search.');
    query.title = `ilike.*${search.replace(/[%_*]/g, '')}*`;
  }
  if (filters.type) {
    if (!['open-source', 'case-study', 'build-something', 'knowledge-collection'].includes(filters.type))
      throw new HttpError(400, 'Invalid type filter.');
    query.content_type = `eq.${filters.type}`;
  }
  if (filters.teacher) {
    uuid(filters.teacher, 'Teacher ID'); query.owner_id = `eq.${filters.teacher}`;
  }
  if (filters.topic) {
    if (!/^[\p{L}\p{N} .-]{1,60}$/u.test(filters.topic)) throw new HttpError(400, 'Invalid topic filter.');
    query.topics = `cs.{"${filters.topic}"}`;
  }
  const rows = await supabase('/rest/v1/skillloop_v4_units', { query });
  return { units: rows || [], page: pageNumber };
}

async function handle(request) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op');
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-origin request rejected.');
  }
  if (request.method === 'GET' && op === 'public-units') return json(await listPublicUnits(url.searchParams.get('page'), {
    search: url.searchParams.get('search'), type: url.searchParams.get('type'),
    teacher: url.searchParams.get('teacher'), topic: url.searchParams.get('topic') }));
  if (request.method === 'GET' && op === 'public-teachers') {
    const rows = await supabase('/rest/v1/skillloop_v4_units', { query: {
      select: 'owner_id,publisher_name', current_version: 'not.is.null', withdrawn_at: 'is.null', limit: '1000' } });
    return json({ teachers: [...new Map((rows || []).map((row) =>
      [row.owner_id, { id: row.owner_id, name: row.publisher_name }])).values()] });
  }
  if (request.method === 'GET' && op === 'public-unit')
    return json({ unit: await publicUnit(uuid(url.searchParams.get('unit'), 'Unit ID'), url.searchParams.get('version')) });
  if (request.method === 'GET' && op === 'public-graph')
    return json({ graph: await publicGraph(uuid(url.searchParams.get('graph'), 'Graph ID'), url.searchParams.get('version')) });

  const auth = await session(request);
  teacher(auth);
  if (request.method === 'GET' && op === 'my-units') {
    const units = await supabase('/rest/v1/skillloop_v4_units', { token: auth.token,
      query: { select: 'id,title,current_version,created_at', owner_id: `eq.${auth.user.id}`,
        order: 'created_at.desc' } });
    const drafts = await supabase('/rest/v1/skillloop_v4_unit_drafts', { token: auth.token,
      query: { select: 'unit_id,payload', owner_id: `eq.${auth.user.id}` } });
    const titles = new Map((drafts || []).map((draft) => [draft.unit_id, draft.payload.title]));
    return withSession({ units: (units || []).map((unit) => ({ ...unit,
      title: titles.get(unit.id) || unit.title })) }, auth, request);
  }
  if (request.method === 'GET' && op === 'unit-draft')
    return withSession({ draft: await ownUnitDraft(auth, uuid(url.searchParams.get('unit'), 'Unit ID')) }, auth, request);
  if (request.method === 'GET' && op === 'unit-versions') {
    const id = uuid(url.searchParams.get('unit'), 'Unit ID');
    await ownUnitDraft(auth, id);
    const versions = await admin('/rest/v1/skillloop_v4_unit_versions', { query: {
      select: 'version,published_at,withdrawn_reason', unit_id: `eq.${id}`,
      order: 'version.desc', limit: '1000' } });
    return withSession({ versions: versions || [] }, auth, request);
  }
  if (request.method === 'GET' && op === 'graph-draft')
    return withSession({ draft: await ownGraphDraft(auth, uuid(url.searchParams.get('graph'), 'Graph ID')) }, auth, request);
  if (request.method === 'GET' && op === 'graph-state') {
    const id = uuid(url.searchParams.get('graph'), 'Graph ID');
    const graphs = await supabase('/rest/v1/skillloop_v4_graphs', { token: auth.token,
      query: { select: 'id,unit_id,direction_id,current_version', id: `eq.${id}`, limit: '1' } });
    const drafts = await supabase('/rest/v1/skillloop_v4_graph_drafts', { token: auth.token,
      query: { select: 'revision,payload,updated_at', graph_id: `eq.${id}`, limit: '1' } });
    return withSession({ graph: graphs?.[0] || null, draft: drafts?.[0] || null }, auth, request);
  }
  if (request.method === 'GET' && op === 'graph-versions') {
    const id = uuid(url.searchParams.get('graph'), 'Graph ID');
    const graphs = await supabase('/rest/v1/skillloop_v4_graphs', { token: auth.token,
      query: { select: 'id,owner_id', id: `eq.${id}`, limit: '1' } });
    if (!graphs?.[0]) return withSession({ versions: [] }, auth, request);
    if (graphs[0].owner_id !== auth.user.id) throw new HttpError(403, 'Graph belongs to another teacher.');
    const versions = await supabase('/rest/v1/skillloop_v4_graph_versions', { token: auth.token,
      query: { select: 'version,published_at', graph_id: `eq.${id}`,
        withdrawn_reason: 'is.null', order: 'version.desc', limit: '1000' } });
    return withSession({ versions: versions || [] }, auth, request);
  }
  if (request.method === 'GET' && op === 'graph-version') {
    const id = uuid(url.searchParams.get('graph'), 'Graph ID');
    const selected = version(url.searchParams.get('version'));
    const graphs = await supabase('/rest/v1/skillloop_v4_graphs', { token: auth.token,
      query: { select: 'id,owner_id', id: `eq.${id}`, limit: '1' } });
    if (!graphs?.[0] || graphs[0].owner_id !== auth.user.id)
      throw new HttpError(404, 'Graph Version is unavailable.');
    const versions = await supabase('/rest/v1/skillloop_v4_graph_versions', { token: auth.token,
      query: { select: 'version,payload,sources,published_at', graph_id: `eq.${id}`,
        version: `eq.${selected}`, withdrawn_reason: 'is.null', limit: '1' } });
    if (!versions?.[0]) throw new HttpError(404, 'Graph Version is unavailable.');
    return withSession({ graphVersion: versions[0] }, auth, request);
  }
  if (request.method === 'GET' && op === 'independent-graphs') {
    const graphs = await supabase('/rest/v1/skillloop_graphs', { token: auth.token,
      query: { select: 'id,title,current_version', owner_id: `eq.${auth.user.id}`,
        current_version: 'not.is.null', order: 'created_at.desc', limit: '100' } });
    return withSession({ graphs: graphs || [] }, auth, request);
  }
  if (request.method === 'GET' && op === 'reusable-concepts') {
    const versions = await supabase('/rest/v1/skillloop_v4_graph_versions', { token: auth.token,
      query: { select: 'graph_id,version,payload', published_by: `eq.${auth.user.id}`,
        withdrawn_reason: 'is.null', order: 'published_at.desc', limit: '30' } });
    const concepts = (versions || []).flatMap((record) => (record.payload.nodes || []).map((node) => ({
      graphId: record.graph_id, version: record.version, graphTitle: record.payload.title,
      nodeId: node.id, title: node.title,
    }))).slice(0, 500);
    return withSession({ concepts }, auth, request);
  }
  if (request.method === 'GET' && op === 'proposals') {
    const id = uuid(url.searchParams.get('unit'), 'Unit ID');
    await ownUnitDraft(auth, id);
    const proposals = await supabase('/rest/v1/skillloop_v4_proposals', { token: auth.token,
      query: { select: 'id,kind,unit_revision,plan_revision,payload,accepted_at,dismissed_at,created_at', unit_id: `eq.${id}`,
        order: 'created_at.desc', limit: '20' } });
    return withSession({ proposals }, auth, request);
  }
  if (request.method === 'GET' && op === 'jobs') {
    const id = uuid(url.searchParams.get('unit'), 'Unit ID');
    await ownUnitDraft(auth, id);
    const jobs = await supabase('/rest/v1/skillloop_v4_jobs', { token: auth.token,
      query: { select: 'id,kind,status,error,updated_at,created_at', unit_id: `eq.${id}`,
        order: 'created_at.desc', limit: '20' } });
    return withSession({ jobs: (jobs || []).map((job) => ({ ...job,
      effectiveStatus: ['queued', 'running'].includes(job.status) &&
        Date.now() - Date.parse(job.updated_at) > 180000 ? 'interrupted' : job.status })) }, auth, request);
  }
  if (request.method === 'POST' && op === 'verify-proposal') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const proposalId = uuid(input.proposalId, 'Proposal ID');
    const draft = await ownUnitDraft(auth, id);
    const rows = await supabase('/rest/v1/skillloop_v4_proposals', { token: auth.token,
      query: { select: 'unit_revision,plan_revision,kind,payload,accepted_at,dismissed_at', id: `eq.${proposalId}`,
        unit_id: `eq.${id}`, limit: '1' } });
    const proposal = rows?.[0];
    if (!proposal || proposal.accepted_at || proposal.dismissed_at)
      throw new HttpError(409, 'Proposal is unavailable or already reviewed.');
    if (draft.revision !== proposal.unit_revision ||
      ['generate', 'regenerate'].includes(proposal.kind) && proposal.plan_revision !== draft.plan_revision)
      throw new HttpError(409, 'Draft changed after this proposal. Generate a fresh proposal.');
    if (proposal.kind === 'regenerate' && proposal.payload.graphId) {
      const graph = await ownGraphDraft(auth, uuid(proposal.payload.graphId, 'Graph ID'));
      if (graph.revision !== proposal.payload.graphRevision)
        throw new HttpError(409, 'Graph changed after this proposal. Regenerate the item.');
    }
    return withSession({ current: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'accept-proposal') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const proposalId = uuid(input.proposalId, 'Proposal ID');
    await ownUnitDraft(auth, id);
    const rows = await supabase('/rest/v1/skillloop_v4_proposals', { token: auth.token,
      query: { select: 'id,accepted_at,dismissed_at',
        id: `eq.${proposalId}`, unit_id: `eq.${id}`, limit: '1' } });
    const proposal = rows?.[0];
    if (!proposal || proposal.accepted_at || proposal.dismissed_at)
      throw new HttpError(409, 'Proposal is unavailable or already reviewed.');
    const updated = await admin('/rest/v1/skillloop_v4_proposals', { method: 'PATCH', token: auth.token,
      query: { id: `eq.${proposalId}`, unit_id: `eq.${id}`, accepted_at: 'is.null', dismissed_at: 'is.null' },
      body: { accepted_at: new Date().toISOString() }, prefer: 'return=representation' });
    if (!updated?.length) throw new HttpError(409, 'Proposal was reviewed in another session.');
    return withSession({ accepted: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'dismiss-proposal') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const proposalId = uuid(input.proposalId, 'Proposal ID');
    await ownUnitDraft(auth, id);
    const updated = await admin('/rest/v1/skillloop_v4_proposals', { method: 'PATCH', token: auth.token,
      query: { id: `eq.${proposalId}`, unit_id: `eq.${id}`, owner_id: `eq.${auth.user.id}`,
        accepted_at: 'is.null', dismissed_at: 'is.null' },
      body: { dismissed_at: new Date().toISOString() }, prefer: 'return=representation' });
    if (!updated?.length) throw new HttpError(409, 'Proposal is unavailable or already reviewed.');
    return withSession({ dismissed: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'analyze') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, id);
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
    if (Boolean(rawUrl) === Boolean(topic) || topic.length > 2000)
      throw new HttpError(400, 'Provide one public source URL or one teaching topic.');
    const jobId = input.requestId ? uuid(input.requestId, 'Request ID') : randomUUID();
    const jobInput = { url: rawUrl || null, topic: topic || null, revision: draft.revision };
    const reused = await reusedProposal(auth, id, jobId, 'plan', jobInput);
    if (reused) return withSession({ proposal: reused, reused: true }, auth, request);
    try {
      await admin('/rest/v1/skillloop_v4_jobs', { method: 'POST', token: auth.token,
        body: { id: jobId, unit_id: id, owner_id: auth.user.id, kind: 'plan', status: 'queued',
          idempotency_key: jobId, input: jobInput }, prefer: 'return=minimal' });
    } catch (error) {
      if (error.status !== 409) throw error;
      const prior = await reusedProposal(auth, id, jobId, 'plan', jobInput);
      if (prior) return withSession({ proposal: prior, reused: true }, auth, request);
      throw error;
    }
    return executeSubmittedJob(jobId, auth, request);
  }
  if (request.method === 'POST' && op === 'generate') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, id);
    if (draft.revision !== input.expectedRevision) throw new HttpError(409, 'Unit draft changed; reload before generating.');
    if (draft.confirmed_plan_revision !== draft.plan_revision || !isPlanConfirmed(draft.payload))
      throw new HttpError(400, 'Confirm Direction Planning before generation.');
    if (!Array.isArray(input.directionIds) || !input.directionIds.length ||
      input.directionIds.length > MAX_GENERATION_DIRECTIONS ||
      new Set(input.directionIds).size !== input.directionIds.length)
      throw new HttpError(400, `Select 1–${MAX_GENERATION_DIRECTIONS} confirmed Directions per AI job.`);
    const jobId = input.requestId ? uuid(input.requestId, 'Request ID') : randomUUID();
    const jobInput = { revision: draft.revision, directionIds: input.directionIds };
    const reused = await reusedProposal(auth, id, jobId, 'generate', jobInput);
    if (reused) return withSession({ proposal: reused, reused: true }, auth, request);
    const pendingProposals = await supabase('/rest/v1/skillloop_v4_proposals', { token: auth.token,
      query: { select: 'id', unit_id: `eq.${id}`, unit_revision: `eq.${draft.revision}`,
        kind: 'eq.generate', accepted_at: 'is.null', dismissed_at: 'is.null', limit: '1' } });
    if (pendingProposals?.length)
      throw new HttpError(409, 'Review or dismiss the current generation proposal before starting another batch.');
    const activeJobs = await supabase('/rest/v1/skillloop_v4_jobs', { token: auth.token,
      query: { select: 'updated_at', unit_id: `eq.${id}`, kind: 'eq.generate',
        status: 'in.(queued,running)', limit: '10' } });
    if (activeJobs?.some((job) => Date.now() - Date.parse(job.updated_at) <= 180000))
      throw new HttpError(409, 'A generation batch is still running. Wait for its proposal.');
    try {
      await admin('/rest/v1/skillloop_v4_jobs', { method: 'POST', token: auth.token,
        body: { id: jobId, unit_id: id, owner_id: auth.user.id, kind: 'generate', status: 'queued',
          idempotency_key: jobId, input: jobInput }, prefer: 'return=minimal' });
    } catch (error) {
      if (error.status !== 409) throw error;
      const prior = await reusedProposal(auth, id, jobId, 'generate', jobInput);
      if (prior) return withSession({ proposal: prior, reused: true }, auth, request);
      throw error;
    }
    return executeSubmittedJob(jobId, auth, request);
  }
  if (request.method === 'POST' && op === 'regenerate-item') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, id);
    if (draft.revision !== input.expectedRevision) throw new HttpError(409, 'Unit draft changed; reload before regenerating.');
    if (draft.confirmed_plan_revision !== draft.plan_revision || !isPlanConfirmed(draft.payload))
      throw new HttpError(400, 'Confirm Direction Planning before AI regeneration.');
    if (!['section', 'activity', 'node', 'edge'].includes(input.kind) ||
      typeof input.itemId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input.itemId))
      throw new HttpError(400, 'Choose a valid content item.');
    let item, graphDraft = null, graphId = null;
    if (input.kind === 'section') item = draft.payload.sections.find((entry) => entry.id === input.itemId);
    if (input.kind === 'activity') item = draft.payload.activities.find((entry) => entry.id === input.itemId);
    if (['node', 'edge'].includes(input.kind)) {
      graphId = uuid(input.graphId, 'Graph ID');
      if (!draft.payload.directions.some((direction) => direction.graphId === graphId))
        throw new HttpError(403, 'Graph does not belong to this Unit.');
      graphDraft = await ownGraphDraft(auth, graphId);
      if (graphDraft.revision !== input.expectedGraphRevision) throw new HttpError(409, 'Graph draft changed; reload before regenerating.');
      item = (input.kind === 'node' ? graphDraft.payload.nodes : graphDraft.payload.edges)
        .find((entry) => entry.id === input.itemId);
    }
    if (!item) throw new HttpError(404, 'Content item is unavailable.');
    const jobId = input.requestId ? uuid(input.requestId, 'Request ID') : randomUUID();
    const jobInput = { revision: draft.revision, kind: input.kind, itemId: input.itemId,
      graphId, graphRevision: graphDraft?.revision || null };
    const reused = await reusedProposal(auth, id, jobId, 'regenerate', jobInput);
    if (reused) return withSession({ proposal: reused, reused: true }, auth, request);
    await admin('/rest/v1/skillloop_v4_jobs', { method: 'POST', token: auth.token,
      body: { id: jobId, unit_id: id, owner_id: auth.user.id, kind: 'regenerate',
        status: 'queued', idempotency_key: jobId, input: jobInput }, prefer: 'return=minimal' });
    return executeSubmittedJob(jobId, auth, request);
  }
  if (request.method === 'POST' && op === 'create-unit') {
    const input = await bodyJson(request);
    const unit = createUnitDraft();
    if (input.type) unit.type = input.type;
    if (input.title) unit.title = input.title.trim();
    validate(unit, validateUnitDraft, { allowIncomplete: true });
    const revision = await supabase('/rest/v1/rpc/skillloop_v4_create_unit', { method: 'POST', token: auth.token,
      body: { p_unit: unit.id, p_payload: unit } });
    return withSession({ unit, revision }, auth, request, 201);
  }
  if (request.method === 'POST' && op === 'save-unit') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const unit = validate(input.payload, validateUnitDraft, { allowIncomplete: true });
    if (unit.id !== id) throw new HttpError(400, 'Unexpected Unit ID.');
    const revision = await supabase('/rest/v1/rpc/skillloop_v4_save_unit', { method: 'POST', token: auth.token,
      body: { p_unit: id, p_expected: uuid(input.expectedRevision, 'Revision'), p_payload: unit } });
    return withSession({ revision }, auth, request);
  }
  if (request.method === 'POST' && op === 'confirm-plan') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, id);
    if (draft.revision !== input.expectedRevision) throw new HttpError(409, 'Unit draft changed; reload before confirming.');
    const confirmed = validate(draft.payload, confirmPlan);
    const result = await supabase('/rest/v1/rpc/skillloop_v4_confirm_plan', { method: 'POST', token: auth.token,
      body: { p_unit: id, p_expected: draft.revision,
        p_fingerprint: confirmed.confirmedPlanFingerprint } });
    return withSession({ revision: result.revision, planRevision: result.planRevision,
      unit: confirmed }, auth, request);
  }
  if (request.method === 'POST' && op === 'save-graph') {
    const input = await bodyJson(request);
    const id = uuid(input.graphId, 'Graph ID');
    const unitId = input.unitId ? uuid(input.unitId, 'Unit ID') : null;
    const sources = unitId ? (await ownUnitDraft(auth, unitId)).payload.sources : [];
    const graph = validate(input.payload, (payload) => validateDirectionGraph(payload, sources, { allowIncomplete: true }));
    if (graph.id !== id || (unitId && graph.directionId !== input.directionId))
      throw new HttpError(400, 'Unexpected Graph identity.');
    const revision = await supabase('/rest/v1/rpc/skillloop_v4_save_graph', { method: 'POST', token: auth.token,
      body: { p_graph: id, p_unit: unitId, p_direction: unitId ? graph.directionId : null,
        p_expected: input.expectedRevision ? uuid(input.expectedRevision, 'Revision') : null, p_payload: graph } });
    return withSession({ revision }, auth, request);
  }
  if (request.method === 'POST' && op === 'copy-independent-graph') {
    const input = await bodyJson(request);
    if (input.confirmed !== true || !LEGACY_GRAPH_ID.test(input.sourceGraphId || ''))
      throw new HttpError(400, 'Choose and confirm an independent Graph to reuse.');
    const unitId = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, unitId);
    const direction = draft.payload.directions.find((item) => item.id === input.directionId);
    if (!direction) throw new HttpError(404, 'Direction is unavailable in this Unit.');
    const originals = await supabase('/rest/v1/skillloop_graphs', { token: auth.token,
      query: { select: 'id,title,owner_id,current_version', id: `eq.${input.sourceGraphId}`,
        owner_id: `eq.${auth.user.id}`, current_version: 'not.is.null', limit: '1' } });
    const original = originals?.[0];
    if (!original || original.owner_id !== auth.user.id)
      throw new HttpError(404, 'Published independent Graph is unavailable.');
    if (input.sourceVersion !== original.current_version)
      throw new HttpError(409, 'Independent Graph Version changed. Choose it again.');
    const versions = await supabase('/rest/v1/skillloop_publications', { token: auth.token,
      query: { select: 'payload', graph_id: `eq.${original.id}`,
        version: `eq.${original.current_version}`, limit: '1' } });
    const source = versions?.[0]?.payload;
    if (!source || !Array.isArray(source.topics) || !Array.isArray(source.relations))
      throw new HttpError(422, 'Published independent Graph content is unavailable.');
    const existing = await supabase('/rest/v1/skillloop_v4_graph_drafts', { token: auth.token,
      query: { select: 'revision', graph_id: `eq.${direction.graphId}`, limit: '1' } });
    if (existing?.length) throw new HttpError(409,
      'This Direction already has a Graph draft. Existing edits were preserved.');
    const active = source.topics.filter((topic) => !topic.archived);
    if (!active.length) throw new HttpError(422, 'Independent Graph has no active concepts to copy.');
    const ids = new Set(active.map((topic) => topic.id));
    const graph = { schemaVersion: '0.4', id: direction.graphId, directionId: direction.id,
      title: direction.title, importedFrom: { graphId: original.id, version: original.current_version },
      nodes: active.map((topic) => ({ id: topic.id, title: topic.title,
        description: topic.lesson?.explanation || topic.description,
        claimKind: 'general', evidenceRefs: [],
        ...(Number.isFinite(topic.position?.x) && Number.isFinite(topic.position?.y)
          ? { x: topic.position.x, y: topic.position.y } :
          Number.isInteger(topic.position?.column) && Number.isInteger(topic.position?.row)
            ? { x: 80 + (topic.position.column - 1) * 230,
              y: 70 + (topic.position.row - 1) * 135 } : {}) })),
      edges: source.relations.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target,
          label: edge.type.replaceAll('-', ' '), reason: edge.reason,
          basis: 'teaching-association', evidenceRefs: [] })) };
    validate(graph, (value) => validateDirectionGraph(value, draft.payload.sources, { allowIncomplete: true }));
    const revision = await supabase('/rest/v1/rpc/skillloop_v4_save_graph', { method: 'POST', token: auth.token,
      body: { p_graph: graph.id, p_unit: unitId, p_direction: direction.id,
        p_expected: null, p_payload: graph } });
    return withSession({ revision, graph }, auth, request, 201);
  }
  if (request.method === 'POST' && op === 'copy-concept') {
    const input = await bodyJson(request);
    if (input.confirmed !== true) throw new HttpError(400, 'Confirm the concept reuse first.');
    const unitId = uuid(input.unitId, 'Unit ID');
    const sourceGraphId = uuid(input.sourceGraphId, 'Source Graph ID');
    const sourceVersion = version(input.sourceVersion);
    if (typeof input.sourceNodeId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input.sourceNodeId))
      throw new HttpError(400, 'Invalid source concept ID.');
    const draft = await ownUnitDraft(auth, unitId);
    const direction = draft.payload.directions.find((item) => item.id === input.directionId);
    if (!direction) throw new HttpError(404, 'Direction is unavailable in this Unit.');
    const sourceGraphs = await supabase('/rest/v1/skillloop_v4_graphs', { token: auth.token,
      query: { select: 'id,owner_id', id: `eq.${sourceGraphId}`, owner_id: `eq.${auth.user.id}`, limit: '1' } });
    if (!sourceGraphs?.[0]) throw new HttpError(404, 'Source Graph is unavailable.');
    const versions = await supabase('/rest/v1/skillloop_v4_graph_versions', { token: auth.token,
      query: { select: 'payload', graph_id: `eq.${sourceGraphId}`,
        version: `eq.${sourceVersion}`, withdrawn_reason: 'is.null', limit: '1' } });
    const sourceNode = versions?.[0]?.payload?.nodes?.find((node) => node.id === input.sourceNodeId);
    if (!sourceNode) throw new HttpError(404, 'Published source concept is unavailable.');
    const existing = await supabase('/rest/v1/skillloop_v4_graph_drafts', { token: auth.token,
      query: { select: 'revision,payload', graph_id: `eq.${direction.graphId}`, limit: '1' } });
    const target = existing?.[0];
    if ((target?.revision || null) !== (input.expectedGraphRevision || null))
      throw new HttpError(409, 'Graph draft changed; reload before reusing a concept.');
    const graph = target?.payload || { schemaVersion: '0.4', id: direction.graphId,
      directionId: direction.id, title: direction.title, nodes: [], edges: [] };
    const base = sourceNode.id.slice(0, 56);
    let nodeId = base, index = 2;
    while (graph.nodes.some((node) => node.id === nodeId)) nodeId = `${base}-${index++}`;
    graph.nodes.push({ ...sourceNode, id: nodeId, evidenceRefs: [],
      reusedFrom: { graphId: sourceGraphId, version: sourceVersion, nodeId: sourceNode.id } });
    validate(graph, (value) => validateDirectionGraph(value, draft.payload.sources, { allowIncomplete: true }));
    const revision = await supabase('/rest/v1/rpc/skillloop_v4_save_graph', { method: 'POST', token: auth.token,
      body: { p_graph: graph.id, p_unit: unitId, p_direction: direction.id,
        p_expected: target?.revision || null, p_payload: graph } });
    return withSession({ revision, graph, nodeId }, auth, request, 201);
  }
  if (request.method === 'POST' && op === 'publish-unit') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const draft = await ownUnitDraft(auth, id);
    if (draft.revision !== input.expectedRevision) throw new HttpError(409, 'Unit draft changed; reload before publishing.');
    validate(draft.payload, validatePublishableUnit);
    if (draft.confirmed_plan_revision !== draft.plan_revision || !isPlanConfirmed(draft.payload))
      throw new HttpError(400, 'Confirm Direction Planning before publishing.');
    const captures = await supabase('/rest/v1/skillloop_v4_sources', { token: auth.token,
      query: { select: 'id,metadata', unit_id: `eq.${id}` } });
    const registered = new Map((captures || []).map((item) => [item.id, item.metadata]));
    for (const source of draft.payload.sources.filter((item) => item.origin === 'captured')) {
      const record = registered.get(source.id);
      if (!record || record.snapshotId !== source.snapshotId || record.url !== source.url ||
        record.revision !== source.revision || record.scope !== source.scope ||
        record.contentSha256 !== source.contentSha256)
        throw new HttpError(400, 'Captured source metadata does not match its stored snapshot.');
    }
    if (!Array.isArray(input.graphRefs) || !input.graphRefs.length ||
      input.graphRefs.length > draft.payload.directions.length || input.graphRefs.length > 20)
      throw new HttpError(400, 'Publish at least one completed Direction with a Graph Version.');
    const directions = new Map(draft.payload.directions.map((direction) => [direction.id, direction]));
    const seen = new Set();
    for (const ref of input.graphRefs) {
      uuid(ref.graphId, 'Graph ID');
      if (!directions.has(ref.directionId) || directions.get(ref.directionId).graphId !== ref.graphId ||
        seen.has(ref.directionId)) throw new HttpError(400, 'Graph references must match each confirmed Direction once.');
      seen.add(ref.directionId);
      if (Boolean(ref.draftRevision) === Boolean(ref.version))
        throw new HttpError(400, 'Choose an existing Graph Version or a new Graph draft.');
      if (ref.draftRevision) {
        const graph = await ownGraphDraft(auth, ref.graphId);
        if (graph.revision !== ref.draftRevision) throw new HttpError(409, 'Graph draft changed; reload before publishing.');
        validate(graph.payload, (payload) => validateDirectionGraph(payload, draft.payload.sources));
      } else {
        version(ref.version);
        const versions = await supabase('/rest/v1/skillloop_v4_graph_versions', { token: auth.token,
          query: { select: 'payload,sources', graph_id: `eq.${ref.graphId}`, version: `eq.${ref.version}`, limit: '1' } });
        if (!versions?.[0]) throw new HttpError(400, 'Selected Graph Version is unavailable.');
        validate(versions[0].payload, (payload) => validateDirectionGraph(payload, versions[0].sources));
      }
    }
    const publishedVersion = await supabase('/rest/v1/rpc/skillloop_v4_publish_unit', { method: 'POST', token: auth.token,
      body: { p_unit: id, p_expected: draft.revision, p_graph_refs: input.graphRefs } });
    return withSession({ version: publishedVersion }, auth, request);
  }
  if (request.method === 'POST' && op === 'withdraw-unit') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) throw new HttpError(400, 'Provide a short withdrawal reason.');
    await supabase('/rest/v1/rpc/skillloop_v4_withdraw_unit', { method: 'POST', token: auth.token,
      body: { p_unit: id, p_reason: reason } });
    return withSession({ withdrawn: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'withdraw-unit-version') {
    const input = await bodyJson(request);
    const id = uuid(input.unitId, 'Unit ID');
    const selected = version(input.version);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) throw new HttpError(400, 'Provide a short withdrawal reason.');
    await supabase('/rest/v1/rpc/skillloop_v4_withdraw_unit_version', { method: 'POST', token: auth.token,
      body: { p_unit: id, p_version: selected, p_reason: reason } });
    return withSession({ withdrawn: true, version: selected }, auth, request);
  }
  if (request.method === 'POST' && op === 'withdraw-graph-version') {
    const input = await bodyJson(request);
    const id = uuid(input.graphId, 'Graph ID');
    const selected = version(input.version);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) throw new HttpError(400, 'Provide a short withdrawal reason.');
    await supabase('/rest/v1/rpc/skillloop_v4_withdraw_graph_version', { method: 'POST', token: auth.token,
      body: { p_graph: id, p_version: selected, p_reason: reason } });
    return withSession({ withdrawn: true, version: selected }, auth, request);
  }
  throw new HttpError(404, 'Unknown Knowledge v0.4 endpoint.');
}

export default {
  async fetch(request) {
    try { return await handle(request); }
    catch (error) {
      if (!(error instanceof HttpError)) console.error('Knowledge v0.4 API error:', error);
      if (error instanceof HttpError && /Could not find the table 'public\.skillloop_v4_/.test(error.message))
        return json({ error: 'Knowledge v0.4 is not ready on this database.' }, 503, refreshedHeaders(request));
      return json({ error: error instanceof HttpError ? error.message : 'Knowledge v0.4 service failed.' },
        error instanceof HttpError ? error.status : 500, refreshedHeaders(request));
    }
  },
};
