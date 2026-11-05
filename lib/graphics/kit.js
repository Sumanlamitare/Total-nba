// Building blocks for the graphic templates: formats, layout frames that adapt to any aspect ratio, colors, and the
// pieces every template shares (background, brand, player cut-out, name, stat row, score strip, source line).

export const FORMATS = {
  x_landscape: { w: 1600, h: 900, label: 'X / Twitter landscape' },
  x_square: { w: 1080, h: 1080, label: 'X / Twitter square' },
  ig_square: { w: 1080, h: 1080, label: 'Instagram square' },
  ig_portrait: { w: 1080, h: 1350, label: 'Instagram portrait' },
  ig_story: { w: 1080, h: 1920, label: 'Instagram Story' },
  yt_thumb: { w: 1280, h: 720, label: 'YouTube thumbnail' },
};
export const sizeOf = (format, custom) => (format === 'custom' && custom ? { w: clampDim(custom.w), h: clampDim(custom.h) } : FORMATS[format] || FORMATS.x_landscape);
const clampDim = v => Math.min(4096, Math.max(320, Math.round(+v || 1080)));

// Colors.
export function rgb(hex) {
  const m = String(hex || '#000').replace('#', '');
  const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) || 0);
}
export const hex = ([r, g, b]) => `#${[r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export function luminance(c) {
  const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onColor = c => (luminance(c) > 0.42 ? '#0b0b0d' : '#ffffff');
// A team color that reads on near-black: very dark colors are lifted.
export const vivid = c => (luminance(c || '#333') < 0.04 ? mix(c || '#333', '#ffffff', 0.35) : c || '#666');

// Frames: where things go for a given size. land (≥1.3:1), square, port (≈4:5), story (9:16).
export function frame(W, H) {
  const r = W / H;
  const kind = r >= 1.3 ? 'land' : r >= 0.92 ? 'square' : r >= 0.7 ? 'port' : 'story';
  const m = Math.round(Math.min(W, H) * 0.06);
  const u = Math.min(W, H) / 1080; // type scale
  const f = { kind, W, H, m, u, r };
  if (kind === 'land') Object.assign(f, { text: { x: m, y: H * 0.17, w: W * 0.54, h: H * 0.66 }, img: { x: W * 0.44, y: H * 0.04, w: W * 0.56, h: H * 0.96 }, foot: { x: m, y: H - m - 56 * u, w: W - 2 * m, h: 56 * u } });
  if (kind === 'square') Object.assign(f, { text: { x: m, y: H * 0.5, w: W - 2 * m, h: H * 0.36 }, img: { x: W * 0.22, y: H * 0.07, w: W * 0.78, h: H * 0.62 }, foot: { x: m, y: H - m - 50 * u, w: W - 2 * m, h: 50 * u } });
  if (kind === 'port') Object.assign(f, { text: { x: m, y: H * 0.53, w: W - 2 * m, h: H * 0.34 }, img: { x: 0, y: H * 0.07, w: W, h: H * 0.56 }, foot: { x: m, y: H - m - 54 * u, w: W - 2 * m, h: 54 * u } });
  if (kind === 'story') Object.assign(f, { text: { x: m, y: H * 0.5, w: W - 2 * m, h: H * 0.34 }, img: { x: 0, y: H * 0.12, w: W, h: H * 0.44 }, foot: { x: m, y: H - m * 2.2 - 54 * u, w: W - 2 * m, h: 54 * u } });
  return f;
}

export const THEME = { accent: '#ff5a1f', bg: '#0a0a0b', fg: '#ffffff', muted: '#a1a1aa', font: 'display', pattern: 'halftone', useTeam: true, grain: true };

const T = (id, props) => ({ id, type: 'text', font: 'display', weight: 800, color: '#fff', fit: true, ...props });

// Background: near-black, a wash of the team's color, a pattern, a grain. Ids: bg-*.
export function background(f, theme, team, { tone = 'team', side = 'right' } = {}) {
  const { W, H } = f;
  const c = theme.useTeam && team?.color ? vivid(team.color) : theme.accent;
  const c2 = theme.useTeam && team?.alt ? vivid(team.alt) : mix(theme.accent, '#000', 0.4);
  const els = [];
  if (tone === 'mono') {
    els.push({ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: W, h: H, gradient: { angle: 160, stops: [[0, '#1a1a1d'], [1, theme.bg]] } });
  } else {
    const ang = side === 'right' ? 105 : side === 'top' ? 180 : 75;
    els.push({ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: W, h: H, gradient: { angle: ang, stops: [[0, theme.bg], [0.42, mix(theme.bg, c, 0.18)], [1, mix(theme.bg, c, 0.62)]] } });
    els.push({ id: 'bg-glow', type: 'circle', x: f.img.x + f.img.w * 0.1, y: f.img.y, w: f.img.w * 0.85, h: f.img.w * 0.85, gradient: { type: 'radial', stops: [[0, c2, 0.35], [1, c2, 0]] } });
  }
  if (theme.pattern && theme.pattern !== 'none') els.push({ id: 'bg-pattern', type: 'rect', x: side === 'right' ? W * 0.45 : 0, y: 0, w: side === 'right' ? W * 0.55 : W, h: H, fill: 'none', pattern: theme.pattern, patternColor: '#ffffff', patternOpacity: 0.07, patternSize: Math.round(14 * f.u) });
  return els;
}
export const grain = (f, theme) => (theme.grain ? [{ id: 'fx-grain', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, fill: 'none', pattern: 'grain', patternOpacity: 0.06 }] : []);

// The brand mark: an orange disc with the court arcs, and the wordmark. Ids: brand-*.
export function brand(f, theme, data, { x = f.m, y = f.m * 0.85, light = true } = {}) {
  const s = 46 * f.u;
  const name = (data.brand?.name || 'Around the NBA').toUpperCase();
  return [
    { id: 'brand-mark', type: 'circle', x, y, w: s, h: s, fill: theme.accent },
    { id: 'brand-arc', type: 'circle', x: x + s * 0.22, y: y + s * 0.22, w: s * 0.56, h: s * 0.56, fill: 'none', stroke: '#0a0a0b', strokeWidth: 3.2 * f.u },
    { id: 'brand-line', type: 'line', x: x + s / 2, y, w: 0, h: s, color: '#0a0a0b', width: 3.2 * f.u },
    T('brand-name', { x: x + s + 14 * f.u, y: y + s * 0.08, w: 420 * f.u, h: s * 0.84, text: name, size: 30 * f.u, weight: 800, spacing: 2.5 * f.u, color: light ? '#fff' : '#0a0a0b', valign: 'middle', fit: true }),
  ];
}

// A pill label (kicker). Ids: <id>-bg, <id>.
export function pill(id, f, { x, y, text, bg, color, size = 26, h = 46, live = false }) {
  const u = f.u;
  const pad = 18 * u;
  const tw = Math.max(80 * u, approx(text, size * u) + pad * 2 + (live ? 22 * u : 0));
  const els = [{ id: `${id}-bg`, type: 'rect', x, y, w: tw, h: h * u, radius: (h * u) / 2, fill: bg }];
  if (live) els.push({ id: `${id}-dot`, type: 'circle', x: x + pad * 0.8, y: y + (h * u) / 2 - 6 * u, w: 12 * u, h: 12 * u, fill: '#ef4444' });
  els.push(T(id, { x: x + pad + (live ? 18 * u : 0), y, w: tw - pad * 2 - (live ? 18 * u : 0), h: h * u, text, size: size * u, weight: 800, spacing: 1.8 * u, color, valign: 'middle', upper: true }));
  return els;
}
// Rough width before layout (for pills).
const approx = (t, size) => String(t).length * size * 0.5;

// The player cut-out (ESPN headshots are transparent PNGs). Id: player.
export function playerImage(f, data, { box = f.img, fade = 'bottom', filter = 'none', id = 'player' } = {}) {
  if (!data.player?.headshot) return [];
  return [{ id, type: 'image', src: data.player.headshot, x: box.x, y: box.y, w: box.w, h: box.h, fit: 'contain', anchor: 'bottom', fade, fadeStart: 0.78, filter, shadow: { x: 0, y: 12 * f.u, blur: 40 * f.u, color: '#000', opacity: 0.55 } }];
}

// Huge outlined surname behind the player.
export function ghostName(f, data, theme, team) {
  const last = (data.player?.last || data.player?.name || '').toUpperCase();
  if (!last) return [];
  const c = theme.useTeam && team?.alt ? vivid(team.alt) : theme.accent;
  const box = f.kind === 'land' ? { x: f.W * 0.36, y: f.H * 0.12, w: f.W * 0.66, h: f.H * 0.5 } : { x: -f.W * 0.04, y: f.img.y + f.img.h * 0.05, w: f.W * 1.08, h: f.img.h * 0.5 };
  return [T('ghost', { ...box, text: last, size: 420 * f.u, weight: 900, color: 'none', stroke: c, strokeWidth: 2.5 * f.u, opacity: 0.22, align: 'center', valign: 'middle' })];
}

// First name (lighter) over last name (heavy). Ids: name-first, name-last.
export function nameBlock(f, data, theme, { x, y, w, size = 150, align = 'left', color = '#fff' }) {
  const u = f.u;
  const first = data.player?.first || '', last = data.player?.last || data.player?.name || '';
  return [
    T('name-first', { x, y, w, h: size * 0.42 * u, text: first, size: size * 0.4 * u, weight: 600, spacing: 3 * u, upper: true, color: mix(color, '#000', 0.12), align, bind: 'player.first', font: theme.font }),
    T('name-last', { x, y: y + size * 0.42 * u, w, h: size * 0.95 * u, text: last, size: size * u, weight: 900, upper: true, color, align, bind: 'player.last', font: theme.font }),
  ];
}

// A row of statistics: big numbers over small labels, thin dividers. Ids: stat-<i>-value / -label / -div.
export function statRow(f, theme, stats, { x, y, w, h = 150, align = 'left', valueColor = '#fff', labelColor, max = 5, highlight = [] }) {
  const u = f.u;
  const list = stats.slice(0, max);
  if (!list.length) return [];
  const gap = 18 * u;
  const cw = (w - gap * (list.length - 1)) / list.length;
  const els = [];
  list.forEach((s, i) => {
    const cx = x + i * (cw + gap);
    const hl = highlight.includes(s.key);
    els.push(T(`stat-${i}-value`, { x: cx, y, w: cw, h: h * 0.72 * u, text: String(s.value), size: h * 0.74 * u, weight: 900, color: hl ? theme.accent : valueColor, align, valign: 'bottom', bind: `stats.${i}.value` }));
    els.push(T(`stat-${i}-label`, { x: cx, y: y + h * 0.74 * u, w: cw, h: h * 0.2 * u, text: s.label, size: 24 * u, font: 'sans', weight: 700, spacing: 2 * u, upper: true, color: labelColor || theme.muted, align, bind: `stats.${i}.label` }));
    if (i < list.length - 1) els.push({ id: `stat-${i}-div`, type: 'line', x: cx + cw + gap / 2, y: y + h * 0.12 * u, w: 0, h: h * 0.78 * u, color: 'rgba(255,255,255,0.18)', width: 2 * u });
  });
  return els;
}

// The score strip: away logo, score, home logo, status. Ids: score-*.
export function scoreStrip(f, theme, data, { x = f.foot.x, y = f.foot.y, h = f.foot.h } = {}) {
  const g = data.game; if (!g?.teams?.length) return [];
  const u = f.u, lg = h;
  const els = [];
  let cx = x;
  g.teams.forEach((t, i) => {
    els.push({ id: `score-logo-${i}`, type: 'image', src: t.logo, x: cx, y, w: lg, h: lg, fit: 'contain' });
    cx += lg + 10 * u;
    els.push(T(`score-${i}`, { x: cx, y, w: 150 * u, h: lg, text: `${t.abbr} ${t.score ?? ''}`.trim(), size: lg * 0.72, weight: t.winner ? 900 : 700, color: t.winner || g.status !== 'FINAL' ? '#fff' : theme.muted, valign: 'middle' }));
    cx += Math.min(150 * u, (`${t.abbr} ${t.score ?? ''}`.length * lg * 0.4)) + 22 * u;
  });
  els.push(...pill('score-status', f, { x: cx, y: y + (lg - 40 * u) / 2, text: g.status || 'FINAL', bg: 'rgba(255,255,255,0.1)', color: '#fff', size: 22, h: 40, live: !!g.live }));
  return els;
}

export function sourceLine(f, theme, data, { x, y, w, align = 'right' } = {}) {
  const u = f.u;
  const text = [data.source || 'Data: ESPN', data.dateLabel].filter(Boolean).join(' · ');
  return [T('source', { x: x ?? f.W - f.m - 700 * u, y: y ?? f.H - f.m * 0.75 - 16 * u, w: w ?? 700 * u, h: 26 * u, text, size: 18 * u, font: 'sans', weight: 600, color: 'rgba(255,255,255,0.5)', align, valign: 'middle' })];
}

export const handle = (f, theme, data) => (data.brand?.handle ? [T('handle', { x: f.W - f.m - 400 * f.u, y: f.m * 0.85, w: 400 * f.u, h: 46 * f.u, text: data.brand.handle, size: 24 * f.u, font: 'sans', weight: 700, color: 'rgba(255,255,255,0.7)', align: 'right', valign: 'middle' })] : []);
export { T };
