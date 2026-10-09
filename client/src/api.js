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

// Raw rows for a view. Every row carries every stat, so switching stats re-sorts on the phone (no refetch).
// -> { kind: 'game'|'total', raw, games?, pulled?, period, extra, prefix }
export async function fetchView(s, meta) {
  if (s.mode === 'season') {
    const label = meta.seasons[s.si];
    if (!label) return { kind: 'total', raw: [], period: '', extra: {}, prefix: [] };
    const T = await call(`season?season=${label}&stat=pts`);
    const loaded = !T.complete && T.through ? dstr(parse(T.through)) : null;
    return { kind: 'total', raw: T.rows, period: seasonName(label), extra: { loaded, scope: 'season', label }, prefix: ['S', label] };
  }
  if (s.mode === 'week') {
    const W = await call(`week?date=${key(s.date)}&stat=pts`);
    return { kind: 'total', raw: W.rows, pulled: W.pulled, period: `${shortDate(W.start)} – ${shortDate(W.end)}`,
      extra: { scope: 'week', week: W.start }, prefix: ['W', W.start] };
  }
  const D = await call(`day?date=${key(s.date)}&stat=pts&n=all`); // every player who played
  return { kind: 'game', raw: D.lines, games: D.games || [], pulled: D.pulled, period: dstr(s.date), extra: {}, prefix: [] };
}

// Cards for a view sorted by the chosen stat (ties: fantasy points, then name)
export function cardsFor(v, stat) {
  const f = STATS[stat];
  const rows = [...v.raw].sort((a, b) => (b[f] ?? 0) - (a[f] ?? 0) || (b.fan ?? 0) - (a.fan ?? 0) || String(a.name).localeCompare(b.name));
  return rows.map((r, i) => (v.kind === 'game'
    ? gameCard(r, stat)
    : totalCard(r, i, stat, v.period, { ...v.extra, k: slug([...v.prefix, stat, r.key || r.name]) })));
}

// Top 10 for the graphic, from exactly the view on screen: { title, subtitle, rows }
export async function top10(s, meta) {
  const stat = STATS[s.stat];
  const img = id => (/^\d+$/.test(id || '') ? `/api/img?id=${id}` : ''); // same-origin, so the PNG can be exported
  let q, title, subtitle;
  s = { ...s, season: s.mode === 'season', week: s.mode === 'week' };
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
