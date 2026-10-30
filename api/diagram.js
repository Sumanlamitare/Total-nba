// Diagrams.
//   GET  /api/diagram?id=ID                         one diagram (any version)
//   GET  /api/diagram?kind=daily|season&date=YYYYMMDD the automatic diagram of a date (latest version)
//   GET  /api/diagram?list=1[&kind=][&season=][&before=YYYYMMDD]   the archive, newest first
//   POST /api/diagram  { config, style }             evaluate a custom diagram on the server's data and save it
//                                                    (for sharing and history); returns { id }
import { db } from '../lib/db.js';
import { route, cache, fail } from '../lib/http.js';
import { generate } from '../lib/diagrams.js';

const isDate = s => /^\d{8}$/.test(String(s || ''));
const summary = x => ({ id: x._id, kind: x.kind, auto: !!x.auto, date: x.date, season: x.season, title: x.title, period: x.period, criteria: x.config?.criteria?.map(c => c.label), total: x.result?.total, version: x.version, latest: x.latest, createdAt: x.createdAt });

export default route({
  GET: async ({ res, query }) => {
    const d = await db();
    if (query.list) {
      const match = { latest: true };
      if (['daily', 'season', 'custom'].includes(query.kind)) match.kind = query.kind;
      if (+query.season) match.season = +query.season;
      if (isDate(query.before)) match.date = { $lt: query.before };
      const rows = await d.collection('diagrams').find(match, { projection: { result: 0, style: 0, minimums: 0 } }).sort({ date: -1, createdAt: -1 }).limit(Math.min(120, +query.limit || 60)).toArray();
      cache(res, 60, 600);
      return { diagrams: rows.map(summary) };
    }
    let doc = null;
    if (query.id) doc = await d.collection('diagrams').findOne({ _id: String(query.id) });
    else if (['daily', 'season'].includes(query.kind) && isDate(query.date)) doc = await d.collection('diagrams').find({ kind: query.kind, auto: true, date: query.date, latest: true }).sort({ version: -1 }).limit(1).next();
    else fail(400, 'Which diagram?');
    if (!doc) fail(404, 'No diagram for that yet');
    const versions = await d.collection('diagrams').find({ key: doc.key }, { projection: { _id: 1, version: 1, createdAt: 1, latest: 1 } }).sort({ version: -1 }).toArray();
    cache(res, doc.latest ? 120 : 86400, 3600);
    return { diagram: doc, versions: versions.map(v => ({ id: v._id, version: v.version, createdAt: v.createdAt, latest: v.latest })) };
  },
  POST: async ({ req }) => {
    const d = await db();
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(await new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => r(s || '{}')); }));
    const cfg = body.config || {};
    if (cfg.mode !== 'daily' && cfg.mode !== 'season') fail(400, 'mode is daily or season');
    if (cfg.mode === 'daily' && !isDate(cfg.date)) fail(400, 'Dates look like 20251029');
    if (cfg.mode === 'season' && !+cfg.season) fail(400, 'Which season?');
    const config = { mode: cfg.mode, date: cfg.date, season: +cfg.season || undefined, stype: cfg.stype, from: isDate(cfg.from) ? cfg.from : null, to: isDate(cfg.to) ? cfg.to : null, criteria: cfg.criteria,
      teams: (cfg.teams || []).map(String).slice(0, 30), exclude: (cfg.exclude || []).map(String).slice(0, 200), players: (cfg.players || []).map(String).slice(0, 200) };
    const doc = await generate(d, { kind: 'custom', config, style: body.style || null });
    return { id: doc._id, total: doc.result.total };
  },
});
