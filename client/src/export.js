// Exporting a diagram as a standalone graphic (never a screenshot of the page): the same SVG renderer at the chosen
// size, with every headshot embedded so the file stands on its own; then PNG (any scale), PDF or the clipboard.
import { composeGraphic } from '../../lib/venn/render.js';
import { buildDiagram } from '../../lib/venn/index.js';

export const FORMATS = {
  square: { label: 'Square 1080 × 1080', width: 1080, height: 1080 },
  portrait: { label: 'Portrait 1080 × 1350', width: 1080, height: 1350 },
  landscape: { label: 'Landscape 1920 × 1080', width: 1920, height: 1080 },
  custom: { label: 'Custom', width: 1600, height: 1200 },
};

// ESPN serves its headshots with open CORS; the resizing service gives smaller files. Either is embedded as data.
const small = href => (/a\.espncdn\.com\/i\/headshots/.test(href) ? `https://a.espncdn.com/combiner/i?img=${new URL(href).pathname}&w=220&h=161` : href);
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function fetchImage(href) {
  for (const u of [small(href), href]) {
    try {
      const r = await fetch(u, { mode: 'cors', signal: AbortSignal.timeout(12000) });
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) return await toDataUrl(await r.blob());
    } catch { /* next */ }
  }
  return null;
}
const imageCache = new Map();
export async function embedImages(players) {
  const hrefs = [...new Set(players.map(p => p.headshot).filter(Boolean))];
  await Promise.all(hrefs.map(async h => { if (!imageCache.has(h)) imageCache.set(h, await fetchImage(h)); }));
  return p => imageCache.get(p.headshot) || null;
}

// The standalone SVG. result/criteria/style as for the in-app diagram; frame: { width, height, title, subtitle,
// brand, attribution, legend }.
export async function standaloneSvg(result, criteria, style, frame) {
  const img = await embedImages(result.players);
  const landscape = frame.width > frame.height * 1.2;
  const d = buildDiagram(result, criteria, style, { img, width: landscape ? 1400 : 1000 });
  return composeGraphic(d, { ...frame, criteria, style, showLegend: frame.legend ?? d.view === 'upset' });
}

export async function svgToPng(svg, width, height, scale = 1, type = 'image/png') {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The graphic could not be drawn')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, type, 0.95));
  } finally { URL.revokeObjectURL(url); }
}

// A one-page PDF holding the graphic as a high-quality JPEG, sized to the graphic (72 dpi points).
export async function pngToPdf(svg, width, height) {
  const jpeg = new Uint8Array(await (await svgToPng(svg, width, height, 2, 'image/jpeg')).arrayBuffer());
  const W = width * 0.75, H = height * 0.75, pw = width * 2, ph = height * 2;
  const enc = new TextEncoder(), parts = [], offsets = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export async function copyImage(svgPromise, width, height) {
  // The clipboard item gets a promise so the browser keeps the click's permission while the image is made.
  const blob = (async () => svgToPng(await svgPromise, width, height, 1))();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
