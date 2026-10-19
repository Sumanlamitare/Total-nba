// Build the game data (player-era ratings and the dynasty ladder) from ESPN into MongoDB.
//   MONGODB_URI=... node scripts/ingest.mjs [--from 1985] [--to 2027] [--scan 8000]
import { db, close } from '../lib/db.js';
import { ingest } from '../lib/catalog.js';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : def; };
const t0 = Date.now();
try {
  const meta = await ingest(await db(), { log: s => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`), from: arg('from', undefined), to: arg('to', undefined), scan: arg('scan', 0) });
  console.log(JSON.stringify(meta));
} finally { await close(); }
