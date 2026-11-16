// Local development: Vite for the React app plus the /api functions, the way Vercel serves them.
//   MONGODB_URI=... npm run dev          (or FP90_MEMDB=1 MOCK_ESPN=1 to run on a mock ESPN with no network)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV ||= 'development';
process.env.FP90_INSECURE_COOKIE ||= '1';
if (process.env.MOCK_ESPN) { const { mockEspn } = await import('../test/mock-espn.mjs'); const m = await mockEspn(); Object.assign(process.env, m.env); }
const port = +process.env.PORT || 5173;
const STATIC = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const vite = STATIC ? null : await (await import('vite')).createServer({ server: { middlewareMode: true, hmr: { port: port + 20000 } } });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png' };
function serveStatic(req, res) {
  let f = path.join(STATIC, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(STATIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(STATIC, 'index.html');
  res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const a = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (!a) return STATIC ? serveStatic(req, res) : vite.middlewares(req, res);
  try {
    const { default: fn } = await import(`../api/${a[1]}.js`);
    req.query = Object.fromEntries(url.searchParams);
    await fn(req, res);
  } catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); } }
}).listen(port, () => console.log(`Football Past 90 dev on http://localhost:${port}`));
