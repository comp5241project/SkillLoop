/**
 * Local preview with the correction API. Run from the repository root:
 *   node --env-file-if-exists=.env.local correction-lab/dev-server.cjs
 * Then open http://localhost:8010/correction-lab/. Without keys, the API runs in demo mode.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/correction.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8010;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function api(req, res) {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    req.body = raw;
    res.status = (code) => ((res.statusCode = code), res);
    res.json = (value) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(value));
    };
    handler(req, res);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.replace(/\/$/, '') === '/api/correction') return api(req, res);
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end('Not found');
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    const mode = require('./server.cjs').configured() ? 'AI connected' : 'demo mode';
    console.log(`Correction lab: http://localhost:${PORT}/correction-lab/ (${mode})`);
  });
