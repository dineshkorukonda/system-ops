import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const port = Number(process.env.SITE_PORT || 4174);
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (path.relative(root, target).startsWith('..') || !fs.statSync(target).isFile()) throw new Error('Not found');
    response.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, {'Content-Type':'text/plain'}); response.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`System Ops public site: http://127.0.0.1:${port}`));
