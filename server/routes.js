import { Router } from 'express';
import { Line, Reaction, Meta } from './models.js';

const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];
const r = Router();
const stat = q => (STATS.includes(q) ? q : 'pts');
const pad = n => String(n).padStart(2, '0');
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Writes need APP_PASSWORD when it is set, so only you can like/dislike/add notes
function auth(req, res, next) {
  const pw = process.env.APP_PASSWORD;
  if (pw && req.get('x-app-password') !== pw) return res.status(401).json({ error: 'password required' });
  next();
}

const dayTop = (date, s, n = 5) => Line.find({ date, [s]: { $gt: 0 } })
  .sort({ [s]: -1, pts: -1 }).limit(n).lean();

r.get('/health', (req, res) => res.json({ ok: true }));

r.get('/meta', async (req, res) => {
  const [dates, seasons, meta] = await Promise.all([Line.distinct('date'), Line.distinct('season'), Meta.findById('meta').lean()]);
  res.json({ dates: dates.sort(), seasons: seasons.sort().reverse(), updated: meta?.updated, passwordRequired: !!process.env.APP_PASSWORD });
});

r.get('/day/:date', async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'bad date' });
  res.json(await dayTop(req.params.date, stat(req.query.stat)));
});

// Regular-season totals leaders
r.get('/season/:season', async (req, res) => {
  const s = stat(req.query.stat);
  res.json(await Line.aggregate([
    { $match: { season: req.params.season, type: 2 } },
    { $sort: { date: 1 } },
    { $group: { _id: '$playerId', name: { $last: '$name' }, team: { $last: '$team' }, v: { $sum: `$${s}` }, gp: { $sum: 1 } } },
    { $sort: { v: -1, gp: 1 } }, { $limit: 5 },
  ]));
});

// Every daily top-5 line in the Monday–Sunday week, for "performance of the week"
r.get('/week/:date', async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'bad date' });
  const d = new Date(req.params.date + 'T12:00:00Z');
  const start = addDays(req.params.date, -((d.getUTCDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const out = [];
  for (const date of dates) for (const s of STATS) (await dayTop(date, s)).forEach((l, j) => out.push({ ...l, stat: s, rank: j }));
  res.json({ start, end: dates[6], lines: out });
});

r.get('/reactions', async (req, res) => {
  const all = await Reaction.find().lean();
  res.json(Object.fromEntries(all.map(x => [x._id, { vote: x.vote, notes: x.notes }])));
});

r.put('/reactions/:key/vote', auth, async (req, res) => {
  const vote = [-1, 0, 1].includes(req.body?.vote) ? req.body.vote : 0;
  res.json(await Reaction.findByIdAndUpdate(req.params.key, { vote }, { upsert: true, returnDocument: 'after' }).lean());
});

r.post('/reactions/:key/notes', auth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 280);
  if (!text) return res.status(400).json({ error: 'empty note' });
  res.json(await Reaction.findByIdAndUpdate(req.params.key, { $push: { notes: { text, ts: Date.now() } } }, { upsert: true, returnDocument: 'after' }).lean());
});

export default r;
