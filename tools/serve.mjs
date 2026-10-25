// serve.mjs: serve public/ the way Cloudflare Pages does, for local preview and the tests.
//   static files with correct types, `/` -> index.html, rules from _headers, unknown paths -> 404.html with status 404,
//   and _headers itself is never served.
// usage: node tools/serve.mjs [dir=public] [port=8788]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

/* _headers: a path pattern on its own line, then indented "Name: value" lines (one * splat allowed per pattern) */
export function parseHeaders(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { rules.push({ pattern: raw.trim(), set: [] }); continue; }
    const m = raw.trim().match(/^(!\s*)?([^:]+?)\s*(?::\s*(.*))?$/);
    if (!m || !rules.length) continue;
    rules[rules.length - 1].set.push({ remove: !!m[1], name: m[2].trim(), value: (m[3] || '').trim() });
  }
  return rules;
}
const toRegex = (p) => new RegExp('^' + p.replace(/^https?:\/\/[^/]+/, '').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+')).join('.*') + '$');

export function createSiteServer(root) {
  root = path.resolve(root);
  const hdrFile = path.join(root, '_headers');
  const rules = fs.existsSync(hdrFile) ? parseHeaders(fs.readFileSync(hdrFile, 'utf8')).map((r) => ({ ...r, re: toRegex(r.pattern) })) : [];
  const notFound = path.join(root, '404.html');
  return http.createServer((req, res) => {
    let pathname = '/';
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { /* malformed: 404 below */ }
    let file = path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
    const base = path.basename(file);
    let status = 200;
    const outside = !file.startsWith(root + path.sep);
    if (outside || base === '_headers' || base === '_redirects' || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      status = 404; file = fs.existsSync(notFound) ? notFound : null;
    }
    const headers = { 'content-type': file ? TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' : 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' };
    for (const r of rules) if (r.re.test(pathname)) for (const h of r.set) {
      const k = h.name.toLowerCase();
      if (h.remove) delete headers[k]; else headers[k] = headers[k] && !['content-type', 'cache-control'].includes(k) ? headers[k] + ', ' + h.value : h.value;
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    if (!file) return res.end('Not found');
    fs.createReadStream(file).pipe(res);
  });
}

/* start on 127.0.0.1; port 0 picks a free port. Resolves to { url, close() } */
export function startSiteServer(root, port = 0) {
  const server = createSiteServer(root);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(process.argv[2] || path.join(here, '..', 'public'));
  const { url } = await startSiteServer(dir, Number(process.argv[3] || 8788));
  console.log(`serving ${path.relative(process.cwd(), dir) || '.'} at ${url}  (add #many-worlds, #scale-invariant, #floating-world or #asymptote to pick a ride; Ctrl+C to stop)`);
}
