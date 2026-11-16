// Photos on graphics. Kept in their own collection (one per graphic, keyed by the graphic's id) and referenced from the
// graphic's data as "photo:<id>", so a graphic always renders with the photo it was made with.
//   upload — your own photo (downscaled in the browser to 1350 px before it's sent)
//   espn   — the still from ESPN's highlights video for the match (Settings → "Use ESPN highlight stills"); ESPN often
//            publishes it an hour or more after full time, so a graphic made without one checks again every 15 minutes
//            for 3 hours, then stops.
import { log } from './db.js';
import { highlightStill } from './espn.js';
import { getSettings } from './settings.js';

const MAX = 3.5e6; // bytes of data URI
export const RETRY_MIN = 15, RETRY_FOR_H = 3;

export async function storePhoto(d, id, { uri, source, credit = null, headline = null }) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(uri || ''))) throw Object.assign(new Error('Use a JPEG, PNG or WebP image'), { status: 400 });
  if (uri.length > MAX) throw Object.assign(new Error('That image is too large (keep it under about 2.5 MB)'), { status: 413 });
  await d.collection('photos').updateOne({ _id: id }, { $set: { uri, source, credit, headline, bytes: uri.length, at: new Date() } }, { upsert: true });
  await d.collection('graphics').updateOne({ _id: id }, { $set: { 'data.photo': { src: `photo:${id}`, source, credit }, updatedAt: new Date() }, $unset: { photoPending: '' }, $inc: { version: 1 } });
}

export async function removePhoto(d, id) {
  await d.collection('photos').deleteOne({ _id: id });
  await d.collection('graphics').updateOne({ _id: id }, { $set: { 'data.photo': null, updatedAt: new Date() }, $unset: { photoPending: '' }, $inc: { version: 1 } });
}

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FootballPast90/1.0)' } });
  if (!r.ok) return null;
  const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
  const uri = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  return uri.length <= MAX ? uri : null;
}

// Try ESPN's highlight still for one graphic. true when a photo was attached.
export async function tryEspnStill(d, g, { now = new Date() } = {}) {
  if (g.data?.photo) return false;
  const still = await highlightStill(g.match?.comp, g._id, [g.data?.home, g.data?.away]).catch(() => null);
  const uri = still && await fetchImage(still.url).catch(() => null);
  if (!uri) return false;
  await storePhoto(d, g._id, { uri, source: 'espn', headline: still.headline });
  await log(d, 'info', `${g.data.home?.name} ${g.data.score?.home}–${g.data.score?.away} ${g.data.away?.name}: photo added (ESPN highlights still)`, { event: g._id });
  return true;
}

// After a graphic is made: look for the still now, or schedule the re-checks.
export async function afterGenerate(d, id, { now = new Date(), ftAt = now } = {}) {
  const s = await getSettings(d);
  if (!s.graphics.espnPhotos) return;
  const g = await d.collection('graphics').findOne({ _id: id });
  if (!g || g.data?.photo) return;
  if (await tryEspnStill(d, g, { now })) return;
  await d.collection('graphics').updateOne({ _id: id }, { $set: { photoPending: { until: new Date(+new Date(ftAt) + RETRY_FOR_H * 3600e3), next: new Date(+now + RETRY_MIN * 60e3) } } });
}

// The re-checks (worker step): only graphics still waiting for a still, each at most every 15 minutes.
export async function photoRetries(d, { now = new Date() } = {}) {
  const due = await d.collection('graphics').find({ 'photoPending.next': { $lte: now } }).limit(20).toArray();
  let added = 0;
  for (const g of due) {
    if (new Date(g.photoPending.until) < now) { await d.collection('graphics').updateOne({ _id: g._id }, { $unset: { photoPending: '' } }); continue; }
    if (await tryEspnStill(d, g, { now })) added++;
    else await d.collection('graphics').updateOne({ _id: g._id }, { $set: { 'photoPending.next': new Date(+now + RETRY_MIN * 60e3) } });
  }
  return { checked: due.length, added };
}
