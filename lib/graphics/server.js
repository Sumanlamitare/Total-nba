// Server-side rendering of a graphic: the same SVG the editor shows, rasterized by resvg with the bundled fonts, as PNG
// or JPEG (Instagram and Threads require JPEG). Images (headshots, logos, uploads) are fetched and embedded first.
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderScene, sceneImages } from './render.js';
import { buildScene } from './templates.js';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const fontFiles = () => fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf')).map(f => path.join(FONT_DIR, f));
const imgCache = new Map();

// Fetch an image as a data URI (cached per instance). Uploaded images are read from the database by the caller.
export async function dataUri(url, { resolveUpload } = {}) {
  if (!url || url.startsWith('data:')) return url;
  if (imgCache.has(url)) return imgCache.get(url);
  let uri = null;
  try {
    if (url.startsWith('/api/graphics?action=upload') && resolveUpload) uri = await resolveUpload(new URL(url, 'http://x').searchParams.get('id'));
    else {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; AroundTheNBAStudio/1.0)' } });
      if (r.ok) uri = `data:${r.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
    }
  } catch { uri = null; }
  if (imgCache.size > 200) imgCache.clear();
  if (uri) imgCache.set(url, uri);
  return uri;
}

export async function sceneSvg(scene, opts = {}) {
  const images = {};
  await Promise.all(sceneImages(scene).map(async src => { const u = await dataUri(src, opts); if (u) images[src] = u; }));
  return renderScene(scene, { images });
}

// project → { buffer, type, width, height }. format: png | jpeg. scale: 1 (exact size) .. 2.
export async function renderProject(project, { format = 'png', scale = 1, resolveUpload, quality = 92 } = {}) {
  const scene = buildScene(project);
  const svg = await sceneSvg(scene, { resolveUpload });
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(scene.w * scale) }, font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'Inter' }, background: scene.bg });
  const img = r.render();
  if (format === 'jpeg' || format === 'jpg') {
    const raw = { data: Buffer.from(img.pixels), width: img.width, height: img.height };
    return { buffer: jpeg.encode(raw, quality).data, type: 'image/jpeg', width: img.width, height: img.height };
  }
  return { buffer: img.asPng(), type: 'image/png', width: img.width, height: img.height };
}
