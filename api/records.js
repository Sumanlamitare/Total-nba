// Records & Milestones: recent record and milestone entries (with their verification), the record database (lists
// computed from every box score since 1993-94, plus reference records editors add with a source), and the milestone
// watch (ESPN career totals).
import { db } from '../lib/db.js';
import { route, actions, fail, int, str, ymdParam } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { getSettings } from '../lib/settings.js';
import { etDate, seasonOf, escapeRe, round } from '../lib/util.js';
import { STAT } from '../lib/stats.js';
import { SHOW } from '../lib/records.js';
import { idOf } from '../lib/content.js';

async function milestoneWatch(d, settings, limit = 20) {
  const season = seasonOf(etDate());
  const careers = await d.collection('careers').find({}).toArray();
  if (!careers.length) return [];
  const ids = careers.map(c => c._id);
  const [avgs, names] = await Promise.all([
    d.collection('pgames').aggregate([{ $match: { s: season, st: 2, p: { $in: ids } } }, { $group: { _id: '$p', gp: { $sum: 1 }, pts: { $avg: '$pts' }, reb: { $avg: '$reb' }, ast: { $avg: '$ast' }, stl: { $avg: '$stl' }, blk: { $avg: '$blk' }, tpm: { $avg: '$tpm' } } }]).toArray(),
    d.collection('players').find({ _id: { $in: ids } }, { projection: { name: 1, headshot: 1 } }).toArray(),
  ]);
  const A = new Map(avgs.map(a => [a._id, a])), N = new Map(names.map(p => [p._id, p]));
  const out = [];
  for (const c of careers) for (const [k, step] of Object.entries(settings.milestones.steps)) {
    if (k === 'gp') continue;
    const v = c.totals?.[k]; if (v == null || v < step) continue;
    const next = (Math.floor(v / step) + 1) * step, togo = next - v, pace = A.get(c._id)?.[k];
    const games = pace > 0 ? Math.ceil(togo / pace) : null;
    if (games == null || games > 10) continue;
    out.push({ pid: c._id, name: N.get(c._id)?.name || c._id, headshot: N.get(c._id)?.headshot, stat: k, label: STAT[k]?.label, total: v, next, togo, pace: round(pace, 1), games, asOf: c.asOf, source: c.source });
  }
  return out.sort((a, b) => a.games - b.games || a.togo - b.togo).slice(0, limit);
}

export default route({
  GET: actions({
    async overview() {
      const d = await db();
      const settings = await getSettings(d);
      const [recent, watch, meta, categories] = await Promise.all([
        d.collection('feed').find({ category: { $in: ['record', 'milestone'] }, published: true }).sort({ sortAt: -1 }).limit(30).toArray(),
        milestoneWatch(d, settings),
        d.collection('meta').findOne({ _id: 'records' }),
        d.collection('records').distinct('category'),
      ]);
      return { recent, watch, coverage: meta?.coverage || null, builtAt: meta?.builtAt || null, categories: categories.sort() };
    },
    async search({ query }) {
      const d = await db();
      const q = {};
      const words = str(query.term, 80).split(/\s+/).filter(Boolean);
      if (words.length) q.$and = words.map(w => ({ $or: [{ title: new RegExp(escapeRe(w), 'i') }, { scopeLabel: new RegExp(escapeRe(w), 'i') }, { category: new RegExp(escapeRe(w), 'i') }, { 'entries.name': new RegExp(escapeRe(w), 'i') }] }));
      if (query.category) q.category = str(query.category, 40);
      if (query.stype) q['scope.stype'] = int(query.stype);
      if (query.team) q['scope.team'] = str(query.team, 4);
      if (query.scope) q['scope.kind'] = str(query.scope, 10);
      const em = {};
      if (query.player) em.pid = str(query.player, 20);
      if (query.season) em.season = int(query.season);
      if (ymdParam(query.date)) em.date = query.date;
      if (Object.keys(em).length) q.entries = { $elemMatch: em };
      const [lists, refs] = await Promise.all([
        d.collection('records').find(q, { projection: { title: 1, scopeLabel: 1, category: 1, kind: 1, stat: 1, scope: 1, order: 1, entries: { $slice: 3 }, coverage: 1 } }).limit(int(query.limit, 60, 1, 200)).toArray(),
        d.collection('refrecords').find(words.length ? { $and: words.map(w => ({ $or: [{ title: new RegExp(escapeRe(w), 'i') }, { holder: new RegExp(escapeRe(w), 'i') }] })) } : {}).limit(40).toArray(),
      ]);
      return { lists, references: refs };
    },
    async list({ query }) {
      const d = await db();
      const r = await d.collection('records').findOne({ _id: str(query.id, 80) });
      if (!r) fail(404, 'No such record list');
      const feed = await d.collection('feed').find({ 'facts.eventId': { $regex: `:rec:${escapeRe(r._id)}$` } }).sort({ sortAt: -1 }).limit(10).toArray();
      return { ...r, entries: r.entries.slice(0, SHOW), feed };
    },
    async event({ query }) {
      const d = await db();
      const e = await d.collection('events').findOne({ _id: str(query.id, 160) });
      if (!e) fail(404, 'No such event');
      const list = e.listId ? await d.collection('records').findOne({ _id: e.listId }, { projection: { entries: { $slice: SHOW }, title: 1, scopeLabel: 1, coverage: 1, source: 1 } }) : null;
      return { event: e, list };
    },
  }),
  POST: actions({
    // Reference records (all-time, pre-1993-94, comebacks — anything not computable from box scores): editors add them with
    // a source; only the owner can mark one verified, and only verified ones are used for live comparisons.
    async refrecord({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      if (body.delete) { await requireUser(d, req, 'owner'); await d.collection('refrecords').deleteOne({ _id: idOf(body.id) }); return { ok: true }; }
      const doc = {
        title: str(body.title, 160), stat: STAT[body.stat] ? body.stat : null, kind: body.kind === 'game' ? 'game' : 'other', stype: [0, 2, 3].includes(+body.stype) ? +body.stype : 2,
        value: Number(body.value), holder: str(body.holder, 120), date: str(body.date, 20), opponent: str(body.opponent, 60), team: body.team ? str(body.team, 4) : null, rookie: !!body.rookie,
        scopeLabel: str(body.scopeLabel, 120), sourceUrl: str(body.sourceUrl, 400), notes: str(body.notes, 600),
      };
      if (!doc.title || !Number.isFinite(doc.value) || !/^https?:\/\//.test(doc.sourceUrl)) fail(400, 'A title, a numeric value and a source URL are required');
      if (body.id) { await d.collection('refrecords').updateOne({ _id: idOf(body.id) }, { $set: { ...doc, updatedAt: new Date(), updatedBy: u.email, verified: false, verifiedAt: null, verifiedBy: null } }); return { ok: true }; }
      const r = await d.collection('refrecords').insertOne({ ...doc, verified: false, addedBy: u.email, createdAt: new Date() });
      return { id: r.insertedId };
    },
    async verifyref({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'owner');
      await d.collection('refrecords').updateOne({ _id: idOf(body.id) }, { $set: { verified: !!body.verified, verifiedAt: body.verified ? new Date() : null, verifiedBy: body.verified ? u.email : null } });
      return { ok: true };
    },
  }),
});
