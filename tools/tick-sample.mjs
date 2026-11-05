// Local end-to-end check without network: saved ESPN responses → tick → feed (in-memory database).
import { mockSources } from '../test/mock-sources.mjs';
const m = await mockSources(); Object.assign(process.env, m.env, { ATN_MEMDB: process.argv[2] || '1' });
const { db } = await import('../lib/db.js');
const { tick } = await import('../lib/automation.js');
const d = await db();
const later = new Date(Date.now() + 40 * 3600e3);
for (const now of [new Date(), later]) console.log(await tick(d, { dates: ['20261104', '20250115'], now, log: () => {} }));
const feed = await d.collection('feed').find({}).sort({ rank: -1 }).toArray();
for (const e of feed) console.log(String(e.significance).padStart(3), e.level.padEnd(8), e.published ? 'PUB' : '   ', e.status.padEnd(10), e.category.padEnd(14), e.headline.padEnd(28), '|', (e.body || '').slice(0, 110));
console.log((await d.collection('log').find({}).sort({ at: 1 }).toArray()).map(l => `${l.level} ${l.message}`).join('\n'));
await m.close();
