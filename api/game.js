// GET /api/game -> everything the game needs in one cached response: the franchises, the dynasty ladder and every
// player-era (franchise × decade) with its rating. Built by the weekly ingest from ESPN's statistics.
import { db } from '../lib/db.js';
import { route, cache, fail } from '../lib/http.js';

export default route({
  GET: async ({ res }) => {
    const d = await db();
    const [meta, eras] = await Promise.all([d.collection('meta').findOne({ _id: 'game' }), d.collection('eras').find({}).toArray()]);
    if (!meta) fail(503, 'The game data is being built. Try again in a few minutes.');
    cache(res, 3600);
    return {
      teams: meta.teams, decades: meta.decades, dynasties: meta.dynasties, at: meta.at,
      eras: eras.map(e => ({ team: e.team, decade: e.decade, players: e.players })),
    };
  },
});
