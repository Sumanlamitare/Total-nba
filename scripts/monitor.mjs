// The live monitor (GitHub Actions, through each game night): runs the automation every 20 seconds while games are on,
// less often while waiting for tip-off, and exits once every game of the night is final and verified (or at the time
// limit; the next scheduled run picks up). Usage: MONGODB_URI=... node scripts/monitor.mjs [--minutes 350]
import { db, close } from '../lib/db.js';
import { tick } from '../lib/automation.js';
import { sleep } from '../lib/util.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const deadline = Date.now() + (+arg('minutes', 350)) * 60e3;
const d = await db();
const run = process.env.GITHUB_RUN_ID || `local-${process.pid}`;
let ticks = 0, quiet = 0;
try {
  while (Date.now() < deadline) {
    const t0 = Date.now();
    let s;
    try { s = await tick(d, { log: m => console.log(new Date().toISOString(), m) }); }
    catch (e) { console.error('tick failed:', e.message); s = { live: 0, scheduled: 1, errors: 1 }; }
    ticks++;
    const next = s.nextStart ? new Date(s.nextStart) - Date.now() : null;
    const state = s.live ? 'live' : s.scheduled ? 'waiting' : s.unverified ? 'verifying' : 'done';
    await d.collection('meta').updateOne({ _id: 'monitor' }, { $set: { run, at: new Date(), state, ticks, live: s.live, nextStart: s.nextStart || null } }, { upsert: true });
    if (state === 'done') { if (++quiet >= 2) { console.log('Every game is final and verified; monitor done.'); break; } } else quiet = 0;
    const wait = s.live ? 20e3 : next != null && next < 20 * 60e3 ? 45e3 : state === 'verifying' ? 120e3 : next != null ? Math.min(10 * 60e3, Math.max(60e3, next - 10 * 60e3)) : 120e3;
    await sleep(Math.max(2e3, wait - (Date.now() - t0)));
  }
  await d.collection('meta').updateOne({ _id: 'monitor' }, { $set: { state: 'stopped', stoppedAt: new Date() } });
} finally { await close(); }
