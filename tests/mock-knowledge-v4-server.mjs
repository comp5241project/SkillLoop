// Read-only browser fixture for reviewing the authenticated v0.4 Studio without remote credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unitId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const graphId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const revision = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const unit = { schemaVersion: '0.4', id: unitId, type: 'open-source', title: 'Canvas and scene state',
  summary: 'Explore how a drawing surface responds to events.', guidingQuestion: 'How does a scene change?',
  publisherName: 'Demo Teacher', topics: ['Canvas'], sources: [{
    id: 'dddddddd-dddd-4ddd-dddd-dddddddddddd', title: 'Sample source repository',
    url: 'https://github.com/example/sample', origin: 'captured',
    revision: 'a'.repeat(40), retrievedAt: '2026-10-27T00:00:00Z',
    reviewedAt: '2026-10-27T09:00:00Z',
    snapshotId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
    scope: 'Pinned README and 2 sampled code files: README.md, src/input.js, src/scene.js',
    contentSha256: 'b'.repeat(64) }],
  sections: [{ id: 'overview', kind: 'overview', title: 'Overview', body: 'A scene stores state and responds to input.',
    claimKind: 'general', evidenceRefs: [] }],
  activities: [{ id: 'trace', prompt: 'Trace a pointer event through the scene.',
    guidance: 'List the state before and after.', evidenceRefs: [] }],
  directions: [{ id: 'interaction', graphId, title: 'Interaction Design',
    question: 'How do input events change the scene?', scope: 'Pointer events and state updates' }],
  confirmedPlanFingerprint: null };
const graph = { schemaVersion: '0.4', id: graphId, directionId: 'interaction', title: 'Interaction Design',
  nodes: [{ id: 'pointer', title: 'Pointer event', description: 'An input event from the canvas.',
    claimKind: 'general', evidenceRefs: [], x: 160, y: 180 },
  { id: 'scene', title: 'Scene state', description: 'The state used to draw the scene.',
    claimKind: 'general', evidenceRefs: [], x: 430, y: 180 }],
  edges: [{ id: 'updates', source: 'pointer', target: 'scene', label: 'updates',
    reason: 'Input changes the scene state.', basis: 'teaching-association', evidenceRefs: [] }] };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:8766');
  const send = (status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/api/knowledge') {
    if (url.searchParams.get('op') === 'session') return send(200,
      { signedIn: true, role: 'teacher', email: 'demo@example.org' });
    return send(404, { error: 'Fixture endpoint unavailable.' });
  }
  if (url.pathname === '/api/knowledge-v4') {
    const op = url.searchParams.get('op');
    if (op === 'public-units') return send(200, { units: [{ id: unitId, title: unit.title,
      publisher_name: unit.publisherName, content_type: unit.type, topics: unit.topics,
      current_version: 1, owner_id: unitId }], page: 0 });
    if (op === 'public-teachers') return send(200,
      { teachers: [{ id: unitId, name: unit.publisherName }] });
    if (op === 'public-unit') return send(200, { unit: { id: unitId, version: 1,
      currentVersion: 1, payload: unit,
      graph_refs: [{ directionId: 'interaction', graphId, version: 1 }],
      publisherName: unit.publisherName, published_at: '2026-10-27T00:00:00Z' } });
    if (op === 'public-graph') return send(200, { graph: { id: graphId, version: 1,
      payload: graph, sources: unit.sources, published_at: '2026-10-27T00:00:00Z' } });
    if (op === 'my-units') return send(200, { units: [{ id: unitId, title: unit.title, current_version: null }] });
    if (op === 'unit-draft') return send(200, { draft: { revision, plan_revision: 1,
      confirmed_plan_revision: null, payload: unit } });
    if (op === 'unit-versions') return send(200,
      { versions: [{ version: 1, published_at: '2026-10-27T00:00:00Z', withdrawn_reason: null }] });
    if (op === 'graph-state') return send(200, { graph: { id: graphId, current_version: 1 },
      draft: { revision, payload: graph } });
    if (op === 'graph-versions') return send(200,
      { versions: [{ version: 1, published_at: '2026-10-27T00:00:00Z' }] });
    if (op === 'graph-version') return send(200, { graphVersion: {
      version: 1, payload: graph, sources: unit.sources,
      published_at: '2026-10-27T00:00:00Z' } });
    if (op === 'independent-graphs') return send(200, { graphs: [{
      id: 'teacher-foundations', title: 'Teacher foundations', current_version: '2026-10-27.1' }] });
    if (op === 'reusable-concepts') return send(200, { concepts: graph.nodes.map((node) => ({
      graphId, version: 1, graphTitle: graph.title, nodeId: node.id, title: node.title,
    })) });
    if (op === 'jobs') return send(200, { jobs: [] });
    if (op === 'proposals') return send(200, { proposals: [] });
    return send(404, { error: 'Fixture endpoint unavailable.' });
  }
  try {
    const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (path !== root && !path.startsWith(`${root}${sep}`)) return send(403, { error: 'Forbidden.' });
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(data);
  } catch { send(404, { error: 'Not found.' }); }
}).listen(8766, '127.0.0.1', () => console.log('Knowledge v0.4 browser fixture: http://127.0.0.1:8766/'));
