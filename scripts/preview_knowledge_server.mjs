// Local browser acceptance server backed by the configured Supabase preview.
// Bind only to loopback and opt in explicitly; never use as a deployment server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/knowledge.mjs';

if (process.env.KNOWLEDGE_PREVIEW_WRITES !== 'confirmed') {
  throw new Error('This server requires a confirmed non-production Supabase preview.');
}
process.loadEnvFile('.env.local');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.KNOWLEDGE_PREVIEW_PORT || 8010);
const publicRoots = new Set(['knowledge-map', 'shared', 'public', 'learning-path', 'interview', 'correction-lab']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/knowledge') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await handler.fetch(new Request(url, { method: req.method,
        headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }));
      for (const [name, value] of response.headers) if (name !== 'set-cookie') res.setHeader(name, value);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const requested = decodeURIComponent(url.pathname);
    const path = resolve(root, `.${requested}`);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const relative = path === root ? 'index.html' : path.slice(root.length + 1);
    if (relative !== 'index.html' && !publicRoots.has(relative.split(sep)[0])) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let file = path;
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Preview knowledge browser server on http://127.0.0.1:${port}\n`);
});
