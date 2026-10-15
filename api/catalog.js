// GET /api/catalog -> every book on the shelves, alphabetical by surname, plus how the catalog was built.
import { db } from '../lib/db.js';
import { route, cache } from '../lib/http.js';
import { publicRecord } from '../lib/catalog.js';

export default route({
  GET: async ({ res }) => {
    const d = await db();
    const [players, meta] = await Promise.all([
      d.collection('players').find({}).sort({ k: 1, _id: 1 }).toArray(),
      d.collection('meta').findOne({ _id: 'catalog' }),
    ]);
    cache(res, 3600);
    return { players: players.map(publicRecord), meta: meta ? { players: meta.players, from: meta.from, to: meta.to, at: meta.at } : null };
  },
});
