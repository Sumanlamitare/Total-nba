// The full-time graphic: Instagram portrait, 1080 × 1350. One layout for every competition, built as a scene for the
// shared renderer (render.js → SVG; resvg → PNG on the server; the browser shows the same SVG as the preview).
//
//   competition logo + name ................................................ FULL TIME
//   ───────────────────────────────────────────────────────────────────────────────────
//        [home crest]                 3 – 1                 [away crest]
//                                 AFTER EXTRA TIME
//        HOME TEAM NAME                                    AWAY TEAM NAME
//   ───────────────────────────────────────────────────────────────────────────────────
//        Scorer 12'                                        Scorer 63'
//        Scorer 45+2' (P)
//   ───────────────────────────────────────────────────────────────────────────────────
//   SAT 15 NOV 2026                                                    @footballpast90
//
// The layout adapts on its own: text boxes shrink their type to fit (team names wrap to two lines, scorer columns
// shrink as they grow), a 0–0 shows "No goals scored", shootouts and extra time get a line under the score.
import { measure } from './text.js';

export const SIZE = { w: 1080, h: 1350 };

const C = { bg: '#0c0d10', panel: '#14161b', line: '#262930', text: '#ffffff', muted: '#9aa0aa', faint: '#5d636e' };

function rgb(hex) { const m = String(hex || '').replace('#', ''); const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m.padEnd(6, '0').slice(0, 6); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) || 0); }
function lum(hex) { const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const mix = (a, b, t) => `#${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
// A team colour that shows on the near-black background (very dark ones are lifted, never changed in hue).
export const teamRule = c => { const h = `#${String(c || '').replace('#', '') || '666666'}`; return lum(h) < 0.05 ? mix(h, '#ffffff', 0.45) : h; };
const onAccent = c => (lum(c) > 0.4 ? '#0c0d10' : '#ffffff');

// "Ousmane Dembélé 3', 19', 45+3' (P)" → { name: 'Ousmane Dembélé', mins: "3', 19', 45+3' (P)" } (the minutes start at the
// first token that begins with a digit; an own-goal tag stays with the minutes).
export function rows(lines) {
  return lines.map(l => {
    const t = String(l).trim().split(/\s+/);
    const i = t.findIndex(w => /^\d/.test(w));
    return i > 0 ? { name: t.slice(0, i).join(' '), mins: t.slice(i).join(' ') } : { name: String(l).trim(), mins: '' };
  });
}

export function buildScene(data, theme = {}) {
  const W = SIZE.w, H = SIZE.h, m = 72;
  const accent = theme.accent || '#d7ff3c';
  const els = [];
  const T = (id, o) => els.push({ id, type: 'text', font: 'display', weight: 800, color: C.text, ...o });

  // Header: competition and FULL TIME.
  const hasLogo = !!data.competition?.logo;
  if (hasLogo) els.push({ id: 'comp-logo', type: 'image', src: data.competition.logo, x: m, y: m, w: 76, h: 76, fit: 'contain' });
  const pillW = 236;
  T('comp-name', { text: data.competition?.name || '', x: hasLogo ? m + 96 : m, y: m, w: W - 2 * m - pillW - (hasLogo ? 96 : 0) - 24, h: 76, size: 46, minSize: 26, upper: true, valign: 'middle', fit: true, spacing: 1 });
  els.push({ id: 'ft-pill', type: 'rect', x: W - m - pillW, y: m + 12, w: pillW, h: 52, radius: 26, fill: accent });
  T('ft-label', { text: data.statusLabel || 'Full time', upper: true, x: W - m - pillW, y: m + 12, w: pillW, h: 52, size: 32, minSize: 18, align: 'center', valign: 'middle', color: onAccent(accent), weight: 900, fit: true, spacing: 2 });
  els.push({ id: 'rule-top', type: 'rect', x: m, y: 184, w: W - 2 * m, h: 2, fill: C.line });

  // Scorer rows first (their height decides where the middle block sits, so short lists don't leave a hole).
  const colW = 440, cx = [m + colW / 2, W - m - colW / 2];
  const lists = { home: rows(data.scorers?.home || []), away: rows(data.scorers?.away || []) };
  const none = !lists.home.length && !lists.away.length;
  const longest = Math.max(lists.home.length, lists.away.length);
  const base = Math.max(26, Math.min(44, Math.floor(470 / Math.max(1, longest) / 1.5)));
  // One type size for every scorer row on the graphic: the size at which the widest row fits, but never smaller than
  // 80% of the base; a row still too wide at that size goes on two lines (name, then minutes).
  const widthAt = (r, size) => measure(r.name, { font: 'sans', weight: 600, size }) + size * 0.4 + measure(r.mins, { font: 'sans', weight: 700, size });
  const all = [...lists.home, ...lists.away];
  let size = Math.max(base * 0.8, Math.min(base, ...all.map(r => base * colW / widthAt(r, base))));
  const layout = side => {
    let y = 0;
    return lists[side].map(r => {
      const w = widthAt(r, size);
      // Fits: full size. Nearly fits: this row a little smaller. Otherwise: name, then minutes underneath.
      const out = w <= colW ? { r, y, size, lines: 1 } : w * 0.85 <= colW ? { r, y, size: size * colW / w, lines: 1 } : { r, y, size, lines: 2 };
      y += out.lines === 1 ? size * 1.5 : size * 2.75;
      return out;
    });
  };
  const heightOf = pl => Math.max(0, ...['home', 'away'].map(sd => { const l = pl[sd].at(-1); return l ? l.y + (l.lines === 1 ? size * 1.5 : size * 2.75) : 0; }));
  // Vertical fit: the scorers must end above the footer, whatever the count.
  const room = (H - m - 64 - 20) - (186 + 40 + 232 + 30 + 120 + 44 + 2 + 44);
  let placed = { home: layout('home'), away: layout('away') };
  while (heightOf(placed) > room && size > 16) { size *= 0.93; placed = { home: layout('home'), away: layout('away') }; }
  const blockH = none ? 120 : heightOf(placed);

  // The middle block: crests, score, names, a rule, the scorers — centred between header and footer.
  const crest = 232, namesH = 120, gap = 44;
  const contentH = crest + 30 + namesH + gap + 2 + gap + blockH;
  const areaTop = 186, areaBottom = H - m - 64;
  const y0 = Math.max(areaTop + 40, Math.round(areaTop + (areaBottom - areaTop - contentH) / 2));
  ['home', 'away'].forEach((side, i) => {
    const t = data[side] || {};
    if (t.logo) els.push({ id: `${side}-logo`, type: 'image', src: t.logo, x: cx[i] - crest / 2, y: y0, w: crest, h: crest, fit: 'contain' });
    else els.push({ id: `${side}-logo-blank`, type: 'circle', x: cx[i] - crest / 2 + 30, y: y0 + 30, w: crest - 60, h: crest - 60, fill: C.panel, stroke: C.line, strokeWidth: 2 });
    if (theme.useTeamColors !== false && t.color) els.push({ id: `${side}-rule`, type: 'rect', x: cx[i] - 50, y: y0 + crest + 16, w: 100, h: 6, radius: 3, fill: teamRule(t.color) });
    T(`${side}-name`, { text: t.name || '', x: cx[i] - colW / 2, y: y0 + crest + 36, w: colW, h: namesH, size: 54, minSize: 28, upper: true, align: 'center', valign: 'top', wrap: true, maxLines: 2, fit: true, lineHeight: 0.98 });
  });
  const midX = cx[0] + crest / 2 + 6, midW = cx[1] - crest / 2 - 6 - midX;
  T('score', { text: `${data.score?.home ?? '–'}–${data.score?.away ?? '–'}`, x: midX, y: y0 + 16, w: midW, h: 198, size: 190, minSize: 80, weight: 900, align: 'center', valign: 'middle', fit: true });
  const note = data.shootout ? `${data.shootout.home}–${data.shootout.away} on penalties` : data.note || '';
  if (note) T('score-note', { text: note, x: midX - 40, y: y0 + 218, w: midW + 80, h: 38, size: 30, minSize: 16, align: 'center', valign: 'middle', color: accent, upper: true, fit: true, spacing: 1 });
  const ruleY = y0 + crest + 30 + namesH + gap;
  els.push({ id: 'rule-mid', type: 'rect', x: m, y: ruleY, w: W - 2 * m, h: 2, fill: C.line });
  const top = ruleY + 2 + gap;
  if (none) {
    T('no-goals', { text: data.noGoalsText || 'No goals scored', x: m, y: top, w: W - 2 * m, h: 120, size: 60, minSize: 30, upper: true, align: 'center', valign: 'middle', color: C.muted, fit: true, spacing: 2 });
  } else {
    ['home', 'away'].forEach((side, i) => {
      if (!placed[side].length) T(`${side}-none`, { text: '–', x: cx[i] - colW / 2, y: top, w: colW, h: base * 1.5, size: base, font: 'sans', weight: 600, align: 'center', valign: 'middle', color: C.faint });
      placed[side].forEach(({ r, y, size, lines }, k) => {
        const lh = size * 1.5;
        if (lines === 1) {
          const nW = measure(r.name, { font: 'sans', weight: 600, size }), mW = measure(r.mins, { font: 'sans', weight: 700, size }), g = size * 0.4;
          const x = cx[i] - (nW + g + mW) / 2;
          T(`${side}-scorer-${k}`, { text: r.name, x, y: top + y, w: nW + 2, h: lh, size, font: 'sans', weight: 600, valign: 'middle' });
          T(`${side}-mins-${k}`, { text: r.mins, x: x + nW + g, y: top + y, w: mW + 2, h: lh, size, font: 'sans', weight: 700, valign: 'middle', color: accent });
        } else {
          T(`${side}-scorer-${k}`, { text: r.name, x: cx[i] - colW / 2, y: top + y, w: colW, h: size * 1.3, size, minSize: 14, font: 'sans', weight: 600, align: 'center', valign: 'bottom', fit: true });
          T(`${side}-mins-${k}`, { text: r.mins, x: cx[i] - colW / 2, y: top + y + size * 1.3, w: colW, h: size * 1.3, size, minSize: 14, font: 'sans', weight: 700, align: 'center', valign: 'top', color: accent, fit: true });
        }
      });
    });
  }

  // Footer.
  els.push({ id: 'rule-bottom', type: 'rect', x: m, y: H - m - 64, w: W - 2 * m, h: 2, fill: C.line });
  if (theme.showDate !== false && data.date) T('date', { text: data.date, x: m, y: H - m - 46, w: 440, h: 46, size: 30, minSize: 18, font: 'sans', weight: 600, color: C.muted, valign: 'middle', upper: true, fit: true });
  if (theme.handle) T('handle', { text: theme.handle, x: W - m - 440, y: H - m - 46, w: 440, h: 46, size: 36, minSize: 20, align: 'right', valign: 'middle', color: accent, fit: true });

  return { w: W, h: H, bg: C.bg, elements: els };
}
