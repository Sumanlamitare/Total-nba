// Reads and writes NBA data in MongoDB; pulls from ESPN only for dates that aren't stored yet.
import { db } from './db.js';
import { fetchDay, pool } from './espn.js';

export const seasonOf = date => { const [y, m] = date.split('-').map(Number); return m >= 8 ? y : y - 1; }; // start year
export const seasonLabel = y => `${y}-${String(y + 1).slice(2)}`;
export const etToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const iso = t => new Date(t).toISOString().slice(0, 10);

export async function saveGame(date, game, rows) {
  const d = await db();
  const season = seasonOf(date);
  const { done, ...g } = game;
  await d.collection('games').updateOne({ _id: g.id }, { $set: { ...g, _id: g.id, date, season, boxed: rows.length > 0, source: 'espn' } }, { upsert: true });
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
  const stored = new Set((await d.collection('games').find({ date, boxed: true }, { projection: { _id: 1 } }).toArray()).map(g => g._id));
  const { games, total, pending } = await fetchDay(date, stored);
  for (const { game, rows } of games) if (rows) await saveGame(date, game, rows);
  await d.collection('days').updateOne({ _id: date },
    { $set: { games: total, complete: !pending && date < etToday(), checkedAt: Date.now() } }, { upsert: true });
  return { pulled: true, pending };
}

// Fill whole seasons, newest date first. Season dates run Oct 1 – Jun 30.
export async function backfill(seasons, log = console.log) {
  const d = await db();
  const today = etToday();
  for (const y of seasons) {
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
      log(`${seasonLabel(y)}: complete`);
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

// Regular-season totals summed from stored box scores
export async function seasonTotals(y, s) {
  const d = await db();
  const f = stat(s);
  const [rows, games, last, season] = await Promise.all([
    d.collection('lines').aggregate([
      { $match: { season: y, type: 'Regular Season' } },
      { $sort: { date: 1 } },
      { $group: { _id: '$key', name: { $last: '$name' }, team: { $last: '$team' }, espnId: { $last: '$espnId' }, v: { $sum: `$${f}` }, gp: { $sum: 1 } } },
      { $sort: { v: -1, gp: 1 } }, { $limit: 5 },
    ]).toArray(),
    d.collection('games').countDocuments({ season: y, type: 'Regular Season', boxed: true }),
    d.collection('games').find({ season: y, type: 'Regular Season', boxed: true }).sort({ date: -1 }).limit(1).next(),
    d.collection('seasons').findOne({ _id: y }),
  ]);
  return { season: seasonLabel(y), games, through: last?.date || null, complete: !!season?.complete, leaders: rows };
}

export async function meta() {
  const d = await db();
  const [dates, seasons] = await Promise.all([d.collection('lines').distinct('date'), d.collection('games').distinct('season')]);
  return { dates: dates.sort(), seasons: seasons.sort((a, b) => b - a).map(seasonLabel) };
}
