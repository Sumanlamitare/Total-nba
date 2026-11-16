// Server-side rendering: scene → SVG (render.js) → PNG (resvg, bundled fonts). Logos are embedded from the logos
// collection: fetched from ESPN once, downscaled to 320 px and kept, so a saved graphic always renders the same even if
// ESPN changes or drops an image.
import { Resvg } from '@resvg/resvg-js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderScene, sceneImages } from './render.js';
import { buildScene } from './fulltime.js';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
let fonts = null;
const fontFiles = () => (fonts ||= fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf')).map(f => path.join(FONT_DIR, f)));
const mem = new Map();
const LOGO_PX = 320;

// A logo as a small PNG data URI, from the logos collection (or fetched, downscaled and stored once).
export async function logoUri(d, url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (mem.has(url)) return mem.get(url);
  const id = crypto.createHash('sha1').update(url).digest('hex');
  const hit = d && await d.collection('logos').findOne({ _id: id });
  if (hit?.uri) { mem.set(url, hit.uri); return hit.uri; }
  let uri = null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FootballPast90/1.0)' } });
    if (r.ok) {
      const type = r.headers.get('content-type') || 'image/png';
      const raw = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
      // Downscale (contain, transparent) so the stored copy stays small.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_PX}" height="${LOGO_PX}"><image href="${raw}" x="0" y="0" width="${LOGO_PX}" height="${LOGO_PX}" preserveAspectRatio="xMidYMid meet"/></svg>`;
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: LOGO_PX } }).render().asPng();
      uri = `data:image/png;base64,${png.toString('base64')}`;
      if (d) await d.collection('logos').updateOne({ _id: id }, { $set: { url, uri, bytes: png.length, at: new Date() } }, { upsert: true });
    }
  } catch { uri = null; }
  if (mem.size > 300) mem.clear();
  if (uri) mem.set(url, uri);
  return uri;
}

export async function graphicSvg(d, data, theme) {
  const scene = buildScene(data, theme);
  const images = {};
  await Promise.all(sceneImages(scene).map(async src => { const u = await logoUri(d, src); if (u) images[src] = u; }));
  return { svg: renderScene(scene, { images }), scene, missing: sceneImages(scene).filter(s => !images[s]) };
}

// data + theme → { buffer (PNG), width, height, missing: [image urls that could not be embedded] }.
export async function renderPng(d, data, theme) {
  const { svg, scene, missing } = await graphicSvg(d, data, theme);
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: scene.w }, font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'Inter' }, background: scene.bg }).render();
  return { buffer: img.asPng(), width: img.width, height: img.height, missing };
}
