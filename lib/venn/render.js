// Drawing: the diagram as SVG markup, one renderer for the app, the downloads and the link previews (so they always
// match). renderVenn / renderUpset draw the diagram itself; composeGraphic frames it as a standalone graphic (title,
// date, criteria, branding, attribution) at any size. Images: pass `img(id)` returning a URL or a data: URI.
import { textWidth } from './layout.js';
import { bits, degree } from '../engine.js';

export const PALETTE = ['#22d3ee', '#fb923c', '#f472b6', '#a3e635', '#a78bfa', '#facc15', '#60a5fa', '#f87171', '#34d399', '#e879f9'];
export const FONTS = {
  sans: "Inter, 'Helvetica Neue', Arial, ui-sans-serif, system-ui, sans-serif",
  condensed: "'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};
export const DEFAULT_STYLE = {
  view: 'auto', bg: '#07080b', text: '#f4f6f8', muted: '#8b93a1', colors: PALETTE.slice(), fillOpacity: 0.12, strokeWidth: 3,
  headshot: 1, names: true, counts: true, font: 'sans', adjust: [],
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => Math.round(v * 10) / 10;
export const colorOf = (style, i) => style.colors?.[i] || PALETTE[i % PALETTE.length];
const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

// One player: headshot in a circle ringed in his team's color, his name underneath.
function node(p, x, y, r, style, font, nameH, img, w) {
  const id = `h${String(p.id).replace(/\W/g, '')}`;
  const ring = p.team?.color || '#3a4150';
  const label = p.label || p.short || p.name;
  const f = Math.min(font, (w - 2) / (0.56 * Math.max(1, label.length)));
  const src = img ? img(p) : p.headshot;
  return `<g class="pl" data-pid="${esc(p.id)}" transform="translate(${n1(x)} ${n1(y)})" style="cursor:pointer">`
    + `<clipPath id="${id}"><circle r="${n1(r)}"/></clipPath>`
    + `<circle r="${n1(r + r * 0.12)}" fill="${esc(ring)}"/>`
    + `<circle r="${n1(r)}" fill="#1a1e26"/>`
    + `<text text-anchor="middle" dy="0.35em" font-size="${n1(r * 0.62)}" font-weight="700" fill="#8b93a1">${esc(initials(p.name))}</text>`
    + (src ? `<image href="${esc(src)}" x="${n1(-r * 1.38)}" y="${n1(-r * 0.92)}" width="${n1(r * 2.76)}" height="${n1(r * 2.02)}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>` : '')
    + (nameH ? `<text class="nm" text-anchor="middle" y="${n1(r + r * 0.12 + f * 1.05)}" font-size="${n1(f)}" font-weight="600" fill="${style.text}">${esc(label)}</text>` : '')
    + `</g>`;
}

// The Venn diagram: layout (from layoutVenn), criteria [{ label }], players by id.
export function renderVenn(L, criteria, byId, style = DEFAULT_STYLE, { img } = {}) {
  const font = FONTS[style.font] || FONTS.sans;
  const parts = [`<g font-family="${esc(font)}">`];
  L.shapes.forEach((e, i) => {
    const c = colorOf(style, i);
    parts.push(`<ellipse cx="${n1(e.cx)}" cy="${n1(e.cy)}" rx="${n1(e.rx)}" ry="${n1(e.ry)}" transform="rotate(${n1((e.rot * 180) / Math.PI)} ${n1(e.cx)} ${n1(e.cy)})" fill="${c}" fill-opacity="${style.fillOpacity}" stroke="${c}" stroke-width="${style.strokeWidth * (L.size / 1000)}" stroke-opacity="0.95"/>`);
  });
  for (const nd of L.nodes) { const p = byId.get(String(nd.id)); if (p) parts.push(node(p, nd.x, nd.y, nd.r, style, L.font, L.nameH, img, nd.w)); }
  if (style.counts) for (const b of L.badges) {
    const t = String(b.count), f = Math.max(11, L.font * 0.95), w = Math.max(f * 1.7, textWidth(t, f) + f);
    parts.push(`<g class="badge" transform="translate(${n1(b.x)} ${n1(b.y)})"><rect x="${n1(-w / 2)}" y="${n1(-f * 0.85)}" width="${n1(w)}" height="${n1(f * 1.7)}" rx="${n1(f * 0.85)}" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.25"/><text text-anchor="middle" dy="0.35em" font-size="${n1(f)}" font-weight="700" fill="${style.text}">${t}</text></g>`);
  }
  const lf = Math.max(14, L.size * 0.024);
  for (const lb of L.labels) {
    const c = colorOf(style, lb.i), text = criteria[lb.i]?.label || '';
    const w = textWidth(text, lf) + lf * 1.6, h = lf * 1.9;
    let x = lb.x - (lb.dx < -0.3 ? w / 2 : lb.dx > 0.3 ? -w / 2 : 0), y = lb.y + (lb.dy > 0.3 ? h / 2 : lb.dy < -0.3 ? -h / 2 : 0);
    x = Math.min(L.width - w / 2 - 4, Math.max(w / 2 + 4, x)); y = Math.min(L.height - h / 2 - 4, Math.max(h / 2 + 4, y));
    parts.push(`<g class="crit" transform="translate(${n1(x)} ${n1(y)})"><rect x="${n1(-w / 2)}" y="${n1(-h / 2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h / 2)}" fill="${style.bg}" stroke="${c}" stroke-width="${n1(lf * 0.14)}"/><text text-anchor="middle" dy="0.36em" font-size="${n1(lf)}" font-weight="800" fill="${c}">${esc(text)}</text></g>`);
  }
  parts.push('</g>');
  return { width: L.width, height: L.height, body: parts.join('') };
}

// The intersection view (UpSet-style, any number of criteria): one row per non-empty combination, most criteria first;
// dots show which criteria, then the count and the players.
export function renderUpset(result, criteria, style = DEFAULT_STYLE, { width = 1000, img } = {}) {
  const font = FONTS[style.font] || FONTS.sans;
  const n = criteria.length, dotW = 30, left = 24 + n * dotW + 16, countW = 64;
  const R = Math.round(26 * (style.headshot || 1)), f = Math.max(10, R * 0.46), cellW = Math.max(2 * R + 14, 76 * (style.headshot || 1)), cellH = 2 * R + (style.names ? f * 1.4 + 10 : 12);
  const perRow = Math.max(1, Math.floor((width - left - countW - 16) / cellW));
  const rows = result.regions.filter(r => r.players.length).sort((a, b) => degree(b.mask) - degree(a.mask) || b.players.length - a.players.length);
  const lf = 16, legendH = Math.ceil(n / 2) * (lf * 2.1) + 18;
  const parts = [`<g font-family="${esc(font)}">`];
  // Legend: number, color, criterion.
  criteria.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 24 + col * (width / 2), y = 14 + row * (lf * 2.1) + lf;
    parts.push(`<circle cx="${x + 11}" cy="${y}" r="11" fill="${colorOf(style, i)}"/><text x="${x + 11}" y="${y}" dy="0.36em" text-anchor="middle" font-size="12" font-weight="800" fill="#07080b">${i + 1}</text><text x="${x + 30}" y="${y}" dy="0.36em" font-size="${lf}" font-weight="700" fill="${style.text}">${esc(c.label)} <tspan fill="${style.muted}" font-weight="500">· ${result.setSizes[i]}</tspan></text>`);
  });
  let y = legendH + 8;
  // Column numbers over the dot matrix.
  for (let i = 0; i < n; i++) parts.push(`<text x="${24 + i * dotW + dotW / 2}" y="${y}" text-anchor="middle" font-size="12" font-weight="700" fill="${style.muted}">${i + 1}</text>`);
  y += 12;
  if (!rows.length) parts.push(`<text x="${width / 2}" y="${y + 40}" text-anchor="middle" font-size="18" fill="${style.muted}">No player meets any of these criteria</text>`);
  const maxCount = Math.max(1, ...rows.map(r => r.players.length));
  for (const reg of rows) {
    const lines = Math.ceil(reg.players.length / perRow), h = lines * cellH + 14, mid = y + Math.min(h, cellH + 14) / 2;
    parts.push(`<line x1="16" x2="${width - 16}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity="0.08"/>`);
    const on = bits(reg.mask);
    if (on.length > 1) parts.push(`<line x1="${24 + on[0] * dotW + dotW / 2}" x2="${24 + on[on.length - 1] * dotW + dotW / 2}" y1="${mid}" y2="${mid}" stroke="${style.text}" stroke-opacity="0.5" stroke-width="3"/>`);
    for (let i = 0; i < n; i++) {
      const isOn = (reg.mask >> i) & 1;
      parts.push(`<circle cx="${24 + i * dotW + dotW / 2}" cy="${mid}" r="9" fill="${isOn ? colorOf(style, i) : '#ffffff'}" fill-opacity="${isOn ? 1 : 0.08}"/>`);
    }
    const bw = (countW - 8) * (reg.players.length / maxCount);
    parts.push(`<rect x="${left}" y="${mid + 12}" width="${n1(Math.max(3, bw))}" height="4" rx="2" fill="${style.text}" fill-opacity="0.35"/><text x="${left}" y="${mid}" dy="0.35em" font-size="20" font-weight="800" fill="${style.text}">${reg.players.length}</text>`);
    reg.players.forEach((p, k) => {
      const cx = left + countW + (k % perRow) * cellW + cellW / 2, cy = y + 10 + Math.floor(k / perRow) * cellH + R + 4;
      parts.push(node(p, cx, cy, R, style, f, style.names ? f : 0, img, cellW - 6));
    });
    y += h;
  }
  parts.push('</g>');
  return { width, height: Math.max(y + 16, 240), body: parts.join('') };
}

// The standalone graphic: the diagram centered under a title, with the criteria (for the intersection view), the
// date and period, an optional logo and a small attribution. width × height in px (1080², 1080×1350, 1920×1080...).
export function composeGraphic(diagram, { width = 1080, height = 1080, title = '', subtitle = '', criteria = [], style = DEFAULT_STYLE, brand = true, attribution = 'Data: ESPN', showLegend = false, transparent = false } = {}) {
  const font = FONTS[style.font] || FONTS.sans;
  const u = Math.min(width, height) / 1080;
  const pad = 48 * u, titleF = 50 * u, subF = 24 * u, footF = 17 * u;
  const head = (title ? titleF * 1.25 : 0) + (subtitle ? subF * 1.6 : 0) + (title || subtitle ? pad * 0.5 : 0);
  const legendRows = showLegend ? Math.ceil(criteria.length / (width > height ? 3 : 2)) : 0, legendH = legendRows * 34 * u;
  const foot = footF * 2.6;
  const box = { x: pad, y: pad + head + legendH, w: width - 2 * pad, h: height - 2 * pad - head - legendH - foot };
  const s = Math.min(box.w / diagram.width, box.h / diagram.height);
  const dx = box.x + (box.w - diagram.width * s) / 2, dy = box.y + (box.h - diagram.height * s) / 2;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(font)}">`];
  if (!transparent) out.push(`<rect width="${width}" height="${height}" fill="${style.bg}"/>`);
  if (title) out.push(`<text x="${pad}" y="${pad + titleF}" font-size="${n1(titleF)}" font-weight="800" letter-spacing="-0.5" fill="${style.text}">${esc(title)}</text>`);
  if (subtitle) out.push(`<text x="${pad}" y="${pad + (title ? titleF * 1.25 : 0) + subF * 1.15}" font-size="${n1(subF)}" font-weight="500" fill="${style.muted}">${esc(subtitle)}</text>`);
  if (brand) out.push(logo(width - pad - 150 * u, pad + 4 * u, u, style));
  if (showLegend) criteria.forEach((c, i) => {
    const per = width > height ? 3 : 2, cw = (width - 2 * pad) / per, x = pad + (i % per) * cw, y = pad + head + Math.floor(i / per) * 34 * u + 14 * u;
    out.push(`<circle cx="${x + 9 * u}" cy="${y}" r="${9 * u}" fill="${colorOf(style, i)}"/><text x="${x + 26 * u}" y="${y}" dy="0.36em" font-size="${n1(20 * u)}" font-weight="700" fill="${style.text}">${esc(c.label)}</text>`);
  });
  out.push(`<g transform="translate(${n1(dx)} ${n1(dy)}) scale(${s.toFixed(5)})">${diagram.body}</g>`);
  out.push(`<text x="${pad}" y="${height - pad * 0.6}" font-size="${n1(footF)}" fill="${style.muted}">${esc(attribution)}</text>`);
  out.push('</svg>');
  return out.join('');
}

// The app's mark: three overlapping circles in the diagram colors, and its name.
export function logo(x, y, u, style = DEFAULT_STYLE) {
  const r = 13 * u;
  return `<g transform="translate(${n1(x)} ${n1(y)})"><circle cx="${r}" cy="${r * 1.2}" r="${r}" fill="none" stroke="${colorOf(style, 0)}" stroke-width="${2.5 * u}"/><circle cx="${r * 1.9}" cy="${r * 1.2}" r="${r}" fill="none" stroke="${colorOf(style, 1)}" stroke-width="${2.5 * u}"/><circle cx="${r * 1.45}" cy="${r * 1.95}" r="${r}" fill="none" stroke="${colorOf(style, 2)}" stroke-width="${2.5 * u}"/><text x="${r * 3.3}" y="${r * 1.85}" font-size="${n1(24 * u)}" font-weight="800" letter-spacing="-0.3" fill="${style.text}">Overlap</text></g>`;
}

// The diagram for the current style: Venn for up to 5 criteria (unless crowded), the intersection view otherwise.
export function chooseView(style, n, total) {
  if (style.view === 'venn' && n <= 5) return 'venn';
  if (style.view === 'upset') return 'upset';
  if (n > 5) return 'upset';
  if (n === 5 && total > 30) return 'upset';
  return 'venn';
}
