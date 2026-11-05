// Exporting a graphic in the browser: the same SVG the editor shows, with its fonts and images embedded, rasterized in
// a canvas to PNG or JPEG; then downloaded or handed to the device's share sheet.
import { renderScene, sceneImages } from '../../lib/graphics/render.js';

const FONT_FILES = [
  ['Barlow Condensed', 600, 'normal', 'BarlowCondensed-600.ttf'], ['Barlow Condensed', 700, 'normal', 'BarlowCondensed-700.ttf'], ['Barlow Condensed', 800, 'normal', 'BarlowCondensed-800.ttf'],
  ['Barlow Condensed', 900, 'normal', 'BarlowCondensed-900.ttf'], ['Barlow Condensed', 800, 'italic', 'BarlowCondensed-800i.ttf'],
  ['Inter', 400, 'normal', 'Inter_400Regular.ttf'], ['Inter', 600, 'normal', 'Inter_600SemiBold.ttf'], ['Inter', 700, 'normal', 'Inter_700Bold.ttf'], ['Inter', 800, 'normal', 'Inter_800ExtraBold.ttf'],
];
let fontCss = null;
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

async function fonts() {
  if (fontCss) return fontCss;
  const parts = await Promise.all(FONT_FILES.map(async ([fam, w, style, file]) => {
    const b = await fetch(`/fonts/${file}`).then(r => r.blob());
    return `@font-face{font-family:'${fam}';font-weight:${w};font-style:${style};src:url(${await toDataUrl(b)}) format('truetype');}`;
  }));
  return (fontCss = parts.join(''));
}

export async function embeddedSvg(scene) {
  const images = {};
  await Promise.all(sceneImages(scene).map(async src => {
    try { const r = await fetch(src, { mode: 'cors' }); if (r.ok) images[src] = await toDataUrl(await r.blob()); } catch { /* left as a link: the image is skipped in the export */ }
  }));
  return renderScene(scene, { images, fontCss: await fonts() });
}

export async function rasterize(scene, { type = 'image/png', scale = 1, quality = 0.92 } = {}) {
  const svg = await embeddedSvg(scene);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The graphic could not be drawn')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(scene.w * scale); c.height = Math.round(scene.h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = scene.bg || '#0a0a0b'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Export failed'))), type, quality));
  } finally { URL.revokeObjectURL(url); }
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function share(blob, name, text) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
  if (navigator.clipboard && window.ClipboardItem && blob.type === 'image/png') { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return 'copied'; }
  download(blob, name); return 'downloaded';
}
