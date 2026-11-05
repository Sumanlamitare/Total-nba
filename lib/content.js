// The graphics library: each graphic is an editable project (template + structured data + the editor's changes),
// rendered on demand, linked to the feed entry it tells. Graphics are created automatically only for feed entries that
// deserve one (configurable levels and categories); anyone with the editor role can create, edit, duplicate, export.
import { ObjectId } from 'mongodb';
import { fromFeed } from './graphics/data.js';
import { sizeOf } from './graphics/kit.js';
import { CATEGORIES } from './feed.js';

export const idOf = id => (ObjectId.isValid(String(id)) && String(id).length === 24 ? new ObjectId(String(id)) : String(id));

export function newProject(template, data, format = 'x_landscape', theme = {}) {
  return { template, format, size: sizeOf(format), data, theme, overrides: {}, removed: [], extra: [], order: [] };
}

// Create (or refresh, while untouched by an editor) the graphic for a feed entry.
export async function graphicForFeed(d, entry, settings, { by = 'automation' } = {}) {
  const brand = { name: settings.brand?.name || 'Around the NBA', handle: settings.brand?.handle || '' };
  const { template, data } = fromFeed({ ...entry, categoryLabel: CATEGORIES[entry.category]?.label }, { brand });
  const col = d.collection('content');
  const prev = await col.findOne({ feedId: entry._id });
  const now = new Date();
  if (prev) {
    if (prev.edited) return { item: prev, created: false };
    await col.updateOne({ _id: prev._id }, { $set: { 'project.data': data, title: entry.headline, verification: entry.verification, updatedAt: now } });
    return { item: { ...prev, project: { ...prev.project, data } }, created: false };
  }
  const formats = settings.graphics?.formats?.length ? settings.graphics.formats : ['x_landscape'];
  const doc = { feedId: entry._id, title: entry.headline, category: entry.category, project: newProject(template, data, formats[0]), formats,
    player: entry.players?.[0] ? { id: entry.players[0].id, name: entry.players[0].name } : null, team: entry.team ? { id: entry.team.id, abbr: entry.team.abbr } : null,
    game: entry.game ? { id: entry.game.id, date: entry.game.date } : null, verification: entry.verification, sources: entry.sources, status: 'ready', edited: false, createdAt: now, updatedAt: now, createdBy: by };
  const r = await col.insertOne(doc);
  await d.collection('feed').updateOne({ _id: entry._id }, { $set: { graphic: r.insertedId } });
  return { item: { ...doc, _id: r.insertedId }, created: true };
}

export const wantsGraphic = (entry, settings) => {
  const G = settings.graphics || {};
  if (!G.auto || !entry.published) return false;
  if (entry.status === 'pending') return false;
  return entry.level === 'critical' || (entry.level === 'high' && (G.high || []).includes(entry.category));
};
