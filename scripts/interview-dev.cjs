/** A small local server for the static site plus its one interview endpoint. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const handler = require('../api/interview.js');
const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.replace(/\/$/, '') === '/api/interview') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 45000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      req.body = body;
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (value) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(value));
      };
      return handler(req, res);
    }
    try {
      let pathname = decodeURIComponent(url.pathname);
      if (
        pathname.split('/').some((part) => part.startsWith('.')) ||
        (!/\.(html|css|js|svg|png)$/.test(pathname) && !pathname.endsWith('/'))
      )
        throw new Error();
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) || file.includes(path.sep + 'node_modules' + path.sep))
        throw new Error();
      const bytes = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      });
      res.end(bytes);
    } catch (_) {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(8765, '127.0.0.1', () =>
    console.log('Interview preview: http://127.0.0.1:8765/interview/')
  );
