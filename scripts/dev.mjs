// Local dev: Vite for the React app plus the /api functions, the way Vercel serves them.
import http from 'node:http';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true } });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (!m) return vite.middlewares(req, res);
  try {
    const { default: fn } = await import(`../api/${m[1]}.js`);
    req.query = Object.fromEntries(url.searchParams);
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    await fn(req, res);
  } catch (e) { res.statusCode = 404; res.end(JSON.stringify({ error: e.message })); }
}).listen(process.env.PORT || 5173, () => console.log(`TotalNBA dev on http://localhost:${process.env.PORT || 5173}`));
