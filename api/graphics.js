// Generated graphics: list, one, the PNG (preview or download), regenerate, edit, approve, keep, remove.
// Graphics live apart from match data: deleting completed matches never touches them.
import { db } from '../lib/db.js';
import { route, actions, fail, str, int } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { renderPng } from '../lib/graphics/server.js';
import { regenerate, applyEdits, themeOf } from '../lib/matches.js';
import { storePhoto, removePhoto, tryEspnStill } from '../lib/photos.js';

export const config = { maxDuration: 60 };
const idOf = v => (/^\d{1,20}$/.test(String(v || '')) ? String(v) : fail(400, 'Bad id'));

// Only these fields can be edited (dotted paths into the graphic's data).
const EDITABLE = {
  'competition.name': v => str(v, 80), 'home.name': v => str(v, 80), 'away.name': v => str(v, 80),
  'score.home': v => int(v, 0, 0, 99), 'score.away': v => int(v, 0, 0, 99),
  'scorers.home': v => (Array.isArray(v) ? v.map(x => str(x, 90)).filter(Boolean).slice(0, 20) : []),
  'scorers.away': v => (Array.isArray(v) ? v.map(x => str(x, 90)).filter(Boolean).slice(0, 20) : []),
  'photo.credit': v => str(v, 80) || null, 'photo.anchor': v => (['top', 'center', 'bottom'].includes(v) ? v : 'center'),
  note: v => str(v, 60) || null, statusLabel: v => str(v, 24) || 'Full time', date: v => str(v, 40),
  shootout: v => (v && v.home !== '' && v.away !== '' && v.home != null && v.away != null ? { home: int(v.home, 0, 0, 30), away: int(v.away, 0, 0, 30) } : null),
};
function cleanEdits(e) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  for (const [k, fn] of Object.entries(EDITABLE)) if (k in e) out[k] = fn(e[k]);
  return Object.keys(out).length ? out : null;
}
const summary = g => ({ _id: g._id, status: g.status, problems: g.problems, match: g.match, data: applyEdits(g.data, g.edits), edited: !!g.edits, approved: !!g.approved, keep: !!g.keep, render: g.render, error: g.error, createdAt: g.createdAt, updatedAt: g.updatedAt, version: g.version, downloads: g.downloads || 0, downloadedAt: g.downloadedAt || null, theme: g.theme, photoPending: g.photoPending || null });

export default route({
  GET: actions({
    async list({ req, query }) {
      const d = await db();
      const q = {};
      if (['ready', 'review', 'failed'].includes(query.status)) q.status = query.status;
      const items = await d.collection('graphics').find(q).sort({ createdAt: -1 }).limit(int(query.limit, 200, 1, 500)).toArray();
      const s = await getSettings(d);
      return { items: items.map(summary), retentionDays: s.graphics.retentionDays };
    },
    async get({ req, query }) {
      const d = await db();
      const g = await d.collection('graphics').findOne({ _id: idOf(query.id) });
      if (!g) fail(404, 'No such graphic');
      const m = await d.collection('matches').findOne({ _id: g._id }, { projection: { _id: 1 } });
      return { ...summary(g), original: g.data, edits: g.edits || {}, matchDataHeld: !!m };
    },
    // The photo on a graphic (for the editor's preview).
    async photo({ res, query }) {
      const d = await db();
      const p = await d.collection('photos').findOne({ _id: idOf(query.id) });
      if (!p) fail(404, 'No photo');
      const [, type, b64] = String(p.uri).match(/^data:([^;]+);base64,(.*)$/) || [];
      res.statusCode = 200;
      res.setHeader('content-type', type || 'image/jpeg');
      res.setHeader('cache-control', 'private, max-age=86400');
      res.end(Buffer.from(b64 || '', 'base64'));
      res.raw = true;
    },
    // The PNG, exactly 1080 × 1350. ?download=1 saves it as a file and records the download.
    async png({ req, res, query }) {
      const d = await db();
      const g = await d.collection('graphics').findOne({ _id: idOf(query.id) });
      if (!g) fail(404, 'No such graphic');
      const out = await renderPng(d, applyEdits(g.data, g.edits), g.theme || themeOf(await getSettings(d)));
      res.statusCode = 200;
      res.setHeader('content-type', 'image/png');
      res.setHeader('cache-control', 'private, max-age=3600');
      if (query.download === '1') {
        const name = `${g.match?.home || 'home'}-${g.match?.away || 'away'}-FT`.replace(/[^\w-]+/g, '-').replace(/-+/g, '-');
        res.setHeader('content-disposition', `attachment; filename="${name}.png"`);
        await d.collection('graphics').updateOne({ _id: g._id }, { $inc: { downloads: 1 }, $set: { downloadedAt: new Date() } });
      }
      res.end(out.buffer);
      res.raw = true;
    },
  }),
  POST: actions({
    async regenerate({ req, body }) {
      const d = await db();
      const g = await regenerate(d, idOf(body.id));
      if (!g) fail(404, 'No such match or graphic');
      return summary(g);
    },
    // Save edits (the original data is kept; "reset" clears the edits). Saving with approve marks a flagged graphic ready.
    async save({ req, body }) {
      const d = await db();
      const id = idOf(body.id);
      const g = await d.collection('graphics').findOne({ _id: id });
      if (!g) fail(404, 'No such graphic');
      const edits = body.reset ? null : cleanEdits(body.edits);
      const approve = body.approve === true;
      let render = g.render, error = null;
      try { const r = await renderPng(d, applyEdits(g.data, edits), g.theme); render = { ok: true, bytes: r.buffer.length, missingImages: r.missing }; } catch (e) { error = e.message; }
      const status = error ? 'failed' : approve || g.approved || !g.problems?.length ? 'ready' : 'review';
      await d.collection('graphics').updateOne({ _id: id }, { $set: { edits, render, error, status, approved: approve || !!g.approved, updatedAt: new Date() }, $inc: { version: 1 } });
      await d.collection('matches').updateOne({ _id: id }, { $set: { 'graphic.status': status === 'ready' ? 'generated' : status } });
      return summary(await d.collection('graphics').findOne({ _id: id }));
    },
    // Put a photo on a graphic: your own (a data URI, downscaled in the browser), or ESPN's highlights still.
    async photo({ body }) {
      const d = await db();
      const id = idOf(body.id);
      const g = await d.collection('graphics').findOne({ _id: id });
      if (!g) fail(404, 'No such graphic');
      if (body.source === 'espn') { if (!(await tryEspnStill(d, g))) fail(404, 'ESPN has no highlights still for this match yet'); }
      else await storePhoto(d, id, { uri: String(body.dataUri || ''), source: 'upload', credit: str(body.credit, 80) || null });
      return summary(await d.collection('graphics').findOne({ _id: id }));
    },
    async removePhoto({ body }) {
      const d = await db();
      await removePhoto(d, idOf(body.id));
      return summary(await d.collection('graphics').findOne({ _id: idOf(body.id) }));
    },
    async keep({ req, body }) {
      const d = await db();
      await d.collection('graphics').updateOne({ _id: idOf(body.id) }, { $set: { keep: body.keep !== false } });
      return { ok: true };
    },
    async remove({ req, body }) {
      const d = await db();
      const id = idOf(body.id);
      if (await d.collection('matches').countDocuments({ _id: id, status: 'ft' }, { limit: 1 })) await d.collection('matches').updateOne({ _id: id }, { $set: { 'graphic.status': 'removed' } });
      await d.collection('graphics').deleteOne({ _id: id });
      await d.collection('photos').deleteOne({ _id: id });
      return { ok: true };
    },
  }),
});
