// GET /api/search?q= -> catalog matches; when the catalog has few, ESPN's search fills in, and NBA players it
// finds that aren't shelved yet are added to the catalog so they get a book.
import { db } from '../lib/db.js';
import { route, fail, cache, str } from '../lib/http.js';
import { publicRecord, sortKey, addFromEspn } from '../lib/catalog.js';
import * as espn from '../lib/espn.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default route({
  GET: async ({ res, query }) => {
    const q = str(query.q, 60);
    if (q.length < 2) fail(400, 'Type at least two letters');
    const d = await db();
    const words = sortKey(q, '').split(' ').filter(Boolean);
    const filter = { $and: words.map(w => ({ $or: [{ k: { $regex: `(^| )${esc(w)}` } }] })) };
    const local = await d.collection('players').find(filter).sort({ g: -1 }).limit(20).toArray();
    let added = [];
    if (local.length < 5) {
      const found = await espn.search(q).catch(() => null);
      const ids = (found?.results || []).filter(r => r.type === 'player').flatMap(r => r.contents || [])
        .map(c => (String(c.uid || '').match(/^s:40~l:46~a:(\d+)$/) || [])[1]).filter(Boolean)
        .filter(id => !local.some(p => p._id === id)).slice(0, 5);
      added = (await espn.pool(ids, 3, id => addFromEspn(d, id).catch(() => null))).filter(Boolean);
    }
    cache(res, added.length ? 60 : 600);
    return { results: [...local, ...added].map(publicRecord), added: added.map(p => p._id) };
  },
});
