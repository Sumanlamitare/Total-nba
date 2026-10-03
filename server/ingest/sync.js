// Pulls box scores into MongoDB. Old days are fetched once; the last few days are always refreshed.
import { Game, Line, Day, Meta } from '../models.js';
import { fetchDay, pool } from './espn.js';

const iso = d => d.toISOString().slice(0, 10);
export const seasonOf = date => { const [y, m] = date.split('-').map(Number); const end = m >= 8 ? y + 1 : y; return `${end - 1}-${String(end).slice(2)}`; };
// US Eastern "today", so late West Coast games land on the right date
const todayET = () => iso(new Date(Date.now() - 5 * 3600e3));

export async function sync({ from = '2023-10-24', refresh = 3, log = console.log } = {}) {
  // Lock so overlapping syncs (startup + a visit) don't both run; stale locks expire after 30 min
  await Meta.updateOne({ _id: 'meta' }, { $setOnInsert: { lockedAt: null } }, { upsert: true });
  const lock = await Meta.findOneAndUpdate(
    { _id: 'meta', $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(Date.now() - 30 * 60e3) } }] },
    { lockedAt: new Date() });
  if (!lock) { log('sync already running'); return; }
  try {
    const today = todayET();
    const recent = iso(new Date(Date.parse(today) - refresh * 864e5));
    const done = new Set((await Day.find({ partial: false, _id: { $lt: recent } }, '_id').lean()).map(d => d._id));
    const todo = [];
    for (let t = Date.parse(from); t <= Date.parse(today); t += 864e5) {
      const date = iso(new Date(t)), m = +date.slice(5, 7);
      if (m >= 7 && m <= 9) continue; // off-season
      if (!done.has(date)) todo.push(date);
    }
    log(`syncing ${todo.length} dates`);
    let n = 0;
    await pool(todo, 3, async date => {
      try {
        const { games, lines, partial } = await fetchDay(date);
        const season = seasonOf(date);
        if (games.length) await Game.bulkWrite(games.map(g => ({ replaceOne: { filter: { _id: g._id }, replacement: { ...g, date, season }, upsert: true } })));
        if (lines.length) await Line.bulkWrite(lines.map(l => ({ replaceOne: { filter: { gameId: l.gameId, playerId: l.playerId }, replacement: { ...l, date, season }, upsert: true } })));
        await Day.replaceOne({ _id: date }, { games: games.length, partial, fetchedAt: new Date() }, { upsert: true });
        if (++n % 50 === 0) log(`  ${n}/${todo.length}`);
      } catch (e) { log(`day failed ${date}: ${e.message}`); }
    });
    await Meta.updateOne({ _id: 'meta' }, { updated: new Date() });
    log('sync done');
  } finally {
    await Meta.updateOne({ _id: 'meta' }, { lockedAt: null });
  }
}
