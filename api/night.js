// GET /api/night?date=YYYYMMDD (or date=latest) -> the night's games and its top performances, scored and explained.
import { db } from '../lib/db.js';
import { route, cache } from '../lib/http.js';
import { loadNight, latestDate, ensureSeason } from '../lib/nights.js';

export default route({
  GET: async ({ res, query }) => {
    const d = await db();
    let date = String(query.date || 'latest');
    if (date === 'latest') date = (await latestDate(d)).date;
    const night = await loadNight(d, date);
    const info = night.season ? await ensureSeason(d, night.season).catch(() => null) : null;
    // Final nights never change; a night with games still to finish is refreshed every minute.
    cache(res, night.final ? 86400 : night.live ? 60 : 300);
    return { date, season: night.season, final: night.final, live: night.live, games: night.games, top: night.top, players: night.players,
      dates: info?.dates || [] };
  },
});
