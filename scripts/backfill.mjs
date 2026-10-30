// Load whole seasons: every date's games and verified box scores, and each date's default diagrams.
//   MONGODB_URI=... node scripts/backfill.mjs --season 2026,2027 [--force] [--reset-diagrams] [--no-diagrams]
// --reset-diagrams removes the season's automatic diagrams first, so they're made fresh rather than as corrections.
import { db, close } from '../lib/db.js';
import { backfillSeason } from '../lib/jobs.js';
import { isCupFinal } from '../lib/providers/espn.js';

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const t0 = Date.now();
const log = s => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`);
try {
  const d = await db();
  // The previous app's data is no longer used.
  for (const name of ['nights', 'perfs']) await d.collection(name).drop().catch(() => {});
  await d.collection('meta').deleteMany({ _id: /^season:/ });
  for (const y of String(arg('season') || '').split(',').map(Number).filter(Boolean)) {
    log(`season ${y}`);
    // The NBA Cup final flag, from each game's note (counts toward no season statistics).
    for (const g of await d.collection('games').find({ season: y }, { projection: { note: 1 } }).toArray()) {
      const cup = isCupFinal(g.note || '');
      await d.collection('games').updateOne({ _id: g._id }, { $set: { cup } });
      await d.collection('pgames').updateMany({ gid: g._id }, cup ? { $set: { cup: true } } : { $unset: { cup: '' } });
    }
    // Rows of players who were listed but never on the floor aren't games played.
    const empty = { season: y, 's.min': { $lte: 0 }, ...Object.fromEntries(['pts', 'fga', 'fta', 'reb', 'ast', 'stl', 'blk', 'to', 'pf'].map(k => [`s.${k}`, 0])) };
    log(`removed ${(await d.collection('pgames').deleteMany(empty)).deletedCount} rows of players who never got on the floor`);
    if (process.argv.includes('--reset-diagrams')) log(`removed ${(await d.collection('diagrams').deleteMany({ season: y, auto: true })).deletedCount} automatic diagrams`);
    await backfillSeason(d, y, { log, force: process.argv.includes('--force'), diagrams: !process.argv.includes('--no-diagrams') });
  }
} finally { await close(); }
