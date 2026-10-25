/** Common local preview. Credentials and server source are never served as assets. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import knowledge from '../api/knowledge.mjs';
import interview from '../api/interview.js';
import correction from '../api/correction.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8765);
const assets = new Set(['knowledge-map', 'learning-path', 'interview', 'correction-lab', 'shared', 'public']);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const route = url.pathname.replace(/\/$/, '');
    if (['/api/knowledge', '/api/interview', '/api/correction'].includes(route)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1000000) { res.writeHead(413); res.end('Request too large'); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (route === '/api/knowledge') {
        const response = await knowledge.fetch(new Request(url, {
          method: req.method, headers: req.headers,
          ...(body.length ? { body } : {}),
        }));
        for (const [name, value] of response.headers) if (name !== 'set-cookie') res.setHeader(name, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.writeHead(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
      } else {
        req.body = body.toString('utf8');
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        await (route === '/api/interview' ? interview : correction)(req, res);
      }
      return;
    }
    if (route.startsWith('/api/') || !['GET', 'HEAD'].includes(req.method)) throw Error('Unavailable');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.split('/').some((part) => part.startsWith('.'))) throw Error('Private path');
    let file = resolve(root, '.' + pathname);
    const local = relative(root, file);
    if (local.startsWith('..') || (local && local !== 'index.html' && !assets.has(local.split(sep)[0]))) throw Error('Private path');
    if (!extname(file)) {
      try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); else throw Error(); }
      catch { file += '.html'; }
    }
    if (!mime[extname(file)] || file.endsWith('.test.mjs') || file.endsWith('.test.cjs')) throw Error('Private file');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`SkillLoop: http://127.0.0.1:${port}/`));
