// Local dev: Vite for the React app plus the /api functions, the way Vercel serves them.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

process.env.NODE_ENV ||= 'development';
const vite = process.env.NO_VITE || process.env.STATIC_DIR ? null : await createServer({ server: { middlewareMode: true, hmr: { port: (+process.env.PORT || 5173) + 20000 } } });
// STATIC_DIR serves a prebuilt single-page app (used to test the mobile app's web build against this API)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res) {
  const root = path.resolve(process.env.STATIC_DIR);
  let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}
const port = +process.env.PORT || 5173;

// MOCK_API=dir serves a saved /api/game response (dir/game.json) so the interface can be worked on and tested without
// MongoDB or ESPN.
function mockApi(name, url, res) {
  const dir = path.resolve(process.env.MOCK_API);
  const send = (code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  setTimeout(() => {
    const f = path.join(dir, 'game.json');
    if (name === 'game' && fs.existsSync(f)) return send(200, fs.readFileSync(f, 'utf8'));
    send(404, { error: 'Not found' });
  }, +process.env.MOCK_DELAY || 0);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const a = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (a && process.env.MOCK_API) return mockApi(a[1], url, res);
  if (!a) return process.env.STATIC_DIR ? serveStatic(req, res) : vite ? vite.middlewares(req, res) : (res.statusCode = 404, res.end());
  try {
    const { default: fn } = await import(`../api/${a[1]}.js`);
    req.query = Object.fromEntries(url.searchParams);
    await fn(req, res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
}).listen(port, () => console.log(`Beat the Dynasty dev on http://localhost:${port}`));
