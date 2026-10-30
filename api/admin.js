// Settings, saved configurations and manual refresh.
//   GET  /api/admin?q=settings                 the defaults and minimum samples
//   POST /api/admin?q=settings  { passcode, daily, season, minimums }   change them (the first passcode set becomes the
//                                                                        owner's; it's stored hashed)
//   GET  /api/admin?q=configs                  saved configurations
//   POST /api/admin?q=configs   { name, config, style }                  save one
//   POST /api/admin?q=refresh   { date }       check a date's games again now (box scores, corrections) and regenerate
//                                              its diagrams if anything changed; at most once a minute per date
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { route, fail } from '../lib/http.js';
import { getSettings, cleanCriteria } from '../lib/diagrams.js';
import { processDate } from '../lib/jobs.js';

const isDate = s => /^\d{8}$/.test(String(s || ''));
const hashPass = p => crypto.createHash('sha256').update(`overlap:${p}`).digest('hex');
const readBody = async req => (req.body && typeof req.body === 'object' ? req.body : JSON.parse(await new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => r(s || '{}')); })));
const num = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);

export default route({
  GET: async ({ query }) => {
    const d = await db();
    if (query.q === 'settings') return getSettings(d);
    if (query.q === 'configs') return { configs: (await d.collection('configs').find({}).sort({ createdAt: -1 }).limit(100).toArray()).map(c => ({ id: c._id, name: c.name, config: c.config, style: c.style, createdAt: c.createdAt })) };
    fail(404, 'Unknown query');
  },
  POST: async ({ req, query }) => {
    const d = await db();
    const body = await readBody(req);
    if (query.q === 'settings') {
      const cur = await d.collection('settings').findOne({ _id: 'defaults' });
      const pass = String(body.passcode || '');
      if (pass.length < 4) fail(400, 'A passcode of at least 4 characters is needed');
      if (cur?.passcode && cur.passcode !== hashPass(pass)) fail(403, 'Wrong passcode');
      const now = await getSettings(d);
      const daily = body.daily?.criteria ? { criteria: cleanCriteria('daily', body.daily.criteria).map(({ stat, op, value }) => ({ stat, op, value })) } : now.daily;
      const season = body.season?.criteria ? { stype: ['regular', 'playoffs'].includes(body.season.stype) ? body.season.stype : 'regular', criteria: cleanCriteria('season', body.season.criteria).map(({ stat, op, value }) => ({ stat, op, value })) } : now.season;
      if (!daily.criteria.length || !season.criteria.length) fail(400, 'Defaults need at least one criterion');
      const m = body.minimums || now.minimums, dm = m.daily || {}, sm = m.season || {};
      const minimums = {
        daily: { fga: num(dm.fga, 0, 40, 5), tpa: num(dm.tpa, 0, 20, 3), fta: num(dm.fta, 0, 20, 4), fg2a: num(dm.fg2a, 0, 40, 4), tsa: num(dm.tsa, 0, 40, 6), minutes: num(dm.minutes, 0, 48, 12), plays: num(dm.plays, 0, 40, 5) },
        season: { gamesPct: num(sm.gamesPct, 0, 100, 50), fgmPerGame: num(sm.fgmPerGame, 0, 15, 3.65), tpmPerGame: num(sm.tpmPerGame, 0, 10, 1), ftmPerGame: num(sm.ftmPerGame, 0, 10, 1.5), mpg: num(sm.mpg, 0, 48, 15) },
      };
      await d.collection('settings').updateOne({ _id: 'defaults' }, { $set: { daily, season, minimums, passcode: cur?.passcode || hashPass(pass), updatedAt: new Date() } }, { upsert: true });
      return getSettings(d);
    }
    if (query.q === 'configs') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) fail(400, 'Name the configuration');
      if (!body.config?.criteria?.length) fail(400, 'Nothing to save');
      const id = crypto.randomBytes(6).toString('base64url');
      await d.collection('configs').insertOne({ _id: id, name, config: body.config, style: body.style || null, createdAt: new Date() });
      return { id };
    }
    if (query.q === 'refresh') {
      const date = String(body.date || '');
      if (!isDate(date)) fail(400, 'Dates look like 20251029');
      const day = await d.collection('days').findOne({ _id: date });
      if (day?.checkedAt && Date.now() - new Date(day.checkedAt) < 60000) return { date, skipped: 'Checked less than a minute ago', day };
      const r = await processDate(d, date, { recheck: true, log: () => {} });
      return { date, day: r.day, daily: r.made?.daily?._id || null, season: r.made?.season?._id || null };
    }
    fail(404, 'Unknown request');
  },
});
