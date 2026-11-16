// Temporary match data cleanup.
//
// Eligible: matches ESPN confirmed as full time whose graphic exists (generated, or flagged for review — the graphic and
// its data live in the graphics collection, so nothing is lost). Never: scheduled, live or half-time matches, or a
// finished match whose graphic is still being made. Automatic cleanup also removes postponed / cancelled / abandoned
// matches whose kickoff is long past (they will not be played on that date; if ESPN reschedules, the next sync adds the
// match again). Graphics, competition settings and app settings are never touched.
//
// Deleted event ids go to "processed" (expiring after 4 days) so a schedule refresh can't bring them back.
//
// Automatic schedule: 60 minutes (configurable) before the first kickoff of the next calendar day in the app's time zone;
// a fallback time when that day has no matches. The plan is recalculated on every check, so schedule changes move it.
// Each day's cleanup runs once (lastDay); running it again, or after a manual cleanup, only deletes what is newly
// eligible — it is idempotent. A failed run is logged and retried on the next check.
import { log } from './db.js';
import { getSettings } from './settings.js';
import { dayOf, addDays, zonedTime } from './tz.js';
import { FINAL, DEAD } from './matches.js';

const eligibleQuery = (now, s, { auto }) => ({ $or: [
  { status: { $in: FINAL }, 'graphic.status': { $in: ['generated', 'review', 'removed', 'failed'] } },
  ...(auto ? [{ status: { $in: DEAD }, kickoff: { $lt: new Date(+now - s.cleanup.deletePostponedAfterHours * 3600e3) } }] : []),
] });

// What a cleanup would delete right now.
export async function preview(d, { now = new Date(), auto = false } = {}) {
  const s = await getSettings(d);
  const list = await d.collection('matches').find(eligibleQuery(now, s, { auto }), { projection: { goals: 1, status: 1, home: 1, away: 1 } }).toArray();
  const goals = list.reduce((n, m) => n + (m.goals?.length || 0), 0);
  const generating = await d.collection('matches').countDocuments({ status: { $in: FINAL }, 'graphic.status': { $nin: ['generated', 'review', 'removed', 'failed'] } });
  return { matches: list.length, goalEvents: goals, records: list.length + goals, kept: { generating } };
}

export async function runCleanup(d, { now = new Date(), reason = 'manual', ids = null } = {}) {
  const s = await getSettings(d);
  const q = eligibleQuery(now, s, { auto: reason === 'auto' });
  if (ids) q._id = { $in: ids.map(String) };
  const list = await d.collection('matches').find(q, { projection: { _id: 1, goals: 1, home: 1, away: 1, score: 1, status: 1 } }).toArray();
  let deleted = 0, goalEvents = 0;
  if (list.length) {
    // Re-check the status in the delete itself: a match can't slip from "eligible" to anything else between the two.
    const del = await d.collection('matches').deleteMany({ ...q, _id: { $in: list.map(m => m._id) } });
    const ops = list.map(m => ({ updateOne: { filter: { _id: m._id }, update: { $set: { at: now, reason } }, upsert: true } }));
    await d.collection('processed').bulkWrite(ops, { ordered: false });
    const goals = list.reduce((n, m) => n + (m.goals?.length || 0), 0);
    await log(d, 'info', `${reason === 'auto' ? 'Automatic' : 'Manual'} cleanup: deleted ${del.deletedCount} completed match${del.deletedCount === 1 ? '' : 'es'} (${goals} goal events). Graphics kept.`, { cleanup: { reason, ids: list.map(m => m._id) } });
    deleted = del.deletedCount; goalEvents = goals;
  } else {
    await log(d, 'info', `${reason === 'auto' ? 'Automatic' : 'Manual'} cleanup: nothing to delete`);
  }
  let graphicsPruned = 0;
  if (reason === 'auto' && s.graphics.retentionDays > 0) {
    const r = await d.collection('graphics').deleteMany({ createdAt: { $lt: new Date(+now - s.graphics.retentionDays * 86400e3) }, keep: { $ne: true } });
    graphicsPruned = r.deletedCount;
    if (graphicsPruned) await log(d, 'info', `Graphics older than ${s.graphics.retentionDays} days removed: ${graphicsPruned}`);
  }
  // Logos nobody uses any more (no match or graphic refers to them) can go too; they're re-fetched if needed.
  await d.collection('jobs').updateOne({ _id: 'cleanup' }, { $set: { lastRun: { at: now, reason, deleted: deleted || 0 } } }, { upsert: true });
  return { deleted: deleted || 0, goalEvents: goalEvents || 0, graphicsPruned };
}

// When the next automatic cleanup is due, and for which day.
export async function plan(d, { now = new Date() } = {}) {
  const s = await getSettings(d);
  const tz = s.timezone;
  const today = dayOf(now, tz);
  const job = await d.collection('jobs').findOne({ _id: 'cleanup' });
  const dueFor = async day => {
    const from = zonedTime(day, 0, 0, tz), to = zonedTime(addDays(day, 1), 0, 0, tz);
    const first = await d.collection('matches').find({ kickoff: { $gte: from, $lt: to }, status: { $nin: DEAD } }).sort({ kickoff: 1 }).limit(1).toArray();
    if (first[0]) return { day, dueAt: new Date(+new Date(first[0].kickoff) - s.cleanup.beforeFirstKickoffMin * 60e3), basis: 'first-kickoff', firstKickoff: first[0].kickoff };
    const [hh, mm] = s.cleanup.fallbackTime.split(':').map(Number);
    return { day, dueAt: zonedTime(day, hh, mm, tz), basis: 'fallback' };
  };
  let lastDay = job?.lastDay;
  if (!lastDay) {
    // First run ever: today's cleanup counts as done if its time has passed (nothing from today gets swept early).
    const t = await dueFor(today);
    lastDay = now >= t.dueAt ? today : addDays(today, -1);
    await d.collection('jobs').updateOne({ _id: 'cleanup' }, { $set: { lastDay } }, { upsert: true });
  }
  const target = lastDay >= today ? addDays(today, 1) : today;
  const p = await dueFor(target);
  return { ...p, lastDay, enabled: s.cleanup.auto, timezone: tz, failures: job?.failures || 0, lastRun: job?.lastRun || null, lastError: job?.lastError || null };
}

// The automatic check (worker every minute; the web app when the worker is idle).
export async function autoCleanup(d, { now = new Date(), L = () => {} } = {}) {
  const p = await plan(d, { now });
  if (!p.enabled || now < p.dueAt) return { due: false, plan: p };
  try {
    const r = await runCleanup(d, { now, reason: 'auto' });
    await d.collection('jobs').updateOne({ _id: 'cleanup' }, { $set: { lastDay: p.day, failures: 0, lastError: null } }, { upsert: true });
    L(`cleanup for ${p.day}: deleted ${r.deleted}`);
    return { due: true, ran: true, ...r, plan: p };
  } catch (e) {
    await d.collection('jobs').updateOne({ _id: 'cleanup' }, { $set: { lastError: { at: now, message: e.message } }, $inc: { failures: 1 } }, { upsert: true });
    await log(d, 'error', `Automatic cleanup failed (will retry): ${e.message}`);
    return { due: true, ran: false, error: e.message, plan: p };
  }
}
