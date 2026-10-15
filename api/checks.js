// GET    /api/checks                 -> { checks, limits }       (also sweeps this user's overdue checks)
// GET    /api/checks?id=             -> { check, pings, flips, alerts }
// POST   /api/checks {name, period, grace, desc?, tags?}
// POST   /api/checks?id=&action=pause|resume|test|rotate
// PATCH  /api/checks?id= {...}
// DELETE /api/checks?id=
import { ObjectId } from 'mongodb';
import { db } from '../lib/db.js';
import { route, fail } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { planOf } from '../lib/plans.js';
import { serialize, sweep, cleanCheck, newKey, state } from '../lib/checks.js';
import { alert } from '../lib/alerts.js';

async function own(user, id) {
  if (!ObjectId.isValid(id || '')) fail(404, 'Check not found');
  const c = await (await db()).collection('checks').findOne({ _id: new ObjectId(id), userId: user._id });
  return c || fail(404, 'Check not found');
}

export default route({
  async GET({ req, query }) {
    const user = await requireUser(req), col = (await db()).collection('checks');
    await sweep({ userId: user._id }, 100);
    if (query.id) {
      const c = await own(user, query.id);
      return {
        check: serialize(c),
        pings: (c.pings || []).slice().reverse().map(p => ({ at: p.at, kind: p.kind, dur: p.dur ?? null, ua: p.ua || '', body: p.body || '', src: p.src || '' })),
        flips: (c.flips || []).slice(-50).reverse(), alerts: (c.alerts || []).slice().reverse(),
      };
    }
    const list = await col.find({ userId: user._id }, { projection: { pings: { $slice: -30 }, alerts: 0 } }).sort({ createdAt: 1 }).toArray();
    const plan = planOf(user);
    return { checks: list.map(c => serialize(c)), limits: { checks: plan.checks, used: list.length, plan: plan.name } };
  },

  async POST({ req, query, body }) {
    const user = await requireUser(req), col = (await db()).collection('checks');
    if (query.id) {
      const c = await own(user, query.id);
      if (query.action === 'pause') await col.updateOne({ _id: c._id }, { $set: { paused: true, due: null } });
      else if (query.action === 'resume') {
        // resuming starts the clock again from now, so a long pause doesn't instantly alert
        const set = { paused: false };
        if (c.status === 'up') set.due = new Date(Date.now() + (c.period + c.grace) * 1000);
        await col.updateOne({ _id: c._id }, { $set: set });
      } else if (query.action === 'rotate') await col.updateOne({ _id: c._id }, { $set: { key: newKey() } });
      else if (query.action === 'test') {
        const r = await alert(c, 'test');
        if (!r.length) fail(400, 'Add an alert channel first (Settings → Alerts)');
        return { results: r.map(x => ({ ok: x.ok, error: x.error || null })) };
      } else fail(400, 'Unknown action');
      return { check: serialize(await col.findOne({ _id: c._id })) };
    }
    const plan = planOf(user);
    if ((await col.countDocuments({ userId: user._id })) >= plan.checks) fail(402, `Your plan allows ${plan.checks} checks. Delete one or upgrade.`);
    const doc = { ...cleanCheck(body), userId: user._id, key: newKey(), badge: newKey(9), status: 'new', paused: false, due: null, nPings: 0, pings: [], flips: [], alerts: [], createdAt: new Date() };
    doc.desc ??= ''; doc.tags ??= []; doc.public ??= false;
    doc._id = (await col.insertOne(doc)).insertedId;
    return { check: serialize(doc) };
  },

  async PATCH({ req, query, body }) {
    const user = await requireUser(req), col = (await db()).collection('checks');
    const c = await own(user, query.id), set = cleanCheck(body, true);
    // a new schedule moves the deadline of a running check
    if ((set.period || set.grace) && c.status === 'up' && c.lastPing && !c.paused)
      set.due = new Date(+c.lastPing + ((set.period ?? c.period) + (set.grace ?? c.grace)) * 1000);
    await col.updateOne({ _id: c._id }, { $set: set });
    return { check: serialize(await col.findOne({ _id: c._id })) };
  },

  async DELETE({ req, query }) {
    const user = await requireUser(req), c = await own(user, query.id);
    await (await db()).collection('checks').deleteOne({ _id: c._id });
    return { ok: true, was: state(c) };
  },
});
