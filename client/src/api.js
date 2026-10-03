import { STATS, LABEL, key, parse, dstr, seasonName, slug } from './util.js';

// The /api functions answer from MongoDB and pull from Big Balls only when a date isn't stored yet
async function call(path) {
  const r = await fetch('/api/' + path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || r.status);
  return body;
}

export const getMeta = () => call('meta');

// Player photos (Big Balls headshots need a paid plan)
const normName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ').split(/\s+/).filter(Boolean).join(' ');
let photos = {};
export const loadPhotos = async () => { photos = await fetch('photos.json').then(r => r.json()).catch(() => ({})); };
// NBA.com's own headshot when the line came from nba_api, otherwise ESPN's by name
const photo = (name, nbaId) => (nbaId ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`
  : photos[normName(name || '')] ? `https://a.espncdn.com/i/headshots/nba/players/full/${photos[normName(name)]}.png` : '');

const daySlide = (l, stat) => {
  const period = dstr(parse(l.date));
  return { n: l.name, img: photo(l.name, l.nbaId), v: l[STATS[stat]], g: `${l.team} vs ${l.opp}`, stat, period, k: slug(['D', stat, period, l.name]) };
};

// Slides for the current view, plus status about live pulls: { rows, pulled, quotaReached, loaded }
export async function build(s, meta, votes) {
  if (s.season) {
    const label = meta.seasons[s.si];
    if (!label) return { rows: [] };
    const T = await call(`season?season=${label}&stat=${STATS[s.stat]}`);
    const partial = T.totalGames && T.gamesLoaded < T.totalGames;
    return { rows: T.leaders.map(r => ({ n: r.name, img: photo(r.name, r.nbaId), v: r.v, g: r.team, gp: r.gp, stat: s.stat, period: seasonName(label),
      loaded: partial ? `${T.gamesLoaded.toLocaleString()} of ${T.totalGames.toLocaleString()} games` : null,
      k: slug(['S', s.stat, seasonName(label), r.name]) })) };
  }
  if (s.week) {
    const W = await call(`week?date=${key(s.date)}`);
    const order = Object.values(STATS), liked = k => (votes[k] === 1 ? 1 : 0);
    const rows = W.lines.map(l => ({ ...daySlide(l, LABEL[l.stat]), rank: l.rank, si: order.indexOf(l.stat) }))
      .sort((x, y) => liked(y.k) - liked(x.k) || x.rank - y.rank || x.si - y.si || y.v - x.v).slice(0, 5);
    return { rows, pulled: W.pulled, quotaReached: W.quotaReached, notInPlan: W.notInPlan };
  }
  const D = await call(`day?date=${key(s.date)}&stat=${STATS[s.stat]}`);
  return { rows: D.lines.map(l => daySlide(l, s.stat)), pulled: D.pulled, quotaReached: D.quotaReached, notInPlan: D.notInPlan };
}
