import { STATS, key, parse, dstr, seasonName, slug, photo, shortDate, rarityOfGame, rarityOfRank, badges, totalBadges } from './util.js';

// The /api functions answer from MongoDB and pull from ESPN only when a date isn't stored yet
async function call(path) {
  const r = await fetch('/api/' + path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || r.status);
  return body;
}

export const getMeta = () => call('meta');
export const getPlayer = k => call(`player?key=${encodeURIComponent(k)}`);
export const search = q => call(`search?q=${encodeURIComponent(q)}`).then(r => r.results);
export const onThisDay = (date, f) => call(`onthisday?date=${key(date)}&stat=${f}`).then(r => r.lines);

// A card for one game line (day view)
export const gameCard = (l, stat) => {
  const f = STATS[stat], period = dstr(parse(l.date));
  return { kind: 'game', n: l.name, key: l.key, espnId: l.espnId, img: photo(l.espnId), v: l[f] ?? 0, f, stat,
    team: l.team, opp: l.opp, g: `${l.team} vs ${l.opp}`, gameId: l.gameId, date: l.date, period, line: l,
    rarity: rarityOfGame(l.fan || 0), badges: badges(l), k: slug(['D', stat, period, l.key || l.name]) };
};
// A card for a week/season total
const totalCard = (r, i, stat, period, extra) => {
  const f = STATS[stat];
  return { kind: 'total', n: r.name, key: r.key, espnId: r.espnId, img: photo(r.espnId), v: r[f] ?? 0, f, stat,
    team: r.team, g: r.team, gp: r.gp, period, line: r, rarity: rarityOfRank(i), badges: totalBadges(r, i, f), ...extra };
};

// Cards for the current view: { rows, games?, pulled? }
export async function build(s, meta) {
  const f = STATS[s.stat];
  if (s.season) {
    const label = meta.seasons[s.si];
    if (!label) return { rows: [] };
    const T = await call(`season?season=${label}&stat=${f}`);
    const period = seasonName(label), loaded = !T.complete && T.through ? dstr(parse(T.through)) : null;
    return { rows: T.rows.map((r, i) => totalCard(r, i, s.stat, period, { loaded, scope: 'season', label, k: slug(['S', s.stat, period, r.key || r.name]) })) };
  }
  if (s.week) {
    const W = await call(`week?date=${key(s.date)}&stat=${f}`);
    const period = `${shortDate(W.start)} – ${shortDate(W.end)}`;
    return { rows: W.rows.map((r, i) => totalCard(r, i, s.stat, period, { scope: 'week', week: W.start, k: slug(['W', s.stat, W.start, r.key || r.name]) })), pulled: W.pulled };
  }
  const D = await call(`day?date=${key(s.date)}&stat=${f}&n=all`); // every player who played
  return { rows: D.lines.map(l => gameCard(l, s.stat)), games: D.games || [], pulled: D.pulled };
}

// Top 10 for the graphic, from exactly the view on screen: { title, subtitle, rows }
export async function top10(s, meta) {
  const stat = STATS[s.stat];
  const img = id => (/^\d+$/.test(id || '') ? `/api/img?id=${id}` : ''); // same-origin, so the PNG can be exported
  let q, title, subtitle;
  if (s.season) {
    const label = meta.seasons[s.si];
    q = `top?mode=season&season=${label}&stat=${stat}`;
    title = seasonName(label);
  } else if (s.week) {
    q = `top?mode=week&date=${key(s.date)}&stat=${stat}`;
  } else {
    q = `top?mode=day&date=${key(s.date)}&stat=${stat}`;
    title = dstr(s.date); subtitle = 'Best single-game performances';
  }
  const T = await call(q);
  if (s.season) subtitle = 'Regular-season totals' + (T.through ? ` · through ${dstr(parse(T.through))}` : '');
  if (s.week) { title = `${shortDate(T.start)} – ${shortDate(T.end)}`; subtitle = 'Weekly totals'; }
  return { title, subtitle, rows: T.rows.map(r => ({ ...r, img: img(r.espnId) })) };
}
