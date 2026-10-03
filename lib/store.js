// Reads and writes NBA data in MongoDB; pulls from Big Balls only for what isn't stored yet.
import { db } from './db.js';
import { api, parseBox, NICK, TYPES, LIVE_RESERVE, DAILY_CAP } from './bbs.js';

export const seasonOf = date => { const [y, m] = date.split('-').map(Number); return m >= 8 ? y : y - 1; }; // start year
export const seasonLabel = y => `${y}-${String(y + 1).slice(2)}`;
const etToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

export async function saveGame(date, game, rows) {
  const d = await db();
  const season = seasonOf(date);
  await d.collection('games').updateOne({ _id: game.id }, { $set: { ...game, _id: game.id, date, season, boxed: rows.length > 0 } }, { upsert: true });
  if (rows.length) {
    await d.collection('lines').bulkWrite(rows.map(r => {
      const doc = { ...r, key: r.playerId || 'name:' + r.name, gameId: game.id, date, season, type: game.type };
      return { replaceOne: { filter: { gameId: game.id, key: doc.key }, replacement: doc, upsert: true } };
    }), { ordered: false });
  }
}

async function boxGame(date, game, opts) {
  const res = await api(`/v1/live-stats/basketball/${game.id}/players`, opts);
  const rows = parseBox(res.data);
  await saveGame(date, game, rows);
  return rows.length;
}

// Make sure a date is in MongoDB: list its games, then pull box scores for finished games not stored yet.
// Past days that are complete are never requested again; today is rechecked at most every 5 minutes.
export async function ensureDay(date, opts = {}) {
  const d = await db();
  const meta = await d.collection('days').findOne({ _id: date });
  const today = etToday();
  if (meta?.complete) return { pulled: 0 };
  if (meta && date >= today && Date.now() - meta.checkedAt < 5 * 60e3) return { pulled: 0 };
  const res = await api(`/v1/matches?league=nba&date=${date}&tz=America/New_York&limit=50`, opts);
  const matches = (res.data || []).filter(m => TYPES.has(m.season_type));
  const stored = new Set((await d.collection('games').find({ date, boxed: true }, { projection: { _id: 1 } }).toArray()).map(g => g._id));
  let pulled = 1, pending = 0;
  for (const m of matches) {
    if (stored.has(m.id)) continue;
    if (m.status !== 'finished') { pending++; continue; }
    await boxGame(date, { id: m.id, home: NICK(m.home?.name), away: NICK(m.away?.name), hs: +m.score?.home || 0, as: +m.score?.away || 0, type: m.season_type }, opts);
    pulled++;
  }
  await d.collection('days').updateOne({ _id: date },
    { $set: { games: matches.length, complete: !pending && date < today, checkedAt: Date.now() } }, { upsert: true });
  return { pulled, pending };
}

// Full-season schedule (1 request per 200 games), stored once per season
export async function ensureSchedule(y, opts) {
  const d = await db();
  if (await d.collection('schedules').findOne({ _id: y })) return;
  let n = 0;
  for (let offset = 0; ; offset += 200) {
    const res = await api(`/v1/nba/games?season=${y}&limit=200&offset=${offset}`, opts);
    const games = (res.data || []).filter(g => TYPES.has(g.season_type)).map(g => ({
      _id: g.match_id || g.game_id, date: g.game_date, season: y, type: g.season_type,
      home: NICK(g.home?.name), away: NICK(g.away?.name), hs: +g.home?.pts || 0, as: +g.away?.pts || 0 }));
    if (games.length) {
      await d.collection('games').bulkWrite(games.map(g => ({ updateOne: { filter: { _id: g._id }, update: { $setOnInsert: { ...g, boxed: false } }, upsert: true } })), { ordered: false });
      n += games.length;
    }
    if (!res.data?.length || offset + 200 >= (res.pagination?.total ?? 0)) break;
  }
  if (n) await d.collection('schedules').insertOne({ _id: y, games: n, regular: await d.collection('games').countDocuments({ season: y, type: 'Regular Season' }), at: new Date() });
}

// Backfill old games newest first, leaving LIVE_RESERVE requests a day for live date pulls
export async function backfill(seasons, log = console.log) {
  const d = await db();
  const opts = { cap: DAILY_CAP - LIVE_RESERVE };
  for (const y of seasons) await ensureSchedule(y, opts);
  for (const y of seasons) {
    const todo = await d.collection('games').find({ season: y, boxed: false, noBox: { $ne: true } }).sort({ date: -1 }).toArray();
    log(`backfill ${seasonLabel(y)}: ${todo.length} games left`);
    let empty = 0;
    for (const g of todo) {
      const { _id, date, season, boxed, ...game } = g;
      if (await boxGame(date, { ...game, id: _id }, opts)) empty = 0;
      else {
        await d.collection('games').updateOne({ _id }, { $set: { noBox: true } });
        if (++empty >= 10) { log(`  ${seasonLabel(y)}: 10 empty box scores in a row, skipping`); break; }
      }
    }
  }
}

// --- reads -----------------------------------------------------------------------------
const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];
const stat = s => (STATS.includes(s) ? s : 'pts');

export async function dayTop(date, s, n = 5) {
  return (await db()).collection('lines').find({ date, [stat(s)]: { $gt: 0 } }, { projection: { _id: 0 } })
    .sort({ [stat(s)]: -1, pts: -1 }).limit(n).toArray();
}

// Regular-season totals summed from stored box scores, with how much of the season is loaded
export async function seasonTotals(y, s) {
  const d = await db();
  const f = stat(s);
  const [rows, loaded, sched] = await Promise.all([
    d.collection('lines').aggregate([
      { $match: { season: y, type: 'Regular Season' } },
      { $sort: { date: 1 } },
      { $group: { _id: '$key', name: { $last: '$name' }, team: { $last: '$team' }, v: { $sum: `$${f}` }, gp: { $sum: 1 } } },
      { $sort: { v: -1, gp: 1 } }, { $limit: 5 },
    ]).toArray(),
    d.collection('games').countDocuments({ season: y, type: 'Regular Season', boxed: true }),
    d.collection('schedules').findOne({ _id: y }),
  ]);
  return { season: seasonLabel(y), gamesLoaded: loaded, totalGames: sched?.regular || null, leaders: rows };
}

export async function meta() {
  const d = await db();
  const [dates, seasons, used] = await Promise.all([
    d.collection('lines').distinct('date'),
    d.collection('games').distinct('season'),
    d.collection('quota').findOne({ _id: new Date().toISOString().slice(0, 10) }),
  ]);
  return { dates: dates.sort(), seasons: seasons.sort((a, b) => b - a).map(seasonLabel), quota: { used: used?.used || 0, cap: DAILY_CAP } };
}
