// Graphics Studio: the library of graphics (editable projects tied to feed entries), saved designs, uploaded images,
// and server rendering (PNG / JPEG) — the same renderer as the editor.
import { db } from '../lib/db.js';
import { route, actions, fail, int, str, privateCache } from '../lib/http.js';
import { requireUser, currentUser } from '../lib/auth.js';
import { getSettings } from '../lib/settings.js';
import { graphicForFeed, newProject, idOf } from '../lib/content.js';
import { fromFeed } from '../lib/graphics/data.js';
import { CATEGORIES } from '../lib/feed.js';
import { TEMPLATES, TEMPLATE } from '../lib/graphics/templates.js';
import { FORMATS, sizeOf } from '../lib/graphics/kit.js';
import { renderProject } from '../lib/graphics/server.js';

export const config = { maxDuration: 30 };

// Only known fields of a project are kept (it is rendered server-side and in browsers).
function cleanProject(p) {
  if (!p || typeof p !== 'object') fail(400, 'Missing project');
  if (!TEMPLATE[p.template]) fail(400, 'Unknown template');
  const size = p.format === 'custom' ? sizeOf('custom', p.size) : sizeOf(p.format);
  const json = JSON.stringify(p);
  if (json.length > 400_000) fail(413, 'Project too large');
  return { template: p.template, format: FORMATS[p.format] || p.format === 'custom' ? p.format : 'x_landscape', size, data: p.data || {}, theme: p.theme || {},
    overrides: p.overrides || {}, removed: Array.isArray(p.removed) ? p.removed.slice(0, 200) : [], extra: Array.isArray(p.extra) ? p.extra.slice(0, 60) : [], order: Array.isArray(p.order) ? p.order.slice(0, 300) : [] };
}

async function resolveUpload(d, id) {
  const u = await d.collection('uploads').findOne({ _id: idOf(id) });
  return u?.data || null;
}

export default route({
  GET: actions({
    async list({ req, query }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const q = {};
      if (query.category) q.category = str(query.category, 20);
      if (query.term) q.title = new RegExp(String(query.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
      return d.collection('content').find(q, { projection: { title: 1, category: 1, feedId: 1, 'project.template': 1, 'project.size': 1, 'project.format': 1, verification: 1, edited: 1, createdAt: 1, updatedAt: 1, player: 1, team: 1 } }).sort({ updatedAt: -1 }).limit(int(query.limit, 60, 1, 200)).toArray();
    },
    async get({ req, query }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const g = await d.collection('content').findOne({ _id: idOf(query.id) });
      if (!g) fail(404, 'No such graphic');
      const feed = g.feedId ? await d.collection('feed').findOne({ _id: g.feedId }, { projection: { headline: 1, body: 1, stats: 1, verification: 1, status: 1, sources: 1 } }) : null;
      return { ...g, feed };
    },
    async templates({ req }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const saved = await d.collection('templates').find({}).sort({ updatedAt: -1 }).limit(100).toArray();
      return { builtin: TEMPLATES.map(t => ({ id: t.id, name: t.name, category: t.category, stats: t.stats })), saved, formats: FORMATS };
    },
    // PNG or JPEG of a graphic. Public: graphics are made from public data and meant to be shared.
    async render({ res, query }) {
      const d = await db();
      const g = await d.collection('content').findOne({ _id: idOf(query.id) });
      if (!g) fail(404, 'No such graphic');
      const format = query.f === 'jpeg' || query.f === 'jpg' ? 'jpeg' : 'png';
      const out = await renderProject(g.project, { format, scale: Math.min(2, Math.max(0.25, +query.scale || 1)), resolveUpload: id => resolveUpload(d, id) });
      res.statusCode = 200;
      res.setHeader('content-type', out.type);
      res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
      res.setHeader('content-disposition', `inline; filename="around-the-nba-${g._id}.${format === 'jpeg' ? 'jpg' : 'png'}"`);
      res.end(out.buffer);
      res.raw = true;
    },
    // A feed entry's graphic, rendered on demand from its data (nothing stored). format: x_landscape | x_square |
    // ig_portrait | ig_story (TikTok / Reels / Stories); f: png | jpeg.
    async feed({ res, query }) {
      const d = await db();
      const e = await d.collection('feed').findOne({ _id: str(query.id, 160) });
      if (!e) fail(404, 'No such event');
      const settings = await getSettings(d);
      const { template, data } = fromFeed({ ...e, categoryLabel: CATEGORIES[e.category]?.label }, { brand: { name: settings.brand.name, handle: settings.brand.handle } });
      const format = FORMATS[query.format] ? query.format : 'x_landscape';
      const out = await renderProject(newProject(template, data, format), { format: query.f === 'jpeg' || query.f === 'jpg' ? 'jpeg' : 'png', scale: Math.min(2, Math.max(0.25, +query.scale || 1)) });
      res.statusCode = 200;
      res.setHeader('content-type', out.type);
      res.setHeader('cache-control', 'public, max-age=60, s-maxage=120');
      res.end(out.buffer);
      res.raw = true;
    },
    async upload({ res, query }) {
      const d = await db();
      const u = await d.collection('uploads').findOne({ _id: idOf(query.id) });
      if (!u) fail(404, 'No such image');
      const [, type, b64] = String(u.data).match(/^data:([^;]+);base64,(.*)$/) || [];
      res.statusCode = 200;
      res.setHeader('content-type', type || 'image/png');
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      res.end(Buffer.from(b64 || '', 'base64'));
      res.raw = true;
    },
  }),
  POST: actions({
    // New graphic: from a feed entry, or a template with blank data.
    async create({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      const settings = await getSettings(d);
      if (body.feedId) {
        const e = await d.collection('feed').findOne({ _id: str(body.feedId, 160) });
        if (!e) fail(404, 'No such feed entry');
        const existing = await d.collection('content').findOne({ feedId: e._id });
        if (existing && !body.fresh) return { id: existing._id };
        const r = await graphicForFeed(d, existing ? { ...e, _id: `${e._id}` } : e, settings, { by: u.email });
        return { id: r.item._id };
      }
      const t = TEMPLATE[body.template] ? body.template : 'player-story';
      const project = newProject(t, { kicker: 'AROUND THE NBA', headline: 'HEADLINE', note: '', stats: [], brand: { name: settings.brand.name, handle: settings.brand.handle }, source: 'Data: ESPN' }, FORMATS[body.format] ? body.format : 'x_landscape');
      const r = await d.collection('content').insertOne({ title: str(body.title, 120) || 'Untitled graphic', category: 'custom', project, verification: { status: 'manual', note: 'Created by hand: an editor is responsible for the facts' }, edited: true, createdAt: new Date(), updatedAt: new Date(), createdBy: u.email });
      return { id: r.insertedId };
    },
    async save({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      const project = cleanProject(body.project);
      const r = await d.collection('content').updateOne({ _id: idOf(body.id) }, { $set: { project, title: str(body.title, 120) || 'Graphic', edited: true, updatedAt: new Date(), updatedBy: u.email } });
      if (!r.matchedCount) fail(404, 'No such graphic');
      return { ok: true, updatedAt: new Date() };
    },
    async duplicate({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      const g = await d.collection('content').findOne({ _id: idOf(body.id) });
      if (!g) fail(404, 'No such graphic');
      const { _id, feedId, ...rest } = g;
      const r = await d.collection('content').insertOne({ ...rest, copyOf: _id, feedRef: feedId || null, title: `${g.title} (copy)`, edited: true, createdAt: new Date(), updatedAt: new Date(), createdBy: u.email });
      return { id: r.insertedId };
    },
    async remove({ req, body }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const g = await d.collection('content').findOne({ _id: idOf(body.id) });
      if (!g) fail(404, 'No such graphic');
      await d.collection('content').deleteOne({ _id: g._id });
      if (g.feedId) await d.collection('feed').updateOne({ _id: g.feedId }, { $set: { graphic: null } });
      return { ok: true };
    },
    // Saved designs: a project's template, theme and layout changes, reusable with any data.
    async template({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      if (body.delete) { await d.collection('templates').deleteOne({ _id: idOf(body.id) }); return { ok: true }; }
      const p = cleanProject(body.project);
      const doc = { name: str(body.name, 80) || 'Saved design', template: p.template, theme: p.theme, overrides: p.overrides, removed: p.removed, extra: p.extra, order: p.order, format: p.format, updatedAt: new Date(), by: u.email };
      const r = await d.collection('templates').insertOne(doc);
      return { id: r.insertedId };
    },
    async upload({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'editor');
      const m = String(body.data || '').match(/^data:(image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/);
      if (!m) fail(400, 'Upload a PNG, JPEG or WebP image');
      if (body.data.length > 3.5e6) fail(413, 'Images must be under 2.5 MB');
      const r = await d.collection('uploads').insertOne({ data: body.data, type: m[1], name: str(body.name, 120), by: u.email, at: new Date() });
      return { id: r.insertedId, url: `/api/graphics?action=upload&id=${r.insertedId}` };
    },
  }),
});
export { currentUser, privateCache };
