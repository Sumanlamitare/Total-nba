import { STATS, LABEL, key, parse, dstr, seasonName, slug, addDays, weekStart } from './util.js';

// Static JSON written by scripts/fetch-bbs.mjs from the Big Balls Data API
const cache = {};
const load = p => (cache[p] ||= fetch('data/' + p, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));

export const getMeta = async () => (await load('index.json')) || { seasons: [], dates: [] };

// Player photos: Big Balls headshot when the plan includes it, otherwise ESPN's free CDN by name
const normName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ').split(/\s+/).filter(Boolean).join(' ');
let photos = {};
export const loadPhotos = async () => { photos = (await load('photos.json')) || {}; };
export const photo = (name, img) => img || (photos[normName(name || '')] ? `https://a.espncdn.com/i/headshots/nba/players/full/${photos[normName(name)]}.png` : '');

// Day file rows: [playerId, name, team, opp, pts, reb, ast, stl, blk, tpm, min, gameId]
const COL = { pts: 4, reb: 5, ast: 6, stl: 7, blk: 8, tpm: 9 };
function dayTop(day, stat) {
  if (!day?.p) return [];
  const c = COL[STATS[stat]], date = parse(day.date), period = dstr(date);
  return day.p.filter(r => r[c] > 0).sort((a, b) => b[c] - a[c] || b[4] - a[4]).slice(0, 5)
    .map(r => ({ n: r[1], img: photo(r[1]), v: r[c], g: `${r[2]} vs ${r[3]}`, stat, period, k: slug(['D', stat, period, r[1]]) }));
}

// Slides for the current view: daily top 5, season leaders, or the week ranked by your likes
export async function build(s, meta, votes) {
  if (s.season) {
    const label = meta.seasons[s.si];
    const L = label && await load(`leaders/${label}.json`);
    return (L?.stats?.[STATS[s.stat]] || []).map(r => ({ n: r.n, img: photo(r.n, r.img), v: r.v, decimals: 1, g: r.team, gp: r.gp,
      stat: s.stat, perGame: true, period: seasonName(label), k: slug(['S', s.stat, seasonName(label), r.n]) }));
  }
  if (s.week) {
    const a = weekStart(s.date), out = [];
    const days = await Promise.all(Array.from({ length: 7 }, (_, i) => key(addDays(a, i)))
      .map(d => (meta.has.has(d) ? load(`days/${d}.json`) : null)));
    days.forEach(day => Object.keys(STATS).forEach((stat, si) => dayTop(day, stat).forEach((r, rank) => out.push({ ...r, rank, si }))));
    const liked = k => (votes[k] === 1 ? 1 : 0);
    return out.sort((x, y) => liked(y.k) - liked(x.k) || x.rank - y.rank || x.si - y.si || y.v - x.v).slice(0, 5);
  }
  return meta.has.has(key(s.date)) ? dayTop(await load(`days/${key(s.date)}.json`), s.stat) : [];
}
export { LABEL };
