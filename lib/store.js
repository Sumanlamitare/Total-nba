// Reads and writes NBA data in MongoDB; pulls from ESPN only for dates that aren't stored yet.
import { db } from './db.js';
import { fetchDay, pool } from './espn.js';

export const seasonOf = date => { const [y, m] = date.split('-').map(Number); return m >= 8 ? y : y - 1; }; // start year
export const seasonLabel = y => `${y}-${String(y + 1).slice(2)}`;
export const SCHEMA = 2; // v2 added fg2m, ftm, tov, pf
export const etToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const iso = t => new Date(t).toISOString().slice(0, 10);

export async function saveGame(date, game, rows) {
  const d = await db();
  const season = seasonOf(date);
  const { done, ...g } = game;
  await d.collection('games').updateOne({ _id: g.id }, { $set: { ...g, _id: g.id, date, season, boxed: rows.length > 0, v: SCHEMA, source: 'espn' } }, { upsert: true });
  if (rows.length) {
    await d.collection('lines').bulkWrite(rows.map(r => {
      const doc = { ...r, key: r.playerId || 'name:' + r.name, gameId: g.id, date, season, type: g.type, source: 'espn' };
      return { replaceOne: { filter: { gameId: g.id, key: doc.key }, replacement: doc, upsert: true } };
    }), { ordered: false });
  }
}

// Make sure a date is in MongoDB. Complete past days are never requested again;
// today (and any day with unfinished games) is rechecked at most every 5 minutes.
export async function ensureDay(date) {
  const d = await db();
  const meta = await d.collection('days').findOne({ _id: date });
  if (meta?.complete) return { pulled: false };
  if (meta && Date.now() - meta.checkedAt < 5 * 60e3) return { pulled: false };
  const stored = new Set((await d.collection('games').find({ date, boxed: true, v: SCHEMA }, { projection: { _id: 1 } }).toArray()).map(g => g._id));
  const { games, total, pending } = await fetchDay(date, stored);
  for (const { game, rows } of games) if (rows) await saveGame(date, game, rows);
  await d.collection('days').updateOne({ _id: date },
    { $set: { games: total, complete: !pending && date < etToday(), checkedAt: Date.now() } }, { upsert: true });
  return { pulled: true, pending };
}

// Fill whole seasons, newest date first. Season dates run Oct 1 – Jun 30.
// Free MongoDB Atlas (M0) holds 512 MB; stop loading older seasons before reaching it
const SIZE_CAP_MB = +(process.env.SIZE_CAP_MB || 460);
export async function sizeMB() {
  const s = await (await db()).stats();
  return Math.round(((s.dataSize || 0) + (s.indexSize || 0)) / 1048576);
}

export async function backfill(seasons, log = console.log) {
  const d = await db();
  const today = etToday();
  for (const y of seasons) {
    const mb = await sizeMB();
    if (mb > SIZE_CAP_MB) { log(`database is ${mb} MB (cap ${SIZE_CAP_MB} MB): not loading ${seasonLabel(y)} or older`); break; }
    if (await d.collection('seasons').findOne({ _id: y, complete: true })) continue;
    const first = `${y}-10-01`, last = [`${y + 1}-06-30`, today].sort()[0];
    const done = new Set((await d.collection('days').find({ _id: { $gte: first, $lte: last }, complete: true }, { projection: { _id: 1 } }).toArray()).map(x => x._id));
    const todo = [];
    for (let t = Date.parse(last); t >= Date.parse(first); t -= 864e5) if (!done.has(iso(t))) todo.push(iso(t));
    if (todo.length) log(`${seasonLabel(y)}: ${todo.length} days to pull`);
    let failed = 0;
    await pool(todo, 3, async date => {
      try { await ensureDay(date); } catch (e) { failed++; log(`  ${date} failed: ${e.message}`); }
    });
    const finished = `${y + 1}-06-30` < today;
    if (finished && !failed) {
      await d.collection('seasons').updateOne({ _id: y }, { $set: { complete: true, at: new Date() } }, { upsert: true });
      log(`${seasonLabel(y)}: complete (database ${await sizeMB()} MB)`);
    }
  }
}

// --- reads -----------------------------------------------------------------------------
export const BOX = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fg2m', 'ftm', 'tov', 'pf'];
export const STATS = [...BOX, 'fan']; // fan = fantasy points, computed per game
const stat = s => (STATS.includes(s) ? s : 'pts');

const topN = n => Math.min(10, Math.max(1, +n || 5));

// Fantasy points (DraftKings scoring): PTS 1, 3PM 0.5, REB 1.25, AST 1.5, STL 2, BLK 2, TOV -0.5,
// double-double +1.5, triple-double +3 (instead of the double-double bonus).
const tens = { $add: ['pts', 'reb', 'ast', 'stl', 'blk'].map(f => ({ $cond: [{ $gte: [`$${f}`, 10] }, 1, 0] })) };
const FAN = { $round: [{ $add: [
  '$pts', { $multiply: [0.5, '$tpm'] }, { $multiply: [1.25, '$reb'] }, { $multiply: [1.5, '$ast'] },
  { $multiply: [2, '$stl'] }, { $multiply: [2, '$blk'] }, { $multiply: [-0.5, '$tov'] },
  { $switch: { branches: [{ case: { $gte: [tens, 3] }, then: 3 }, { case: { $gte: [tens, 2] }, then: 1.5 }], default: 0 } },
] }, 1] };
const PLAYED = { $or: [{ min: { $gt: 0 } }, { pts: { $gt: 0 } }, { reb: { $gt: 0 } }] };
const LINE_OUT = { _id: 0, source: 0, playerId: 0 };

// Games on a date, for the scoreboard strip
export async function dayGames(date) {
  return (await db()).collection('games').find({ date, boxed: true }, { projection: { home: 1, away: 1, hs: 1, as: 1, type: 1 } })
    .sort({ _id: 1 }).toArray();
}

// Every player who got on the floor that date (with fantasy points), highest to lowest in the stat.
export async function dayLines(date, s) {
  const f = stat(s);
  return (await db()).collection('lines').aggregate([
    { $match: { date, ...PLAYED } }, { $addFields: { fan: FAN } },
    { $sort: { [f]: -1, pts: -1, min: -1, name: 1 } }, { $project: LINE_OUT },
  ]).toArray();
}

// Totals per player over any set of games (a week, a season), every player, highest to lowest.
export async function periodTotals(match, s) {
  const f = stat(s);
  const sums = Object.fromEntries([...BOX, 'min'].map(k => [k, { $sum: `$${k}` }]));
  return (await db()).collection('lines').aggregate([
    { $match: { ...match, ...PLAYED } }, { $addFields: { fan: FAN } },
    { $group: { _id: '$key', ...sums, fan: { $sum: '$fan' }, gp: { $sum: 1 },
      last: { $top: { sortBy: { date: -1 }, output: { name: '$name', team: '$team', espnId: '$espnId' } } } } },
    { $addFields: { fan: { $round: ['$fan', 1] } } },
    { $sort: { [f]: -1, gp: 1, _id: 1 } },
    { $project: { _id: 0, key: '$_id', name: '$last.name', team: '$last.team', espnId: '$last.espnId', gp: 1, min: 1, fan: 1, ...Object.fromEntries(BOX.map(k => [k, 1])) } },
  ]).toArray();
}
export const seasonAll = (y, s) => periodTotals({ season: y, type: 'Regular Season' }, s);
// How much of a regular season is stored, for the "through <date>" note
export async function seasonInfo(y) {
  const d = await db();
  const [last, season] = await Promise.all([
    d.collection('games').find({ season: y, type: 'Regular Season', boxed: true }, { projection: { date: 1 } }).sort({ date: -1 }).limit(1).next(),
    d.collection('seasons').findOne({ _id: y }),
  ]);
  return { season: seasonLabel(y), through: last?.date || null, complete: !!season?.complete };
}
export const weekAll = (dates, s) => periodTotals({ date: { $in: dates } }, s);

// The best line on the same calendar day in every other stored season
export async function onThisDay(date, s, n = 3) {
  const f = stat(s), md = date.slice(5), y0 = +date.slice(0, 4);
  const dates = [];
  for (let y = 1993; y <= new Date().getUTCFullYear(); y++) if (y !== y0) dates.push(`${y}-${md}`);
  return (await db()).collection('lines').aggregate([
    { $match: { date: { $in: dates } } }, { $addFields: { fan: FAN } },
    { $sort: { [f]: -1, pts: -1 } }, { $limit: Math.min(10, +n || 3) }, { $project: LINE_OUT },
  ]).toArray();
}

// Player search (players collection is rebuilt by the ingest job)
export async function searchPlayers(q) {
  const esc = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (esc.length < 2) return [];
  const re = new RegExp(esc.split(/\s+/).map(w => `(?=.*\\b${w})`).join(''), 'i');
  return (await db()).collection('players').find({ name: re }, { projection: { _id: 0 } }).sort({ gp: -1 }).limit(12).toArray();
}

// Everything for a player page: season-by-season totals, career highs, last 10 games, best games
export async function playerCard(key) {
  const d = await db();
  const highs = Object.fromEntries(STATS.map(f => [f, [{ $sort: { [f]: -1, date: -1 } }, { $limit: 1 }, { $project: LINE_OUT }]]));
  const sums = Object.fromEntries([...BOX, 'min'].map(k => [k, { $sum: `$${k}` }]));
  const [r] = await d.collection('lines').aggregate([
    { $match: { key, ...PLAYED } }, { $addFields: { fan: FAN } },
    { $facet: {
      seasons: [{ $match: { type: 'Regular Season' } }, { $group: { _id: '$season', ...sums, fan: { $sum: '$fan' }, gp: { $sum: 1 },
        team: { $top: { sortBy: { date: -1 }, output: '$team' } } } }, { $sort: { _id: 1 } }],
      career: [{ $group: { _id: null, ...sums, fan: { $sum: '$fan' }, gp: { $sum: 1 }, first: { $min: '$date' }, last: { $max: '$date' },
        info: { $top: { sortBy: { date: -1 }, output: { name: '$name', team: '$team', espnId: '$espnId' } } } } }],
      recent: [{ $sort: { date: -1 } }, { $limit: 10 }, { $project: LINE_OUT }],
      best: [{ $sort: { fan: -1, date: -1 } }, { $limit: 5 }, { $project: LINE_OUT }],
      ...Object.fromEntries(Object.entries(highs).map(([f, p]) => ['high_' + f, p])),
    } },
  ]).toArray();
  if (!r?.career?.length) return null;
  const c = r.career[0];
  const round = o => ({ ...o, fan: Math.round(o.fan * 10) / 10 });
  return {
    key, name: c.info.name, team: c.info.team, espnId: c.info.espnId, first: c.first, last: c.last,
    career: round({ ...c, info: undefined, _id: undefined }),
    seasons: r.seasons.map(x => round({ ...x, season: seasonLabel(x._id), _id: undefined })),
    recent: r.recent.reverse(), best: r.best,
    highs: Object.fromEntries(STATS.map(f => [f, r['high_' + f]?.[0] || null])),
  };
}

// Rebuilds the small players collection used by search (run by the ingest job)
export async function rebuildPlayers() {
  const d = await db();
  await d.collection('lines').createIndex({ key: 1, date: -1 });
  await d.collection('players').createIndex({ key: 1 }, { unique: true });
  await d.collection('lines').aggregate([
    { $group: { _id: '$key', gp: { $sum: 1 }, first: { $min: '$date' }, last: { $max: '$date' },
      info: { $top: { sortBy: { date: -1 }, output: { name: '$name', team: '$team', espnId: '$espnId' } } } } },
    { $project: { _id: 0, key: '$_id', name: '$info.name', team: '$info.team', espnId: '$info.espnId', gp: 1, first: 1, last: 1 } },
    { $merge: { into: 'players', on: 'key', whenMatched: 'replace', whenNotMatched: 'insert' } },
  ]).toArray();
  return d.collection('players').countDocuments();
}

// Best single-game lines on a date. Ties: more points first, then name, so the order is stable.
export async function dayTop(date, s, n = 5) {
  return (await db()).collection('lines').find({ date, [stat(s)]: { $gt: 0 } }, { projection: { _id: 0 } })
    .sort({ [stat(s)]: -1, pts: -1, name: 1 }).limit(topN(n)).toArray();
}

// Every player who got on the floor that date, highest to lowest in the stat. Ties: points, minutes, name.
export async function dayAll(date, s) {
  const f = stat(s);
  return (await db()).collection('lines').find({ date, $or: [{ min: { $gt: 0 } }, { pts: { $gt: 0 } }, { reb: { $gt: 0 } }] }, { projection: { _id: 0 } })
    .sort({ [f]: -1, pts: -1, min: -1, name: 1 }).toArray();
}

// Best single game per player across several dates (no player appears twice)
export async function bestGames(dates, s, n = 10) {
  const f = stat(s);
  return (await db()).collection('lines').aggregate([
    { $match: { date: { $in: dates }, [f]: { $gt: 0 } } },
    { $sort: { [f]: -1, pts: -1, date: 1 } },
    { $group: { _id: '$key', line: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$line' } },
    { $sort: { [f]: -1, pts: -1, name: 1 } }, { $limit: topN(n) }, { $project: { _id: 0 } },
  ]).toArray();
}

// Regular-season totals summed from stored box scores
export async function seasonTotals(y, s, n = 5) {
  const d = await db();
  const f = stat(s);
  const [rows, games, last, season] = await Promise.all([
    d.collection('lines').aggregate([
      { $match: { season: y, type: 'Regular Season' } },
      { $sort: { date: 1 } },
      { $group: { _id: '$key', name: { $last: '$name' }, team: { $last: '$team' }, espnId: { $last: '$espnId' }, v: { $sum: `$${f}` }, gp: { $sum: 1 } } },
      { $sort: { v: -1, gp: 1, name: 1 } }, { $limit: topN(n) },
    ]).toArray(),
    d.collection('games').countDocuments({ season: y, type: 'Regular Season', boxed: true }),
    d.collection('games').find({ season: y, type: 'Regular Season', boxed: true }).sort({ date: -1 }).limit(1).next(),
    d.collection('seasons').findOne({ _id: y }),
  ]);
  return { season: seasonLabel(y), games, through: last?.date || null, complete: !!season?.complete, leaders: rows };
}

export async function meta() {
  const d = await db();
  // only seasons that have box scores (very old games can exist without one)
  const [dates, seasons] = await Promise.all([d.collection('lines').distinct('date'), d.collection('lines').distinct('season')]);
  return { dates: dates.sort(), seasons: seasons.sort((a, b) => b - a).map(seasonLabel) };
}
