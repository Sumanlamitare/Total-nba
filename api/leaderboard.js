// GET /api/leaderboard?season=YYYY[&stage=all|regular|playoffs] -> players by Performances of the Night that season.
import { db } from '../lib/db.js';
import { route, cache, fail } from '../lib/http.js';
import { leaderboard } from '../lib/nights.js';

export default route({
  GET: async ({ res, query }) => {
    const season = Number(query.season);
    if (!Number.isInteger(season) || season < 1950 || season > 2100) fail(400, 'Choose a season, like season=2025 for 2024-25');
    const stage = ['all', 'regular', 'playoffs'].includes(query.stage) ? query.stage : 'all';
    cache(res, 600);
    return { stage, ...(await leaderboard(await db(), season, { stage })) };
  },
});
