// Local dev: Vite for the React app plus the /api functions and rewrites, the way Vercel serves them.
import http from 'node:http';
import { createServer } from 'vite';

process.env.NODE_ENV ||= 'development';
const vite = process.env.NO_VITE ? null : await createServer({ server: { middlewareMode: true } });
const port = +process.env.PORT || 5173;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let name = null;
  const p = url.pathname.match(/^\/p\/(.+)$/), b = url.pathname.match(/^\/b\/(.+)$/), a = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (p) { name = 'ping'; url.searchParams.set('path', p[1]); }
  else if (b) { name = 'public'; url.searchParams.set('badge', b[1]); }
  else if (a) name = a[1];
  if (!name) return vite ? vite.middlewares(req, res) : (res.statusCode = 404, res.end());
  try {
    const { default: fn } = await import(`../api/${name}.js`);
    req.query = Object.fromEntries(url.searchParams);
    await fn(req, res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
}).listen(port, () => console.log(`Nightjar dev on http://localhost:${port}`));
