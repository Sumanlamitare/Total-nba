// Public, no login:
// GET /api/public?slug=<status page>   -> status page data (only checks marked public)
// GET /b/<badge>.svg                   -> status badge (rewritten to /api/public?badge=<badge>.svg)
import { db } from '../lib/db.js';
import { route, fail } from '../lib/http.js';
import { state, uptime, dailyBars } from '../lib/checks.js';

const COLORS = { up: '#2f9e6b', late: '#c98a12', running: '#3a7bd5', down: '#d04437', new: '#8a8f98', paused: '#8a8f98' };
const LABEL = { up: 'up', late: 'late', running: 'running', down: 'down', new: 'waiting', paused: 'paused' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function badgeSvg(name, s) {
  const left = name.slice(0, 40), right = LABEL[s];
  const w = t => Math.round(t.length * 6.6 + 14);
  const lw = w(left), rw = w(right);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${esc(left)}: ${right}"><title>${esc(left)}: ${right}</title><clipPath id="r"><rect width="${lw + rw}" height="20" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#1d2233"/><rect x="${lw}" width="${rw}" height="20" fill="${COLORS[s]}"/></g><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${esc(left)}</text><text x="${lw + rw / 2}" y="14">${right}</text></g></svg>`;
}

const json = route({
  async GET({ query, res }) {
    const slug = String(query.slug || '').toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) fail(404, 'Status page not found');
    const d = await db();
    const user = await d.collection('users').findOne({ slug });
    if (!user) fail(404, 'Status page not found');
    const checks = await d.collection('checks').find({ userId: user._id, public: true }, { projection: { pings: 0, key: 0, alerts: 0 } }).sort({ createdAt: 1 }).toArray();
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=60');
    const items = checks.map(c => ({ name: c.name, desc: c.desc || '', state: state(c), uptime30: uptime(c), lastPing: c.lastPing || null, bars: dailyBars(c, 30) }));
    const worst = items.some(i => i.state === 'down') ? 'down' : items.some(i => i.state === 'late') ? 'late' : 'up';
    return { title: user.pageTitle || user.name || slug, slug, overall: items.length ? worst : 'none', checks: items, at: new Date() };
  },
});

export default async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  if (!q.badge) return json(req, res);
  const id = String(q.badge).replace(/\.svg$/, '');
  let svg;
  try {
    const c = /^[A-Za-z0-9_-]{6,20}$/.test(id) && (await (await db()).collection('checks').findOne({ badge: id }, { projection: { name: 1, status: 1, paused: 1, lastPing: 1, lastStart: 1, period: 1 } }));
    svg = c ? badgeSvg(c.name, state(c)) : badgeSvg('nightjar', 'new').replace('>waiting<', '>unknown<');
  } catch (e) { console.error(e); svg = badgeSvg('nightjar', 'new').replace('>waiting<', '>error<'); }
  res.statusCode = 200;
  res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=60');
  res.end(svg);
}
