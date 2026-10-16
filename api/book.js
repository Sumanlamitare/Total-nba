// GET /api/book?id=        -> a player's book (bio, honors, teams, regular-season and playoff stats, league-leading seasons)
// GET /api/book?id=&part=highs -> single-game career highs from ESPN game logs (slower; loaded when that chapter opens)
import { db } from '../lib/db.js';
import { route, fail, cache } from '../lib/http.js';
import { loadBook, loadHighs } from '../lib/book.js';

const database = async () => { try { return process.env.MONGODB_URI ? await db() : null; } catch { return null; } };

export default route({
  GET: async ({ res, query }) => {
    const id = String(query.id || '');
    if (!/^\d{1,10}$/.test(id)) fail(400, 'Ask for a player by id');
    const book = await loadBook(await database(), id);
    if (!book) fail(404, 'There is no record of this player');
    if (query.part === 'highs') {
      const seasons = [...(book.regular?.rows || []), ...(book.playoffs?.rows || [])].map(r => r.season).filter(Boolean);
      const highs = await loadHighs(id, seasons);
      cache(res, book.active ? 3600 : 86400 * 7);
      return highs;
    }
    cache(res, book.active ? 3600 : 86400);
    return book;
  },
});
