/* Browser walkthrough helper. Never use this server for real accounts or deployment. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
globalThis.window = {};
await import('../knowledge-map/data.js');
const sample = structuredClone(window.SkillLoopGraph);
const large = structuredClone(sample);
large.publication.id = 'large-class'; large.publication.title = 'Large graph browser fixture';
large.topics = Array.from({ length: 300 }, (_, index) => ({ ...structuredClone(sample.topics[0]),
  id: `concept-${index}`, title: `Concept ${index}`, order: index + 1,
  position: { x: index % 20 * 210, y: Math.floor(index / 20) * 120 } }));
large.relations = Array.from({ length: 299 }, (_, index) => ({ id: `edge-${index}`,
  source: `concept-${index}`, target: `concept-${index + 1}`, type: 'related',
  reason: 'This concept is linked to the next concept in the course.' }));
large.events = []; large.activities = []; large.questions = [];
const graphs = new Map([['software-development', { id: 'software-development', title: sample.publication.title,
  current_version: null, revision: crypto.randomUUID(), payload: sample }],
['large-class', { id: 'large-class', title: large.publication.title, current_version: large.publication.version,
  revision: crypto.randomUUID(), payload: large }]]);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) { let raw = ''; for await (const chunk of req) raw += chunk; return raw ? JSON.parse(raw) : {}; }
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:8001');
    if (url.pathname === '/api/knowledge') {
      const op = url.searchParams.get('op'), input = req.method === 'POST' ? await body(req) : {};
      const graphId = url.searchParams.get('graph') || input.graphId || 'software-development';
      const graph = graphs.get(graphId);
      if (op === 'session') return respond(res, 200, { signedIn: true, role: 'teacher', email: 'mock-teacher@example.test' });
      if (op === 'reference') return respond(res, 503, { error: 'Knowledge service unavailable.' });
      if (op === 'my-graphs') return respond(res, 200, { graphs: [...graphs.values()].map(({ id, title, current_version }) =>
        ({ id, title, current_version })) });
      if (op === 'draft') {
        if (req.method === 'GET') {
          const delay = Math.min(5000, Math.max(0, Number(process.env.MOCK_DRAFT_DELAY_MS) || 0));
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          return respond(res, 200, { draft: graph ? { revision: graph.revision, payload: graph.payload } : null });
        }
        if (!graph) return respond(res, 404, { error: 'Graph not found' });
        if (input.expectedRevision !== graph.revision) return respond(res, 409, { error: 'Draft changed' });
        graph.payload = input.payload; graph.revision = crypto.randomUUID();
        return respond(res, 200, { revision: graph.revision });
      }
      if (op === 'create-graph') {
        const id = `graph-${crypto.randomUUID()}`;
        const payload = structuredClone(sample);
        payload.publication.id = id; payload.publication.title = input.title;
        const revision = crypto.randomUUID();
        graphs.set(id, { id, title: input.title, current_version: null, revision, payload });
        return respond(res, 201, { id, revision });
      }
      if (op === 'publish') {
        if (!graph || input.revision !== graph.revision) return respond(res, 409, { error: 'Draft changed' });
        // Give the browser walkthrough time to edit while publication is in flight.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        graph.current_version = graph.payload.publication.version;
        return respond(res, 200, { version: graph.current_version });
      }
      if (op === 'public') {
        if (!graph?.current_version) return respond(res, 404, { error: 'No published graph is available.' });
        return respond(res, 200, { graph: graph.payload });
      }
      if (op === 'discover') return respond(res, 200, { summary: 'Mock research note for UI walkthrough only.',
        model: 'mock', retrievedAt: new Date().toISOString(), sources: [{ title: 'Mock source', url: 'https://example.org/' }] });
      return respond(res, 404, { error: 'Unknown endpoint' });
    }
    const clean = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    if (clean.startsWith('..')) return respond(res, 403, { error: 'Forbidden' });
    let path = join(root, clean);
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': `${mime[extname(path)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store' });
    res.end(content);
  } catch { respond(res, 404, { error: 'Not found' }); }
}).listen(Number(process.env.MOCK_PORT) || 8001, '127.0.0.1', () =>
  console.log(`Mock knowledge browser server on http://localhost:${Number(process.env.MOCK_PORT) || 8001}`));
