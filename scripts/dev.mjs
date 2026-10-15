// Local dev: Vite for the React app plus the /api functions, the way Vercel serves them.
import http from 'node:http';
import { createServer } from 'vite';

process.env.NODE_ENV ||= 'development';
const vite = process.env.NO_VITE ? null : await createServer({ server: { middlewareMode: true } });
const port = +process.env.PORT || 5173;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const a = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (!a) return vite ? vite.middlewares(req, res) : (res.statusCode = 404, res.end());
  try {
    const { default: fn } = await import(`../api/${a[1]}.js`);
    req.query = Object.fromEntries(url.searchParams);
    await fn(req, res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
}).listen(port, () => console.log(`Turnout dev on http://localhost:${port}`));
