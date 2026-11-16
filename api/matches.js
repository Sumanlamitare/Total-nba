// The dashboard (matches by day and competition), completed matches pending deletion, and the delete button.
import { db } from '../lib/db.js';
import { route, actions, fail } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { competitions } from '../lib/competitions.js';
import { stepIfIdle } from '../lib/jobs.js';
import { sync, withLock, FINAL, LIVE } from '../lib/matches.js';
import { preview, runCleanup, plan } from '../lib/cleanup.js';

export const config = { maxDuration: 60 };

// What the dashboard shows for a match's state.
export function stage(m) {
  if (m.status === 'ft') {
    const g = m.graphic?.status;
    if (g === 'generated') return { key: 'generated', label: 'Graphic generated' };
    if (g === 'review') return { key: 'review', label: 'Needs review' };
    if (g === 'failed') return { key: 'failed', label: 'Graphic failed' };
    if (g === 'waiting') return { key: 'ft', label: 'Waiting for scorers' };
    return { key: 'ft', label: 'Full time' };
  }
  return { scheduled: { key: 'scheduled', label: 'Scheduled' }, live: { key: 'live', label: 'Live' }, halftime: { key: 'halftime', label: 'Halftime' }, ended: { key: 'live', label: 'Ending' },
    postponed: { key: 'off', label: 'Postponed' }, canceled: { key: 'off', label: 'Cancelled' }, abandoned: { key: 'off', label: 'Abandoned' }, suspended: { key: 'off', label: 'Suspended' } }[m.status] || { key: 'scheduled', label: m.status };
}
const view = m => ({ _id: m._id, comp: m.comp, compName: m.compName, compLogo: m.compLogo, kickoff: m.kickoff, status: m.status, stage: stage(m), clock: m.espnStatus?.clock, detail: m.espnStatus?.detail,
  home: m.home, away: m.away, score: m.score, shootout: m.shootout, goals: m.status === 'ft' || LIVE.includes(m.status) ? m.goals : undefined, graphic: m.graphic, ftAt: m.ftAt || null });

export default route({
  GET: actions({
    async dashboard({ req }) {
      const d = await db();
      await stepIfIdle(d).catch(() => {});
      const s = await getSettings(d);
      const comps = await competitions(d);
      const order = new Map(comps.map(c => [c.code, c.order]));
      const list = await d.collection('matches').find({}).sort({ kickoff: 1 }).limit(1500).toArray();
      const count = k => list.filter(m => stage(m).key === k).length;
      return {
        now: new Date(), timezone: s.timezone,
        // Grouped by day in the viewer's own time zone in the browser; competitions in the configured order.
        matches: list.map(view), order: Object.fromEntries(order),
        counts: { total: list.length, scheduled: count('scheduled'), live: count('live') + count('halftime'), ft: count('ft'), generated: count('generated'), review: count('review') + count('failed') },
        jobs: await jobStatus(d), cleanup: await plan(d),
      };
    },
    async completed({ req }) {
      const d = await db();
      const list = await d.collection('matches').find({ status: { $in: FINAL } }).sort({ ftAt: -1, kickoff: -1 }).toArray();
      return { now: new Date(), items: list.map(view), cleanup: await plan(d), preview: await preview(d) };
    },
    async preview({ req }) {
      const d = await db();
      return preview(d);
    },
  }),
  POST: actions({
    // DELETE COMPLETED MATCH DATA: only matches ESPN confirmed as full time with their graphic made.
    async deleteCompleted({ req, body }) {
      const d = await db();
      if (body.confirm !== true) fail(400, 'Confirm first');
      const r = await withLock(d, 'cleanup', 5 * 60e3, () => runCleanup(d, { reason: 'manual' }));
      if (r.skipped) fail(409, 'A cleanup is already running; try again in a moment');
      return r;
    },
    async refresh({ req }) {
      const d = await db();
      const r = await withLock(d, 'sync', 5 * 60e3, () => sync(d));
      if (r.skipped) fail(409, 'A refresh is already running');
      return r;
    },
  }),
});

export async function jobStatus(d) {
  const docs = Object.fromEntries((await d.collection('jobs').find({ _id: { $in: ['worker', 'sync', 'poll', 'cleanup'] } }).toArray()).map(x => [x._id, x]));
  return { worker: docs.worker?.at || null, sync: docs.sync || null, poll: docs.poll?.at || null, cleanup: docs.cleanup?.lastRun || null };
}
