import { STATS, LABEL, key, parse, dstr, seasonName, slug } from './util.js';

const PW = 'tn_password';
const password = () => { try { return localStorage.getItem(PW) || ''; } catch { return ''; } };
export const setPassword = p => { try { localStorage.setItem(PW, p); } catch { /* private mode */ } };

async function call(path, opts = {}) {
  const r = await fetch('/api' + path, { ...opts, headers: { 'content-type': 'application/json', 'x-app-password': password(), ...opts.headers } });
  if (r.status === 401) { const e = new Error('password required'); e.status = 401; throw e; }
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export const getMeta = () => call('/meta');
export const getReactions = () => call('/reactions');
export const vote = (k, v) => call(`/reactions/${encodeURIComponent(k)}/vote`, { method: 'PUT', body: JSON.stringify({ vote: v }) });
export const addNote = (k, text) => call(`/reactions/${encodeURIComponent(k)}/notes`, { method: 'POST', body: JSON.stringify({ text }) });

// Turn an API box score line into a slide
const daySlide = (l, stat) => {
  const period = dstr(parse(l.date));
  return { n: l.name, id: l.playerId, v: l[STATS[stat]], g: `${l.team} vs ${l.opp}`, stat, period, k: slug(['D', stat, period, l.name]) };
};

// Slides for the current view: daily top 5, season leaders, or week ranked by your likes
export async function build(s, seasons, reactions) {
  if (s.season) {
    const label = seasons[s.si];
    if (!label) return [];
    const rows = await call(`/season/${label}?stat=${STATS[s.stat]}`);
    return rows.map(r => ({ n: r.name, id: r._id, v: r.v, g: r.team, avg: (r.v / r.gp).toFixed(1), stat: s.stat,
      period: seasonName(label), k: slug(['S', s.stat, seasonName(label), r.name]) }));
  }
  if (s.week) {
    const { lines } = await call(`/week/${key(s.date)}`);
    const order = Object.values(STATS);
    const likes = k => (reactions[k]?.vote === 1 ? 1 : 0);
    return lines.map(l => ({ ...daySlide(l, LABEL[l.stat]), rank: l.rank, si: order.indexOf(l.stat) }))
      .sort((x, y) => likes(y.k) - likes(x.k) || x.rank - y.rank || x.si - y.si || y.v - x.v).slice(0, 5);
  }
  return (await call(`/day/${key(s.date)}?stat=${STATS[s.stat]}`)).map(l => daySlide(l, s.stat));
}
