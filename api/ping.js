// The endpoint jobs call: /p/<key>[/start|/fail|/log|/<exit code>] (rewritten to /api/ping?path=...).
// Any method works (GET, POST, HEAD). A POST body (first 1 KB) is kept with the ping — handy for logs.
import { recordPing, parseKind, sweep } from '../lib/checks.js';
import { readBody } from '../lib/http.js';

let lastSweep = 0;

export default async function ping(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  const end = (code, text) => { res.statusCode = code; res.end(req.method === 'HEAD' ? undefined : text); };
  if (req.method === 'OPTIONS') return end(204, '');
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const [key, suffix = ''] = String(q.path || '').split('/').filter(Boolean);
    const kind = parseKind(suffix);
    if (!key || !/^[A-Za-z0-9_-]{10,40}$/.test(key) || !kind) return end(404, 'Not found\n');
    let body = '';
    if (req.method === 'POST' || req.method === 'PUT') { const b = await readBody(req, 10_000).catch(() => ''); body = typeof b === 'string' ? b : JSON.stringify(b); }
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const c = await recordPing(key, kind, { ua: req.headers['user-agent'], body, src: fwd || req.socket?.remoteAddress });
    if (!c) return end(404, 'Not found — check the ping URL\n');
    // pings arrive constantly, so they double as the clock that notices other checks going quiet
    if (Date.now() - lastSweep > 60_000) { lastSweep = Date.now(); await sweep({}, 25).catch(e => console.error('sweep', e)); }
    return end(200, 'OK\n');
  } catch (e) {
    console.error(e);
    return end(500, 'Error — please retry\n');
  }
}
