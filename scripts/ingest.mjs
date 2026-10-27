// Score every night of one or more seasons into MongoDB (nights already final are skipped unless --force).
//   MONGODB_URI=... node scripts/ingest.mjs [--season 2025,2026] [--force]
// Without --season it scores the current season and scores its last three nights again, for stat corrections.
import { db, close } from '../lib/db.js';
import { ingestSeason, seasonLabel } from '../lib/nights.js';
import * as espn from '../lib/espn.js';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const t0 = Date.now();
const log = s => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`);
try {
  const d = await db();
  const current = Number((await espn.fetchJson(`${espn.SITE}/scoreboard`))?.leagues?.[0]?.season?.year);
  const years = arg('season') ? arg('season').split(',').map(Number).filter(Boolean) : [current];
  // The previous apps' data is no longer used.
  for (const name of ['eras', 'players', 'leaders', 'awards', 'cache']) await d.collection(name).drop().catch(() => {});
  await d.collection('meta').deleteMany({ _id: { $in: ['game', 'catalog'] } });
  for (const y of years) {
    log(`season ${seasonLabel(y)}`);
    await ingestSeason(d, y, { log, force: process.argv.includes('--force'), refresh: arg('season') ? 0 : 3 });
  }
} finally { await close(); }
