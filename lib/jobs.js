// One step of the background work, shared by the worker (GitHub Actions, scripts/worker.mjs) and the web app (which
// steps in only when the worker hasn't been seen for a few minutes):
//   schedule refresh when it's due · live checks when a match is near kickoff or on · the automatic cleanup when due.
// Returns when the next thing needs doing, so the worker can sleep until then (or exit when nothing is close).
import { getSettings } from './settings.js';
import { sync, poll, activeMatches, withLock } from './matches.js';
import { autoCleanup, plan } from './cleanup.js';

export async function step(d, { now = new Date(), L = () => {}, who = 'worker' } = {}) {
  const s = await getSettings(d);
  if (who === 'worker') await d.collection('jobs').updateOne({ _id: 'worker' }, { $set: { at: now, run: process.env.GITHUB_RUN_ID || `local-${process.pid}` } }, { upsert: true });
  const out = {};
  const last = await d.collection('jobs').findOne({ _id: 'sync' });
  if (!last?.at || now - new Date(last.at) >= s.polling.syncEveryMin * 60e3) out.sync = await withLock(d, 'sync', 5 * 60e3, () => sync(d, { now, L }));
  const lastPoll = await d.collection('jobs').findOne({ _id: 'poll' });
  const active = await activeMatches(d, { now, settings: s });
  if (active.length && (!lastPoll?.at || now - new Date(lastPoll.at) >= (s.polling.liveEverySec - 2) * 1000)) out.poll = await withLock(d, 'poll', 3 * 60e3, () => poll(d, { now, L }));
  out.cleanup = await withLock(d, 'cleanup', 5 * 60e3, () => autoCleanup(d, { now, L }));
  return { ...out, next: await nextWake(d, { now, settings: s }) };
}

// The next moment something needs doing.
export async function nextWake(d, { now = new Date(), settings } = {}) {
  const s = settings || await getSettings(d);
  const active = await activeMatches(d, { now, settings: s });
  if (active.length) return { at: new Date(+now + s.polling.liveEverySec * 1000), why: `${active.length} match${active.length === 1 ? '' : 'es'} on or near kickoff` };
  const upcoming = await d.collection('matches').find({ status: 'scheduled', kickoff: { $gt: now } }).sort({ kickoff: 1 }).limit(1).toArray();
  const last = await d.collection('jobs').findOne({ _id: 'sync' });
  const p = await plan(d, { now });
  const cands = [
    upcoming[0] && { at: new Date(+new Date(upcoming[0].kickoff) - s.polling.preKickoffMin * 60e3), why: `kickoff ${upcoming[0].home?.name} v ${upcoming[0].away?.name}` },
    { at: new Date(+new Date(last?.at || 0) + s.polling.syncEveryMin * 60e3), why: 'schedule refresh' },
    p.enabled && { at: p.dueAt, why: `cleanup for ${p.day}` },
  ].filter(Boolean).map(c => ({ ...c, at: c.at < now ? now : c.at }));
  return cands.sort((a, b) => a.at - b.at)[0];
}

// The web app's fallback: when the worker hasn't checked in for 3 minutes, do one step (locks keep it single).
export async function stepIfIdle(d, { now = new Date() } = {}) {
  const w = await d.collection('jobs').findOne({ _id: 'worker' });
  if (w?.at && now - new Date(w.at) < 3 * 60e3) return { worker: true };
  return step(d, { now, who: 'web' });
}
