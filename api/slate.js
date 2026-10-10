import { handler, bad } from '../lib/http.js';
import { slate } from '../lib/slate.js';
import { LEAGUES } from '../lib/espn.js';
import { db } from '../lib/db.js';

// GET /api/slate?sport=nfl[&date=YYYY-MM-DD] — games with lines, plus the latest logged picks for each
export default handler(async ({ sport = 'nfl', date }) => {
  if (!LEAGUES[sport]) throw bad('sport must be nba or nfl');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('date must be YYYY-MM-DD');
  const s = await slate(sport, date);
  if (process.env.MONGODB_URI && s.games.length) {
    const snaps = await (await db()).collection('snapshots').aggregate([
      { $match: { sport, id: { $in: s.games.map(g => g.id) } } }, { $sort: { at: -1 } },
      { $group: { _id: '$id', at: { $first: '$at' }, picks: { $first: '$picks' } } },
    ]).toArray().catch(() => []);
    const by = Object.fromEntries(snaps.map(x => [x._id, x]));
    for (const g of s.games) if (by[g.id]) g.picks = { at: by[g.id].at, list: by[g.id].picks.slice(0, 5), n: by[g.id].picks.length };
  }
  return { sport, ...s, cache: 120 };
});
