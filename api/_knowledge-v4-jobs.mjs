import { createHash } from 'node:crypto';
import { HttpError, supabase } from './knowledge.mjs';
import { isPlanConfirmed } from './_knowledge-v4-model.mjs';
import { captureSource, proposePlan, proposeGeneration, proposeLocalRevision } from './_knowledge-v4-ai.mjs';

export class JobBusy extends Error {}

function admin(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, 'Knowledge AI storage is not configured.');
  return supabase(path, { ...options, token: key, keyOverride: key });
}

async function jobRow(id) {
  const rows = await admin('/rest/v1/skillloop_v4_jobs', { query: {
    select: 'id,unit_id,owner_id,kind,status,input,updated_at', id: `eq.${id}`, limit: '1',
  } });
  if (!rows?.[0]) throw new HttpError(404, 'AI task is unavailable.');
  return rows[0];
}

async function claimJob(job) {
  if (['completed', 'failed'].includes(job.status)) return false;
  const staleBefore = new Date(Date.now() - 180000).toISOString();
  const query = { id: `eq.${job.id}`, status: `eq.${job.status}` };
  if (job.status === 'running') {
    if (Date.parse(job.updated_at) >= Date.parse(staleBefore)) throw new JobBusy('AI task is still running.');
    query.updated_at = `lt.${staleBefore}`;
  } else if (job.status !== 'queued') throw new HttpError(409, 'Invalid AI task state.');
  const claimed = await admin('/rest/v1/skillloop_v4_jobs', { method: 'PATCH', query,
    body: { status: 'running', updated_at: new Date().toISOString() }, prefer: 'return=representation' });
  if (!claimed?.length) {
    const current = await jobRow(job.id);
    if (['completed', 'failed'].includes(current.status)) return false;
    throw new JobBusy('AI task was claimed by another worker.');
  }
  return true;
}

async function markJob(jobId, status, fields = {}) {
  await admin('/rest/v1/skillloop_v4_jobs', { method: 'PATCH',
    query: { id: `eq.${jobId}`, status: 'in.(queued,running)' },
    body: { status, ...fields, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
}

async function completeStoredProposal(jobId, proposalId) {
  await admin('/rest/v1/skillloop_v4_jobs', { method: 'PATCH',
    query: { id: `eq.${jobId}`, status: 'in.(queued,running,failed)' },
    body: { status: 'completed', result: { proposalId }, error: null,
      updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
}

async function sourceForPlan(job) {
  if (!job.input.url) return { source: null, capture: null };
  const existing = await admin('/rest/v1/skillloop_v4_sources', { query: {
    select: 'metadata,snapshot', id: `eq.${job.id}`, unit_id: `eq.${job.unit_id}`, limit: '1',
  } });
  if (existing?.[0]) return { source: existing[0].metadata,
    capture: { ...existing[0].metadata, content: existing[0].snapshot?.content || '' } };
  const capture = await captureSource(job.input.url);
  const contentSha256 = createHash('sha256').update(capture.content).digest('hex');
  const source = { id: job.id, title: capture.title, url: capture.url, origin: 'captured',
    snapshotId: job.id, revision: capture.revision, retrievedAt: capture.retrievedAt,
    publisher: capture.publisher || null, publishedAt: capture.publishedAt || null,
    canonicalUrl: capture.canonicalUrl || capture.url,
    scope: capture.scope, contentSha256 };
  await admin('/rest/v1/skillloop_v4_sources', { method: 'POST',
    body: { id: source.id, unit_id: job.unit_id, owner_id: job.owner_id,
      metadata: source, snapshot: { content: capture.content, contentSha256 } }, prefer: 'return=minimal' });
  return { source, capture };
}

async function acceptedCaptures(job, draft) {
  const rows = await admin('/rest/v1/skillloop_v4_sources', { query: {
    select: 'metadata,snapshot', unit_id: `eq.${job.unit_id}`, owner_id: `eq.${job.owner_id}`,
  } });
  const accepted = new Set(draft.payload.sources.map((source) => source.id));
  return (rows || []).filter((row) => accepted.has(row.metadata.id));
}

async function makeProposal(job, draft) {
  if (draft.revision !== job.input.revision) throw new HttpError(409,
    'Unit draft changed before the AI task started. Retry from the current draft.');
  if (job.kind === 'plan') {
    const { source, capture } = await sourceForPlan(job);
    return { payload: { ...await proposePlan({ topic: job.input.topic, capture }), source },
      planRevision: null };
  }
  if (draft.confirmed_plan_revision !== draft.plan_revision || !isPlanConfirmed(draft.payload))
    throw new HttpError(409, 'Direction Planning changed before the AI task started.');
  const captures = await acceptedCaptures(job, draft);
  if (job.kind === 'generate') return {
    payload: await proposeGeneration(draft.payload, captures, job.input.directionIds),
    planRevision: draft.plan_revision,
  };
  if (job.kind === 'regenerate') {
    const { kind, itemId, graphId, graphRevision } = job.input;
    let item;
    if (kind === 'section') item = draft.payload.sections.find((entry) => entry.id === itemId);
    if (kind === 'activity') item = draft.payload.activities.find((entry) => entry.id === itemId);
    if (graphId) {
      const rows = await admin('/rest/v1/skillloop_v4_graph_drafts', { query: {
        select: 'revision,payload', graph_id: `eq.${graphId}`, owner_id: `eq.${job.owner_id}`, limit: '1',
      } });
      if (!rows?.[0] || rows[0].revision !== graphRevision ||
        !draft.payload.directions.some((direction) => direction.graphId === graphId))
        throw new HttpError(409, 'Graph draft changed before the AI task started.');
      item = (kind === 'node' ? rows[0].payload.nodes : rows[0].payload.edges)
        .find((entry) => entry.id === itemId);
    }
    if (!item) throw new HttpError(404, 'Content item is unavailable.');
    const text = kind === 'section' ? item.body : kind === 'activity' ? item.prompt :
      kind === 'node' ? item.description : item.reason;
    const revised = await proposeLocalRevision({ kind, text, unit: draft.payload, captures });
    return { payload: { kind, itemId, graphId, graphRevision, originalText: text, text: revised },
      planRevision: draft.plan_revision };
  }
  throw new HttpError(400, 'Unsupported AI task kind.');
}

export async function runAIJob(jobId, { throwOnFailure = true } = {}) {
  const job = await jobRow(jobId);
  const prior = await admin('/rest/v1/skillloop_v4_proposals', { query: {
    select: 'id,payload', job_id: `eq.${job.id}`, limit: '1',
  } });
  if (prior?.[0]) {
    if (job.status !== 'completed') await completeStoredProposal(job.id, prior[0].id);
    return { id: prior[0].id, ...prior[0].payload };
  }
  if (!await claimJob(job)) return null;
  try {
    const drafts = await admin('/rest/v1/skillloop_v4_unit_drafts', { query: {
      select: 'owner_id,revision,plan_revision,confirmed_plan_revision,payload',
      unit_id: `eq.${job.unit_id}`, limit: '1',
    } });
    const draft = drafts?.[0];
    if (!draft || draft.owner_id !== job.owner_id)
      throw new HttpError(403, 'AI task no longer belongs to this Unit.');
    const { payload, planRevision } = await makeProposal(job, draft);
    const sourceRefs = (job.kind === 'plan' ? (payload.source ? [payload.source] : []) :
      draft.payload.sources.filter((source) => source.origin === 'captured'))
      .map((source) => ({ sourceId: source.id, snapshotId: source.snapshotId,
        contentSha256: source.contentSha256 }));
    const proposalId = job.id;
    await admin('/rest/v1/skillloop_v4_proposals', { method: 'POST',
      body: { id: proposalId, unit_id: job.unit_id, owner_id: job.owner_id,
        job_id: job.id, kind: job.kind, unit_revision: draft.revision,
        plan_revision: planRevision, model: process.env.KNOWLEDGE_V4_OPENROUTER_MODEL,
        prompt_version: `knowledge-v4-${job.kind}-1`, schema_version: '0.4',
        source_refs: sourceRefs, payload }, prefer: 'return=minimal' });
    await completeStoredProposal(job.id, proposalId);
    return { id: proposalId, ...payload };
  } catch (error) {
    const saved = await admin('/rest/v1/skillloop_v4_proposals', { query: {
      select: 'id,payload', job_id: `eq.${job.id}`, limit: '1',
    } }).catch(() => []);
    if (saved?.[0]) {
      await completeStoredProposal(job.id, saved[0].id);
      return { id: saved[0].id, ...saved[0].payload };
    }
    await markJob(job.id, 'failed', { error: String(error.message || error).slice(0, 500) });
    if (throwOnFailure) throw error;
    return null;
  }
}
