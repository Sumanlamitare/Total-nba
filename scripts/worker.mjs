// The background worker (GitHub Actions, started every 30 minutes; one at a time). It works while there's something
// to do — matches near kickoff or on, a schedule refresh, the cleanup — and sleeps until the next thing when it's
// within 35 minutes; otherwise it exits and the next start picks up. Usage: MONGODB_URI=... node scripts/worker.mjs
import { db, close, log } from '../lib/db.js';
import { step } from '../lib/jobs.js';

const arg = (k, def) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : def; };
const deadline = Date.now() + (+arg('minutes', 340)) * 60e3;
const STAY = 35 * 60e3;
const say = m => console.log(new Date().toISOString(), m);
const d = await db();
try {
  for (;;) {
    let r;
    try { r = await step(d, { L: say }); } catch (e) { say(`step failed: ${e.message}`); await log(d, 'error', `Worker step failed: ${e.message}`); r = { next: { at: new Date(Date.now() + 60e3), why: 'retry after an error' } }; }
    const wait = new Date(r.next.at) - Date.now();
    if (wait > STAY) { say(`nothing for ${Math.round(wait / 60e3)} min (next: ${r.next.why}); exiting`); break; }
    if (Date.now() + wait > deadline) { say('time limit reached; the next start continues'); break; }
    if (wait > 5e3) say(`next: ${r.next.why} in ${Math.round(wait / 1000)} s`);
    await new Promise(res => setTimeout(res, Math.max(5e3, Math.min(wait, 5 * 60e3))));
  }
} finally { await close(); }
