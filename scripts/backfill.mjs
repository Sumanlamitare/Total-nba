// History and setup: teams, box scores by season (newest first, stopping before the database gets too big), player
// bios, the record lists, career totals, and a replay of recent nights into the feed (real stories from their final
// play-by-play, marked as recaps).
//   MONGODB_URI=... node scripts/backfill.mjs --seasons 2027,2026,...  [--records] [--highs] [--bios] [--careers] [--drop-history] [--replay 20261101-20261105] [--max-mb 380]
// The bulky box-score history only lives until the next daily reset: what's kept is the record book and career highs.
import { db, close } from '../lib/db.js';
import { syncTeams, backfillSeason, backfillBios } from '../lib/history.js';
import { rebuild } from '../lib/records.js';
import { refreshCareers, tick } from '../lib/automation.js';
import { addDays } from '../lib/util.js';

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const flag = k => process.argv.includes(`--${k}`);
const maxMb = +(arg('max-mb') || 380);
const d = await db();
const size = async () => { const s = await d.stats(); return (s.dataSize + (s.indexSize || 0)) / 1e6; };
try {
  console.log(`teams: ${await syncTeams(d)}`);
  for (const y of (arg('seasons') || '').split(',').filter(Boolean).map(Number)) {
    const mb = await size();
    if (mb > maxMb) { console.log(`stopping before ${y}: database at ${mb.toFixed(0)} MB (limit ${maxMb})`); break; }
    await backfillSeason(d, y);
    console.log(`  database: ${(await size()).toFixed(0)} MB`);
  }
  if (flag('bios')) await backfillBios(d);
  if (flag('records')) await rebuild(d);
  // Career highs for every player in the latest season, from the box-score history (kept after history is deleted).
  if (flag('highs')) {
    const latest = (await d.collection('pgames').find({}).sort({ d: -1 }).limit(1).toArray())[0]?.s;
    const active = await d.collection('pgames').distinct('p', { s: latest });
    let n = 0;
    for (let i = 0; i < active.length; i += 50) {
      const chunk = active.slice(i, i + 50);
      const rows = await d.collection('pgames').aggregate([{ $match: { p: { $in: chunk } } }, { $sort: { d: 1 } }, { $group: { _id: '$p', games: { $sum: 1 }, last: { $last: '$g' }, ...Object.fromEntries(['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].map(k => [k, { $max: { v: `$${k}`, date: { $toString: '$d' }, gid: '$g' } }])) } }]).toArray();
      for (const r of rows) {
        const highs = Object.fromEntries(['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].map(k => [k, r[k]]));
        await d.collection('highs').updateOne({ _id: r._id }, { $set: { highs, games: r.games, lastGid: r.last, source: 'Box scores since 1993-94 (ESPN)', at: new Date() } }, { upsert: true });
        n++;
      }
    }
    console.log(`career highs: ${n} players`);
  }
  if (flag('careers')) await refreshCareers(d, { L: async (l, m) => console.log(m) });
  // Once the record book and career highs exist, the bulky history isn't needed: drop it now.
  if (flag('drop-history')) {
    const g = await d.collection('pgames').deleteMany({});
    const gm = await d.collection('games').deleteMany({});
    console.log(`history dropped: ${g.deletedCount} player lines, ${gm.deletedCount} games`);
  }
  const r = arg('replay');
  if (r) {
    const [from, to] = r.split('-');
    for (let date = from; date <= (to || from); date = addDays(date, 1)) console.log(date, await tick(d, { dates: [date], force: true, log: () => {} }));
  }
  console.log(`database: ${(await size()).toFixed(0)} MB`);
} finally { await close(); }
