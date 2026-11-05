// Text measurement from the real fonts' advance widths (lib/graphics/metrics.js, built by tools/font-metrics.mjs), so
// the browser editor and the server renderer wrap and fit text identically.
import M from './metrics.js';

export const FAMILIES = { display: 'Barlow Condensed', sans: 'Inter' };
const index = new Map([...M.chars].map((c, i) => [c, i]));

export function fontKey(font = 'display', weight = 800, italic = false) {
  if (font === 'display') {
    if (italic) return 'display-800i';
    const w = weight >= 850 ? 900 : weight >= 750 ? 800 : weight >= 650 ? 700 : 600;
    return `display-${w}`;
  }
  const w = weight >= 750 ? 800 : weight >= 650 ? 700 : weight >= 500 ? 600 : 400;
  return `sans-${w}`;
}

// Width in px of a single line.
export function measure(str, { font = 'display', weight = 800, size = 40, italic = false, spacing = 0 } = {}) {
  const f = M.fonts[fontKey(font, weight, italic)];
  let w = 0, n = 0;
  for (const ch of String(str)) { const i = index.get(ch); w += i != null ? f.w[i] : f.w[index.get('M')] * 0.8; n++; }
  return (w / 1000) * size + spacing * Math.max(0, n - 1);
}
export const metrics = (font, weight, italic) => M.fonts[fontKey(font, weight, italic)];

// Greedy word wrap into lines no wider than width (explicit newlines kept).
export function wrap(str, width, opts) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || measure(next, opts) <= width) cur = next;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
  }
  return lines;
}

// Lay out a text element: the font size that fits its box (shrinking from size down to minSize), and its lines.
export function layoutText(el) {
  const opts = { font: el.font || 'display', weight: el.weight || 800, italic: !!el.italic, spacing: el.spacing || 0 };
  let text = String(el.text ?? '');
  if (el.upper) text = text.toUpperCase();
  const lh = el.lineHeight || (opts.font === 'display' ? 0.92 : 1.2);
  const maxLines = el.maxLines || (el.wrap ? 6 : 1);
  let size = el.size || 40;
  const min = el.minSize || Math.max(8, size * 0.18);
  for (;;) {
    const o = { ...opts, size };
    const lines = el.wrap ? wrap(text, el.w, o) : text.split('\n');
    const widest = Math.max(0, ...lines.map(l => measure(l, o)));
    const height = size * lh * lines.length;
    const fits = (!el.fit && !el.wrap) || ((widest <= el.w + 0.5) && (height <= el.h + 0.5 || !el.h) && lines.length <= maxLines);
    if (fits || size <= min) return { size, lines: lines.slice(0, maxLines), lh, widest, height, ...opts };
    size = Math.max(min, size * 0.95);
  }
}
