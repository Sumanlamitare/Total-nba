// The automation run (every 15 minutes in the evening, .github/workflows/auto.yml): today's and yesterday's games,
// box scores once verified, the default diagrams once a date is complete, corrections, season figures.
//   MONGODB_URI=... node scripts/auto.mjs [--date YYYYMMDD] [--force]
import { db, close } from '../lib/db.js';
import { runAutomation, processDate } from '../lib/jobs.js';

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
try {
  const d = await db();
  if (arg('date')) await processDate(d, arg('date'), { force: process.argv.includes('--force'), recheck: true });
  else await runAutomation(d, { force: process.argv.includes('--force') });
} finally { await close(); }
