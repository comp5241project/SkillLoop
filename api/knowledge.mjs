import { validateGraph } from './_knowledge-model.mjs';

const defaultGraphId = 'software-development';
const cookieAccess = 'sl_knowledge_access';
const cookieRefresh = 'sl_knowledge_refresh';
const refreshedByRequest = new WeakMap();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: resultHeaders });
}

function settings() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !/^https:\/\//.test(base)) throw new HttpError(503, 'Knowledge backend is not configured.');
  return { base, key };
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter((part) => part.length === 2));
}

function cookie(name, value, request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/api/knowledge; Max-Age=${maxAge}${secure}`;
}

function authCookies(request, tokens) {
  const headers = new Headers();
  headers.append('Set-Cookie', cookie(cookieAccess, tokens.access_token, request,
    Math.max(1, Math.min(Number(tokens.expires_in) || 3600, 3600))));
  headers.append('Set-Cookie', cookie(cookieRefresh, tokens.refresh_token, request, 60 * 60 * 24 * 30));
  return headers;
}

function clearCookies(request) {
  const headers = new Headers();
  headers.append('Set-Cookie', cookie(cookieAccess, '', request, 0));
  headers.append('Set-Cookie', cookie(cookieRefresh, '', request, 0));
  return headers;
}

async function bodyJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSON request required.');
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new HttpError(413, 'Request is too large.');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, 'Invalid JSON object.'); }
}

async function supabase(path, { method = 'GET', token, body, query, prefer } = {}) {
  const { base, key } = settings();
  const url = new URL(path, base);
  if (query) Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { method, headers: {
    apikey: key,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(prefer ? { Prefer: prefer } : {}),
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const content = await response.text();
  let data;
  try { data = content ? JSON.parse(content) : null; } catch { data = null; }
  if (!response.ok) {
    const status = response.status;
    throw new HttpError(status >= 400 && status < 500 ? status : 502,
      data?.message || data?.error_description || 'Knowledge service request failed.');
  }
  return data;
}

async function session(request, required = true) {
  const cookies = parseCookies(request);
  let token = cookies[cookieAccess];
  let refreshed;
  let user;
  if (token) {
    try { user = await supabase('/auth/v1/user', { token }); } catch { token = null; }
  }
  if (!user && cookies[cookieRefresh]) {
    try {
      refreshed = await supabase('/auth/v1/token', { method: 'POST',
        query: { grant_type: 'refresh_token' }, body: { refresh_token: cookies[cookieRefresh] } });
      token = refreshed.access_token;
      user = await supabase('/auth/v1/user', { token });
      refreshedByRequest.set(request, refreshed);
    } catch { token = null; }
  }
  if (!user) {
    if (required) throw new HttpError(401, 'Sign in required.');
    return null;
  }
  const roles = await supabase('/rest/v1/skillloop_roles', { token,
    query: { select: 'role', user_id: `eq.${user.id}`, limit: '1' } });
  return { token, user, role: roles?.[0]?.role || 'student', refreshed };
}

function withSession(data, auth, request, status = 200) {
  const headers = auth?.refreshed ? authCookies(request, auth.refreshed) : {};
  return json(data, status, headers);
}

function teacher(auth) {
  if (auth.role !== 'teacher') throw new HttpError(403, 'Teacher access required.');
}

function validConcept(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new HttpError(400, 'Invalid concept ID.');
  return value;
}

function validGraph(value) { return validConcept(value || defaultGraphId); }

function graphFrom(url) { return validGraph(url.searchParams.get('graph')); }

function uuid(value, name = 'ID') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new HttpError(400, `Invalid ${name}.`);
  return value;
}

function personalKey(value) {
  if (typeof value !== 'string' || value.length > 135 ||
      !/^(note:[0-9a-f-]{36}|[a-z][a-z0-9-]{0,63}:[a-z][a-z0-9-]{0,63})$/.test(value))
    throw new HttpError(400, 'Invalid personal node key.');
  return value;
}

function coordinate(value) {
  if (!Number.isInteger(value) || Math.abs(value) > 100000) throw new HttpError(400, 'Invalid node position.');
  return value;
}

async function publicGraph(id = defaultGraphId, requestedVersion) {
  const graphs = await supabase('/rest/v1/skillloop_graphs', { query: {
    select: 'current_version', id: `eq.${id}`, limit: '1',
  } });
  const version = requestedVersion || graphs?.[0]?.current_version;
  if (!version) throw new HttpError(404, 'No published graph is available.');
  if (!graphs?.[0]?.current_version) throw new HttpError(404, 'No published graph is available.');
  if (requestedVersion && (typeof requestedVersion !== 'string' || requestedVersion.length > 40 || !/^[a-zA-Z0-9.-]+$/.test(requestedVersion)))
    throw new HttpError(400, 'Invalid publication version.');
  const publications = await supabase('/rest/v1/skillloop_publications', { query: {
    select: 'payload', graph_id: `eq.${id}`, version: `eq.${version}`, limit: '1',
  } });
  if (!publications?.[0]?.payload) throw new HttpError(404, 'Published version is unavailable.');
  return publications[0].payload;
}

async function publicGraphs(page) {
  const pageNumber = page === null ? 0 : Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 0 || pageNumber > 10000 || String(pageNumber) !== (page ?? '0'))
    throw new HttpError(400, 'Invalid directory page.');
  const pageSize = 24;
  const rows = await supabase('/rest/v1/skillloop_graphs', { query: {
    select: 'id,title,current_version', current_version: 'not.is.null', order: 'created_at.desc,id.asc',
    limit: String(pageSize + 1), offset: String(pageNumber * pageSize),
  } });
  const results = await Promise.allSettled((rows || []).slice(0, pageSize).map(async (row) => {
      const graph = await publicGraph(row.id, row.current_version);
      const topics = (graph.topics || []).filter((topic) => !topic.archived);
      return { id: row.id, title: row.title, version: row.current_version,
        description: typeof graph.publication?.description === 'string' && graph.publication.description.trim()
          ? graph.publication.description.trim()
          : `Explore ${topics.slice(0, 3).map((topic) => topic.title).join(', ')}${topics.length > 3 ? ' and more' : ''}.`,
        conceptCount: topics.length };
  }));
  return { graphs: results.filter((result) => result.status === 'fulfilled').map((result) => result.value),
    unavailableCount: results.filter((result) => result.status === 'rejected').length,
    hasMore: (rows || []).length > pageSize };
}

function canonicalSources(output) {
  const found = new Map();
  for (const item of output || []) {
    const candidates = [
      ...(item.type === 'web_search_call' ? item.action?.sources || [] : []),
      ...(item.type === 'message' ? (item.content || []).flatMap((part) => part.annotations || []) : []),
    ];
    for (const source of candidates) {
      const raw = source.url;
      try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') continue;
        url.hash = '';
        found.set(url.href, { url: url.href, title: source.title || url.hostname });
      } catch { /* Ignore malformed provider URLs. */ }
    }
  }
  return [...found.values()].slice(0, 20);
}

async function discover(query, auth) {
  if (!process.env.OPENAI_API_KEY) throw new HttpError(503, 'AI source discovery is not configured.');
  const today = new Date().toISOString().slice(0, 10);
  const recent = await supabase('/rest/v1/skillloop_discovery_runs', { token: auth.token,
    query: { select: 'id', teacher_id: `eq.${auth.user.id}`, created_at: `gte.${today}T00:00:00Z`, limit: '10' } });
  if (recent.length >= 10) throw new HttpError(429, 'Daily source-search limit reached.');
  const model = process.env.OPENAI_MODEL || 'gpt-5.1';
  const prompt = `Find historical reporting or primary incident reports relevant to this software-development teaching topic: ${query}. Return a concise research note with event dates, publication dates when known, and uncertainties. Separate reported facts from possible teaching connections. Do not invent citations. This is for teacher review, not publication.`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ model, tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'], input: prompt, max_output_tokens: 900 }) });
  const result = await response.json();
  if (!response.ok) throw new HttpError(502, result.error?.message || 'Source search failed.');
  const summary = (result.output || []).filter((item) => item.type === 'message')
    .flatMap((item) => item.content || []).filter((part) => part.type === 'output_text')
    .map((part) => part.text).join('\n').slice(0, 12000);
  const sources = canonicalSources(result.output);
  if (!summary || !sources.length) throw new HttpError(502, 'No sourced result was returned. Try a narrower query.');
  await supabase('/rest/v1/skillloop_discovery_runs', { method: 'POST', token: auth.token,
    body: { teacher_id: auth.user.id, query, model, input_text: prompt, summary, sources },
    prefer: 'return=minimal' });
  return { summary, sources, model, retrievedAt: new Date().toISOString() };
}

async function handle(request) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') || 'public';
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-origin request rejected.');
  }
  if (request.method === 'GET' && op === 'public') return json({ graph: await publicGraph(graphFrom(url), url.searchParams.get('version')) });
  if (request.method === 'GET' && op === 'public-graphs') return json(await publicGraphs(url.searchParams.get('page')));
  if (request.method === 'POST' && op === 'login') {
    const { email, password } = await bodyJson(request);
    if (typeof email !== 'string' || email.length > 320 || typeof password !== 'string' || password.length > 1000)
      throw new HttpError(400, 'Email and password required.');
    const tokens = await supabase('/auth/v1/token', { method: 'POST',
      query: { grant_type: 'password' }, body: { email, password } });
    return json({ signedIn: true }, 200, authCookies(request, tokens));
  }
  if (request.method === 'POST' && op === 'logout') return json({ signedIn: false }, 200, clearCookies(request));
  if (request.method === 'GET' && op === 'session') {
    const auth = await session(request, false);
    const backendConfigured = Boolean(process.env.SUPABASE_PUBLISHABLE_KEY && /^https:\/\//.test(process.env.SUPABASE_URL || ''));
    return withSession(auth ? { signedIn: true, email: auth.user.email, role: auth.role, backendConfigured }
      : { signedIn: false, backendConfigured }, auth, request);
  }
  const auth = await session(request);
  if (request.method === 'GET' && op === 'my-graphs') {
    teacher(auth);
    const graphs = await supabase('/rest/v1/skillloop_graphs', { token: auth.token,
      query: { select: 'id,title,current_version,created_at', owner_id: `eq.${auth.user.id}`, order: 'created_at.desc' } });
    return withSession({ graphs }, auth, request);
  }
  if (request.method === 'POST' && op === 'create-graph') {
    teacher(auth);
    const input = await bodyJson(request);
    const title = input.title?.trim();
    if (typeof title !== 'string' || title.length < 2 || title.length > 160) throw new HttpError(400, 'Graph title must be 2–160 characters.');
    const id = `graph-${crypto.randomUUID()}`;
    const payload = { publication: { id, title, version: new Date().toISOString().slice(0, 10) + '.1',
      publishedAt: new Date().toISOString().slice(0, 10) }, topics: [{ id: 'start', title: 'Start here',
      icon: 'circle', description: 'Introduce the first concept in this teacher graph.',
      pathRole: 'core', order: 1, position: { x: 80, y: 80 },
      lesson: { goal: 'Describe a clear learning goal for this concept.',
        explanation: 'Write a short explanation of the idea and why it matters to learners.',
        example: 'Give a concrete example that a learner can recognize and discuss.',
        nextAction: 'Suggest one practical action to try after reading this concept.' } }],
      relations: [], events: [], questions: [], activities: [] };
    const revision = await supabase('/rest/v1/rpc/skillloop_save_draft', { method: 'POST', token: auth.token,
      body: { p_graph: id, p_payload: payload, p_expected: null } });
    return withSession({ id, revision }, auth, request, 201);
  }
  if (request.method === 'GET' && op === 'draft') {
    teacher(auth);
    const drafts = await supabase('/rest/v1/skillloop_drafts', { token: auth.token,
      query: { select: 'revision,payload,updated_at', graph_id: `eq.${graphFrom(url)}`, limit: '1' } });
    return withSession({ draft: drafts?.[0] || null }, auth, request);
  }
  if (request.method === 'POST' && op === 'draft') {
    teacher(auth);
    const input = await bodyJson(request);
    let payload;
    try { payload = validateGraph(input.payload); } catch (error) { throw new HttpError(400, error.message); }
    const graphId = validGraph(input.graphId || payload.publication.id);
    if (payload.publication.id !== graphId) throw new HttpError(400, 'Unexpected graph ID.');
    if (input.expectedRevision !== null && input.expectedRevision !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(input.expectedRevision)) throw new HttpError(400, 'Invalid revision.');
    const revision = await supabase('/rest/v1/rpc/skillloop_save_draft', { method: 'POST', token: auth.token,
      body: { p_graph: graphId, p_payload: payload, p_expected: input.expectedRevision || null } });
    return withSession({ revision }, auth, request);
  }
  if (request.method === 'POST' && op === 'publish') {
    teacher(auth);
    const input = await bodyJson(request);
    if (input.reviewed !== true || typeof input.revision !== 'string') throw new HttpError(400, 'Review and saved revision required.');
    const drafts = await supabase('/rest/v1/skillloop_drafts', { token: auth.token,
      query: { select: 'revision,payload', graph_id: `eq.${validGraph(input.graphId)}`, limit: '1' } });
    if (!drafts?.[0] || drafts[0].revision !== input.revision) throw new HttpError(409, 'Draft changed; reload before publishing.');
    try { validateGraph(drafts[0].payload); } catch (error) { throw new HttpError(400, error.message); }
    const version = await supabase('/rest/v1/rpc/skillloop_publish_draft', { method: 'POST', token: auth.token,
      body: { p_graph: validGraph(input.graphId), p_revision: input.revision } });
    return withSession({ version }, auth, request);
  }
  if (request.method === 'GET' && op === 'references') {
    const references = await supabase('/rest/v1/skillloop_references', { token: auth.token,
      query: { select: 'concept_id,source_version,title_snapshot,description_snapshot,note,added_at',
        graph_id: `eq.${graphFrom(url)}`, order: 'added_at.asc' } });
    return withSession({ references }, auth, request);
  }
  if (request.method === 'POST' && ['reference', 'note', 'unreference'].includes(op)) {
    const input = await bodyJson(request);
    const concept = validConcept(input.conceptId);
    const graphId = validGraph(input.graphId);
    if (input.sourceVersion !== undefined && (typeof input.sourceVersion !== 'string' ||
      input.sourceVersion.length > 40 || !/^[a-zA-Z0-9.-]+$/.test(input.sourceVersion)))
      throw new HttpError(400, 'Invalid source version.');
    const rpc = op === 'reference' ? (input.sourceVersion ? 'skillloop_reference_node_version' : 'skillloop_reference_node') :
      op === 'note' ? 'skillloop_update_note' : 'skillloop_remove_reference';
    if (op === 'note' && (typeof input.note !== 'string' || input.note.length > 1000)) throw new HttpError(400, 'Note must be at most 1000 characters.');
    const result = await supabase(`/rest/v1/rpc/${rpc}`, { method: 'POST', token: auth.token,
      body: { p_graph: graphId, p_concept: concept,
        ...(op === 'reference' && input.sourceVersion ? { p_version: input.sourceVersion } : {}),
        ...(op === 'note' ? { p_note: input.note } : {}) } });
    return withSession({ ok: true, ...(op === 'reference' ? { created: result } : {}) }, auth, request);
  }
  if (request.method === 'GET' && op === 'personal') {
    const [references, notes, edges] = await Promise.all([
      supabase('/rest/v1/skillloop_references', { token: auth.token,
        query: { select: 'graph_id,concept_id,source_version,title_snapshot,description_snapshot,note,position_x,position_y,added_at',
          order: 'added_at.asc' } }),
      supabase('/rest/v1/skillloop_personal_nodes', { token: auth.token,
        query: { select: 'id,title,body,position_x,position_y,created_at', order: 'created_at.asc' } }),
      supabase('/rest/v1/skillloop_personal_edges', { token: auth.token,
        query: { select: 'id,source_key,target_key,reason,created_at', order: 'created_at.asc' } }),
    ]);
    return withSession({ nodes: [
      ...references.map((item) => ({ id: `${item.graph_id}:${item.concept_id}`, kind: 'reference',
        graphId: item.graph_id, conceptId: item.concept_id, sourceVersion: item.source_version,
        titleSnapshot: item.title_snapshot, descriptionSnapshot: item.description_snapshot,
        note: item.note, x: item.position_x, y: item.position_y })),
      ...notes.map((item) => ({ id: `note:${item.id}`, kind: 'note', title: item.title,
        body: item.body, x: item.position_x, y: item.position_y })),
    ], edges: edges.map((item) => ({ id: item.id, source: item.source_key,
      target: item.target_key, reason: item.reason, kind: 'personal' })) }, auth, request);
  }
  if (request.method === 'POST' && op === 'personal-note') {
    const input = await bodyJson(request);
    const id = uuid(input.id?.replace(/^note:/, ''), 'note ID');
    const title = input.title?.trim();
    if (typeof title !== 'string' || title.length < 1 || title.length > 100 ||
        typeof input.body !== 'string' || input.body.length > 1000) throw new HttpError(400, 'Invalid personal note.');
    await supabase('/rest/v1/skillloop_personal_nodes', { method: 'POST', token: auth.token,
      query: { on_conflict: 'user_id,id' }, prefer: 'resolution=merge-duplicates,return=minimal',
      body: { user_id: auth.user.id, id, title, body: input.body,
        position_x: coordinate(input.x), position_y: coordinate(input.y) } });
    return withSession({ ok: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'remove-personal-note') {
    const input = await bodyJson(request);
    await supabase('/rest/v1/rpc/skillloop_remove_personal_note', { method: 'POST', token: auth.token,
      body: { p_id: uuid(input.id?.replace(/^note:/, ''), 'note ID') } });
    return withSession({ ok: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'personal-edge') {
    const input = await bodyJson(request);
    const reason = input.reason?.trim();
    if (typeof reason !== 'string' || !reason.length || reason.length > 280) throw new HttpError(400, 'Invalid connection reason.');
    const created = await supabase('/rest/v1/rpc/skillloop_add_personal_edge', { method: 'POST', token: auth.token,
      body: { p_id: uuid(input.id, 'edge ID'), p_source: personalKey(input.source),
        p_target: personalKey(input.target), p_reason: reason } });
    return withSession({ ok: true, created }, auth, request);
  }
  if (request.method === 'POST' && op === 'update-personal-edge') {
    const input = await bodyJson(request);
    const reason = input.reason?.trim();
    if (typeof reason !== 'string' || !reason.length || reason.length > 280)
      throw new HttpError(400, 'Invalid connection reason.');
    const id = uuid(input.id, 'edge ID');
    const updated = await supabase('/rest/v1/skillloop_personal_edges', { method: 'PATCH', token: auth.token,
      query: { select: 'id,reason', id: `eq.${id}`, user_id: `eq.${auth.user.id}` },
      body: { reason }, prefer: 'return=representation' });
    if (!updated?.length) throw new HttpError(404, 'Personal connection not found.');
    return withSession({ edge: updated[0] }, auth, request);
  }
  if (request.method === 'POST' && op === 'remove-personal-edge') {
    const input = await bodyJson(request);
    await supabase('/rest/v1/rpc/skillloop_remove_personal_edge', { method: 'POST', token: auth.token,
      body: { p_id: uuid(input.id, 'edge ID') } });
    return withSession({ ok: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'personal-position') {
    const input = await bodyJson(request);
    await supabase('/rest/v1/rpc/skillloop_move_personal_node', { method: 'POST', token: auth.token,
      body: { p_key: personalKey(input.id), p_x: coordinate(input.x), p_y: coordinate(input.y) } });
    return withSession({ ok: true }, auth, request);
  }
  if (request.method === 'POST' && op === 'import-personal') {
    const input = await bodyJson(request);
    if (!Array.isArray(input.nodes) || !Array.isArray(input.edges) || input.nodes.length > 500 || input.edges.length > 2000)
      throw new HttpError(400, 'Invalid import size.');
    const result = await supabase('/rest/v1/rpc/skillloop_import_personal', { method: 'POST', token: auth.token,
      body: { p_nodes: input.nodes, p_edges: input.edges } });
    return withSession({ imported: result }, auth, request);
  }
  if (request.method === 'POST' && op === 'discover') {
    teacher(auth);
    const input = await bodyJson(request);
    const query = input.query?.trim();
    if (typeof query !== 'string' || query.length < 8 || query.length > 300) throw new HttpError(400, 'Search query must be 8–300 characters.');
    return withSession(await discover(query, auth), auth, request);
  }
  throw new HttpError(404, 'Unknown knowledge endpoint.');
}

export default {
  async fetch(request) {
    try { return await handle(request); }
    catch (error) {
      if (!(error instanceof HttpError)) console.error('Knowledge API error:', error);
      return json({ error: error instanceof HttpError ? error.message : 'Knowledge service failed.' },
        error instanceof HttpError ? error.status : 500,
        refreshedByRequest.has(request) ? authCookies(request, refreshedByRequest.get(request)) : {});
    }
  },
};
