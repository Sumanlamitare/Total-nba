import { STATS, LABEL, MO, key, parse, dstr, seasonName, slug } from './util.js';

// The /api functions answer from MongoDB and pull from ESPN only when a date isn't stored yet
async function call(path) {
  const r = await fetch('/api/' + path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || r.status);
  return body;
}

export const getMeta = () => call('meta');

// ESPN headshots by the player's ESPN id
const photo = id => (/^\d+$/.test(id || '') ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : '');

const daySlide = (l, stat) => {
  const period = dstr(parse(l.date));
  return { n: l.name, img: photo(l.espnId), v: l[STATS[stat]], g: `${l.team} vs ${l.opp}`, stat, period, k: slug(['D', stat, period, l.name]) };
};

// Slides for the current view, plus whether the date had to be pulled live: { rows, pulled }
export async function build(s, meta, votes) {
  if (s.season) {
    const label = meta.seasons[s.si];
    if (!label) return { rows: [] };
    const T = await call(`season?season=${label}&stat=${STATS[s.stat]}`);
    return { rows: T.leaders.map(r => ({ n: r.name, img: photo(r.espnId), v: r.v, g: r.team, gp: r.gp, stat: s.stat, period: seasonName(label),
      loaded: !T.complete && T.through ? dstr(parse(T.through)) : null,
      k: slug(['S', s.stat, seasonName(label), r.name]) })) };
  }
  if (s.week) {
    const W = await call(`week?date=${key(s.date)}`);
    const order = Object.values(STATS), liked = k => (votes[k] === 1 ? 1 : 0);
    const rows = W.lines.map(l => ({ ...daySlide(l, LABEL[l.stat]), rank: l.rank, si: order.indexOf(l.stat) }))
      .sort((x, y) => liked(y.k) - liked(x.k) || x.rank - y.rank || x.si - y.si || y.v - x.v).slice(0, 5);
    return { rows, pulled: W.pulled };
  }
  const D = await call(`day?date=${key(s.date)}&stat=${STATS[s.stat]}`);
  return { rows: D.lines.map(l => daySlide(l, s.stat)), pulled: D.pulled };
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
  if (s.week) { title = `${shortDate(T.start)} – ${shortDate(T.end)}`; subtitle = 'Best single game of the week'; }
  return { title, subtitle, rows: T.rows.map(r => ({ ...r, img: img(r.espnId) })) };
}
const shortDate = s => { const d = parse(s); return `${MO[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`; };
