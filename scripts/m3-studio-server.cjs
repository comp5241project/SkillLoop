/** Dedicated loopback-only development server for the isolated M3-03 studio. */
const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { createStudioSession, StudioError } = require('../enhancement-v2/m3-studio-session.cjs');

const assets = Object.freeze({ '/': ['index.html', 'text/html; charset=utf-8'],
  '/studio.js': ['studio.js', 'text/javascript; charset=utf-8'],
  '/studio.css': ['studio.css', 'text/css; charset=utf-8'] });
const routes = Object.freeze({ '/api/validate': 'validate', '/api/preview': 'preview',
  '/api/manual': 'saveManual', '/api/proposal': 'generate', '/api/accept': 'accept',
  '/api/reject': 'reject', '/api/preview-accepted': 'previewAccepted' });

function createM3StudioServer(session = createStudioSession()) {
  return http.createServer(async (req, res) => {
    const port = req.socket.localPort;
    const origin = `http://127.0.0.1:${port}`;
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(payload));
    };
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) { send(403, { error: 'Loopback host required.' }); return; }
      const route = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && Object.hasOwn(assets, route)) {
        const [name, type] = assets[route];
        const file = path.resolve(__dirname, '../enhancement-v2/studio', name);
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" });
        res.end(body); return;
      }
      if (req.method === 'GET' && route === '/api/state') { send(200, session.state()); return; }
      if (req.method !== 'POST' || !Object.hasOwn(routes, route)) { send(404, { error: 'Unavailable.' }); return; }
      if ((req.headers.origin && req.headers.origin !== origin) ||
          req.headers['x-studio-request'] !== '1' ||
          !String(req.headers['content-type'] || '').startsWith('application/json')) {
        send(403, { error: 'Same-origin studio request required.' }); return;
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 100000) { send(413, { error: 'Request too large.' }); return; }
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { send(400, { error: 'Invalid JSON.' }); return; }
      const result = await session[routes[route]](input);
      send(200, result);
    } catch (error) {
      if (error instanceof StudioError) send(error.status, { error: error.message, fields: error.fields });
      else send(422, { error: error instanceof Error ? error.message : 'Invalid studio input.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.M3_STUDIO_PORT || 8773);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error('Invalid M3_STUDIO_PORT');
  createM3StudioServer().listen(port, '127.0.0.1', () =>
    console.log(`M3 draft-only studio: http://127.0.0.1:${port}/`));
}

module.exports = { createM3StudioServer };
