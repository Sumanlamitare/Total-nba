// Nights, seasons and the leaderboard, built from ESPN on demand and kept in MongoDB.
//   nights  — { _id: 'YYYYMMDD', season, final, games: [...], top: [10 best performances] }; a night is stored once
//             every game is final, and served from the database after that
//   perfs   — every scored performance (Game Score, minutes, score), for players' season averages (minutes lost to
//             foul trouble)
//   meta    — { _id: 'season:YYYY', year, label, start, end, dates } for each season offered
import * as espn from './espn.js';
import { scoreGame, rank, explainNight, MODEL, NEVER_AVAILABLE } from './night.js';

export const TOP = 5, KEEP = 10;
const GAME_TYPES = new Set([2, 3, 5]); // regular season, playoffs, play-in (no preseason or All-Star)
const OFF = /POSTPONED|CANCELED|CANCELLED|FORFEIT/;

export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const isDate = s => /^\d{8}$/.test(String(s || ''));
export const ymd = iso => String(iso || '').slice(0, 10).replace(/-/g, '');

// A season's game dates (regular season through the Finals), from ESPN's calendar and season types.
export async function seasonInfo(year) {
  const [reg, post, sb] = await Promise.all([
    espn.fetchJson(`${espn.CORE}/seasons/${year}/types/2`).catch(() => null),
    espn.fetchJson(`${espn.CORE}/seasons/${year}/types/3`).catch(() => null),
    espn.fetchJson(`${espn.SITE}/scoreboard?dates=${year - 1}1201&limit=1`).catch(() => null),
  ]);
  const start = ymd(reg?.startDate), end = ymd(post?.endDate || reg?.endDate);
  const cal = (sb?.leagues?.[0]?.calendar || []).map(c => ymd(typeof c === 'string' ? c : c.startDate));
  const dates = [...new Set(cal)].filter(x => (!start || x >= start) && (!end || x <= end)).sort();
  return { _id: `season:${year}`, year, label: seasonLabel(year), start: start || dates[0], end: end || dates[dates.length - 1], dates };
}

export async function ensureSeason(d, year) {
  const have = await d.collection('meta').findOne({ _id: `season:${year}` });
  if (have?.dates?.length && have.at > Date.now() - 86400000) return have;
  const info = { ...(await seasonInfo(year)), at: Date.now() };
  if (info.dates.length) await d.collection('meta').replaceOne({ _id: info._id }, { ...have, ...info }, { upsert: true });
  return info;
}

// Each player's season before a date: his average minutes (from five games on).
async function seasonAverages(d, season, date, ids) {
  if (!ids.length) return new Map();
  const rows = await d.collection('perfs').aggregate([
    { $match: { season, date: { $lt: date }, pid: { $in: ids } } },
    { $group: { _id: '$pid', min: { $avg: '$min' }, n: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.filter(r => r.n >= 5 && r.min != null).map(r => [r._id, { avgMin: r.min }]));
}

// The compact performance the client gets.
const publicPerf = (p, i) => ({
  rank: i + 1, id: p.id, name: p.name, pos: p.pos, headshot: p.headshot, starter: p.starter, team: p.team, opp: p.opp, home: p.home, result: p.result,
  event: p.event, stage: p.stage, line: p.line, score: p.score, base: p.base, categories: p.categories, padding: p.padding, fouls: p.fouls,
  tags: p.tags, gs: p.gs, confidence: p.confidence,
});

const gameRow = (ev, game) => {
  const c = ev.competitions?.[0];
  const st = ev.status?.type || c?.status?.type || {};
  return {
    id: String(ev.id), state: st.state || '', detail: st.shortDetail || st.detail || '', note: c?.notes?.[0]?.headline || '',
    teams: (c?.competitors || []).map(x => ({ id: String(x.team?.id), abbr: x.team?.abbreviation, logo: x.team?.logo, score: x.score != null ? Number(x.score) : null, winner: !!x.winner, home: x.homeAway === 'home' })),
    stage: game?.stage || null,
  };
};

// One night: from the database when it's final, else from ESPN (and stored once every game is final).
export async function loadNight(d, date, { force = false, write = true } = {}) {
  if (!isDate(date)) throw Object.assign(new Error('Dates look like 20250115'), { status: 400 });
  const stored = await d.collection('nights').findOne({ _id: date });
  if (stored?.final && !force) return stored;
  const sb = await espn.fetchJson(`${espn.SITE}/scoreboard?dates=${date}&limit=100`);
  const season = Number(sb?.leagues?.[0]?.season?.year) || null;
  const events = (sb?.events || []).filter(e => GAME_TYPES.has(Number(e.season?.type)));
  const off = e => OFF.test(String(e.status?.type?.name || '')); // postponed or cancelled: never played that night
  const played = events.filter(e => !off(e) && ['in', 'post'].includes(e.status?.type?.state));
  const summaries = await espn.pool(played, 6, e => espn.fetchJson(`${espn.SITE}/summary?event=${e.id}`).catch(() => null));
  const ids = [...new Set(summaries.flatMap(s => (s?.boxscore?.players || []).flatMap(t => (t.statistics?.[0]?.athletes || []).map(a => String(a.athlete?.id)))))];
  const avgs = await seasonAverages(d, season, date, ids);
  const scored = summaries.filter(Boolean).map(s => scoreGame(s, avgs));
  const byId = new Map(scored.filter(x => x.game).map(x => [x.game.id, x.game]));
  const all = rank(scored.flatMap(x => x.perfs));
  const final = events.length > 0 && events.every(e => off(e) || e.status?.type?.completed) && scored.length === played.length;
  const night = {
    _id: date, season, final, live: played.some(e => e.status?.type?.state === 'in'),
    games: events.map(e => gameRow(e, byId.get(String(e.id)))),
    top: all.slice(0, KEEP).map(publicPerf), players: all.length, potn: explainNight(all),
    model: MODEL, unavailable: NEVER_AVAILABLE, sources: played.map(e => `${espn.SITE}/summary?event=${e.id}`), at: new Date(),
  };
  if (write && final) {
    await d.collection('nights').replaceOne({ _id: date }, night, { upsert: true });
    if (all.length) {
      await d.collection('perfs').bulkWrite(all.map(p => ({ replaceOne: { filter: { _id: `${p.event}:${p.id}` }, replacement: { _id: `${p.event}:${p.id}`, season, date, pid: p.id, gs: p.gs, min: p.line.min, score: p.score }, upsert: true } })), { ordered: false });
    }
  }
  return night;
}

// The newest date with finished games: ESPN's "today" if a game there has finished, else the season's last game date
// before it.
export async function latestDate(d) {
  const sb = await espn.fetchJson(`${espn.SITE}/scoreboard`);
  const today = ymd(sb?.day?.date) || ymd(new Date().toISOString());
  const season = Number(sb?.leagues?.[0]?.season?.year);
  const done = (sb?.events || []).some(e => GAME_TYPES.has(Number(e.season?.type)) && ['in', 'post'].includes(e.status?.type?.state));
  if (done) return { date: today, season };
  const info = season ? await ensureSeason(d, season) : null;
  let before = (info?.dates || []).filter(x => x < today).pop();
  if (!before && season) before = ((await ensureSeason(d, season - 1))?.dates || []).filter(x => x < today).pop();
  return { date: before || today, season };
}

// Who has had the most Performances of the Night this season: top-5 finishes, nights at No. 1, and points (5 for
// first down to 1 for fifth).
export async function leaderboard(d, season, { stage = 'all' } = {}) {
  const match = { season, final: true };
  const rows = await d.collection('nights').aggregate([
    { $match: match },
    { $project: { top: { $slice: ['$top', TOP] } } },
    { $unwind: { path: '$top', includeArrayIndex: 'rank' } },
    ...(stage === 'regular' ? [{ $match: { 'top.stage': 'regular' } }] : stage === 'playoffs' ? [{ $match: { 'top.stage': { $ne: 'regular' } } }] : []),
    { $sort: { _id: 1 } },
    { $group: {
      _id: '$top.id', name: { $last: '$top.name' }, headshot: { $last: '$top.headshot' }, team: { $last: '$top.team' },
      count: { $sum: 1 }, firsts: { $sum: { $cond: [{ $eq: ['$rank', 0] }, 1, 0] } }, points: { $sum: { $subtract: [TOP, '$rank'] } },
      best: { $max: '$top.score' }, last: { $max: '$_id' },
      nights: { $push: { date: '$_id', rank: { $add: ['$rank', 1] }, score: '$top.score', result: '$top.result', opp: '$top.opp.abbr', line: '$top.line' } },
    } },
    { $sort: { count: -1, firsts: -1, points: -1, best: -1 } },
  ]).toArray();
  const nights = await d.collection('nights').countDocuments(match);
  return { season, label: seasonLabel(season), nights, players: rows.map(r => ({ id: r._id, ...r, _id: undefined })) };
}

export async function seasons(d) {
  const rows = await d.collection('meta').find({ _id: /^season:/ }).sort({ year: -1 }).toArray();
  const counts = await d.collection('nights').aggregate([{ $match: { final: true } }, { $group: { _id: '$season', n: { $sum: 1 } } }]).toArray();
  const n = new Map(counts.map(c => [c._id, c.n]));
  return rows.map(r => ({ year: r.year, label: r.label, start: r.start, end: r.end, dates: r.dates, nights: n.get(r.year) || 0 }));
}

// Build (or refresh) a season night by night, in date order so season averages are ready for each night. refresh: the
// number of most recent nights to score again even if final, to pick up ESPN's stat corrections.
export async function ingestSeason(d, year, { log = () => {}, force = false, until = null, refresh = 0 } = {}) {
  const info = await ensureSeason(d, year);
  const stop = until || ymd(new Date().toISOString());
  const dates = info.dates.filter(x => x <= stop);
  const again = new Set(dates.slice(-refresh - 1)); // today may not have been played yet
  let done = 0, games = 0;
  for (const date of dates) {
    const n = await loadNight(d, date, { force: force || again.has(date) }).catch(e => { log(`${date}: ${e.message}`); return null; });
    if (!n) continue;
    done++; games += n.games.length;
    if (done % 20 === 0 || n.top[0] && !n.final) log(`${date}: ${n.games.length} games, top ${n.top[0]?.name || '-'} ${n.top[0]?.score ?? ''}${n.final ? '' : ' (not final)'}`);
  }
  log(`${seasonLabel(year)}: ${done} nights, ${games} games`);
  return { nights: done, games };
}
