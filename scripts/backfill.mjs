// Load whole seasons: every date's games and verified box scores, and each date's default diagrams.
//   MONGODB_URI=... node scripts/backfill.mjs --season 2026,2027 [--force] [--no-diagrams]
import { db, close } from '../lib/db.js';
import { backfillSeason } from '../lib/jobs.js';

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
    await backfillSeason(d, y, { log, force: process.argv.includes('--force'), diagrams: !process.argv.includes('--no-diagrams') });
  }
} finally { await close(); }
