// GET /api/seasons -> the seasons on offer, newest first, each with its game dates and how many nights are scored.
import { db } from '../lib/db.js';
import { route, cache } from '../lib/http.js';
import { seasons, ensureSeason } from '../lib/nights.js';
import * as espn from '../lib/espn.js';

export default route({
  GET: async ({ res }) => {
    const d = await db();
    // Make sure the current season is offered from its first night.
    const sb = await espn.fetchJson(`${espn.SITE}/scoreboard`).catch(() => null);
    const current = Number(sb?.leagues?.[0]?.season?.year);
    if (current) await ensureSeason(d, current).catch(() => null);
    cache(res, 600);
    return { current: current || null, seasons: await seasons(d) };
  },
});
