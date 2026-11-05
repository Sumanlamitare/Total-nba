// One automation tick (or a given date): MONGODB_URI=... node scripts/tick.mjs [--date 20261104] [--force]
import { db, close } from '../lib/db.js';
import { tick } from '../lib/automation.js';
const i = process.argv.indexOf('--date');
try {
  const d = await db();
  console.log(await tick(d, { dates: i > 0 ? [process.argv[i + 1]] : null, force: process.argv.includes('--force') }));
} finally { await close(); }
