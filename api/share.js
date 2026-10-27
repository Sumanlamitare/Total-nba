// GET /s/YYYYMMDD[/playerId] (rewritten to /api/share) -> a page with the link-preview tags for the night or one
// performance, which then opens it in the app.
import { db } from '../lib/db.js';
import { loadNight, isDate } from '../lib/nights.js';
import { sharePage } from '../lib/share.js';

export default async function share(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const date = String(q.date || ''), pid = String(q.p || '');
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!isDate(date)) { res.statusCode = 302; res.setHeader('location', '/'); return res.end(); }
  let night = null;
  try { night = await loadNight(await db(), date); } catch { /* the page still links to the night */ }
  const perf = pid ? night?.top?.find(p => p.id === pid) || null : null;
  res.setHeader('cache-control', night?.final ? 'public, max-age=0, s-maxage=86400' : 'public, max-age=0, s-maxage=300');
  res.statusCode = 200;
  res.end(sharePage({ origin, date, perf, night: night || { top: [] } }));
}
