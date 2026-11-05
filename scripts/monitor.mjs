// The live monitor (GitHub Actions, through each game night). Two loops:
//   fast   — every few seconds while games are on (ATN_LIVE_EVERY_MS, default 4000): live games and new finals only,
//            so a story is on the feed seconds after ESPN's play-by-play has the play;
//   upkeep — once a minute, never blocking the fast loop: rechecks of older finals, AI writing, bios, career totals.
// Slower while waiting for tip-off; exits once every game of the night is final and verified (or at the time limit;
// the next scheduled run picks up). Usage: MONGODB_URI=... node scripts/monitor.mjs [--minutes 350]
import { db, close } from '../lib/db.js';
import { tick } from '../lib/automation.js';
import { sleep } from '../lib/util.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const deadline = Date.now() + (+arg('minutes', 350)) * 60e3;
const d = await db();
const run = process.env.GITHUB_RUN_ID || `local-${process.pid}`;
const LIVE_EVERY = +process.env.ATN_LIVE_EVERY_MS || 4000;
const log = m => console.log(new Date().toISOString(), m);
let ticks = 0, quiet = 0, stop = false;
// The upkeep loop.
const upkeep = (async () => {
  while (!stop && Date.now() < deadline) {
    const t0 = Date.now();
    try { await tick(d, { log, mode: 'upkeep' }); } catch (e) { console.error('upkeep failed:', e.message); }
    for (let w = Math.max(5e3, 60e3 - (Date.now() - t0)); w > 0 && !stop; w -= 1e3) await sleep(Math.min(1e3, w));
  }
})();
try {
  while (Date.now() < deadline) {
    const t0 = Date.now();
    let s;
    try { s = await tick(d, { log, mode: 'live' }); }
    catch (e) { console.error('tick failed:', e.message); s = { live: 0, scheduled: 1, errors: 1 }; }
    ticks++;
    const next = s.nextStart ? new Date(s.nextStart) - Date.now() : null;
    const state = s.live ? 'live' : s.scheduled ? 'waiting' : s.unverified ? 'verifying' : 'done';
    const took = Date.now() - t0;
    await d.collection('meta').updateOne({ _id: 'monitor' }, { $set: { run, at: new Date(), state, ticks, took, live: s.live, nextStart: s.nextStart || null } }, { upsert: true });
    if (s.live && ticks % 15 === 0) log(`live: ${s.live} games, tick took ${took} ms`);
    if (state === 'done') { if (++quiet >= 2) { console.log('Every game is final and verified; monitor done.'); break; } } else quiet = 0;
    const wait = s.live ? LIVE_EVERY : s.unverified ? 15e3 : next != null && next < 20 * 60e3 ? 45e3 : state === 'verifying' ? 120e3 : next != null ? Math.min(10 * 60e3, Math.max(60e3, next - 10 * 60e3)) : 120e3;
    await sleep(Math.max(s.live ? 500 : 2e3, wait - (Date.now() - t0)));
  }
  stop = true;
  await upkeep;
  await tick(d, { log, mode: 'upkeep' }).catch(e => console.error('last upkeep failed:', e.message)); // AI writing, POTN graphics, etc.
  await d.collection('meta').updateOne({ _id: 'monitor' }, { $set: { state: 'stopped', stoppedAt: new Date() } });
} finally { stop = true; await close(); }
