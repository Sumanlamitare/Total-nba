// The graphic templates. Each builds a scene from structured data (lib/graphics/data.js) for any size; nothing is
// typed into a template. Every element has a stable id, so an editor's changes (overrides) survive data updates and
// format changes.
import { measure } from './text.js';
import { frame, THEME, background, grain, brand, pill, playerImage, ghostName, nameBlock, statRow, scoreStrip, sourceLine, handle, T, mix, vivid, onColor } from './kit.js';

const fmtDate = ymd => { if (!ymd) return ''; const d = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase(); };

// The standard player layout, shared by the performance family. opts: kicker, live, tone, highlight, note, badge.
function playerLayout(data, f, theme, o = {}) {
  const u = f.u, team = data.team;
  const els = [...background(f, theme, team, { tone: o.tone, side: f.kind === 'land' ? 'right' : 'top' })];
  els.push(...ghostName(f, data, theme, team));
  els.push(...playerImage(f, data, { filter: o.filter || 'none' }));
  if (f.kind !== 'land') els.push({ id: 'scrim', type: 'rect', x: 0, y: f.img.y + f.img.h * 0.55, w: f.W, h: f.H - (f.img.y + f.img.h * 0.55), gradient: { angle: 180, stops: [[0, theme.bg, 0], [0.45, theme.bg, 0.92], [1, theme.bg, 1]] } });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  const tx = f.text.x, tw = f.text.w;
  let y = f.kind === 'land' ? f.H * 0.2 : f.text.y - 20 * u;
  const kick = o.kicker ?? data.kicker;
  if (kick) { els.push(...pill('kicker', f, { x: tx, y, text: kick, bg: o.kickerBg || theme.accent, color: onColor(o.kickerBg || theme.accent), live: o.live })); y += 66 * u; }
  if (o.badge) { els.push(...pill('badge', f, { x: tx + (kick ? Math.min(tw * 0.55, (kick.length * 13 + 80) * u) : 0), y: y - 66 * u, text: o.badge, bg: 'rgba(255,255,255,0.12)', color: '#fff' })); }
  const nameSize = f.kind === 'land' ? 158 : f.kind === 'story' ? 150 : 140;
  els.push(...nameBlock(f, data, theme, { x: tx, y, w: tw, size: nameSize }));
  y += nameSize * 1.42 * u;
  if (data.headline) { els.push(T('headline', { x: tx, y, w: tw, h: 48 * u, text: data.headline, size: 44 * u, weight: 800, color: theme.accent, upper: true, spacing: 1.5 * u, bind: 'headline' })); y += 62 * u; }
  const statsH = f.kind === 'land' ? 170 : 160;
  els.push(...statRow(f, theme, data.stats || [], { x: tx, y: y + 6 * u, w: f.kind === 'land' ? tw : f.W - 2 * f.m, h: statsH, highlight: o.highlight || [], max: f.kind === 'land' ? 4 : 5 }));
  y += statsH * u + 20 * u;
  const sub = o.note ?? data.note;
  if (sub) els.push(T('note', { x: tx, y, w: f.kind === 'land' ? tw : f.W - 2 * f.m, h: (f.kind === 'story' ? 120 : 76) * u, text: sub, size: 28 * u, font: 'sans', weight: 600, color: 'rgba(255,255,255,0.86)', wrap: true, maxLines: f.kind === 'story' ? 3 : 2, lineHeight: 1.25, bind: 'note' }));
  els.push(...scoreStrip(f, theme, data));
  els.push(...sourceLine(f, theme, data, { y: f.kind === 'land' ? undefined : f.foot.y - 40 * u }));
  els.push(...grain(f, theme));
  return els;
}

// Record family: hero number, the record, the previous holder.
function recordLayout(data, f, theme, o = {}) {
  const u = f.u, team = data.team, r = data.record || {};
  const els = [...background(f, theme, team, { side: f.kind === 'land' ? 'right' : 'top' })];
  els.push(...playerImage(f, data, { box: f.kind === 'land' ? { x: f.W * 0.5, y: f.H * 0.06, w: f.W * 0.5, h: f.H * 0.94 } : f.img }));
  if (f.kind !== 'land') els.push({ id: 'scrim', type: 'rect', x: 0, y: f.img.y + f.img.h * 0.5, w: f.W, h: f.H - (f.img.y + f.img.h * 0.5), gradient: { angle: 180, stops: [[0, theme.bg, 0], [0.4, theme.bg, 0.94], [1, theme.bg, 1]] } });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  const tx = f.text.x, tw = f.kind === 'land' ? f.W * 0.5 : f.W - 2 * f.m;
  let y = f.kind === 'land' ? f.H * 0.17 : f.text.y - 60 * u;
  els.push(...pill('kicker', f, { x: tx, y, text: o.kicker || data.kicker || 'RECORD', bg: o.kickerBg || theme.accent, color: onColor(o.kickerBg || theme.accent), live: o.live }));
  y += 70 * u;
  const heroH = f.kind === 'land' ? 250 : 220;
  const heroText = String(data.hero?.value ?? r.value ?? '');
  const heroW = Math.min(tw * 0.68, measure(heroText, { size: heroH * 1.05 * u, weight: 900 }));
  els.push(T('hero', { x: tx, y, w: tw * 0.68, h: heroH * u, text: heroText, size: heroH * 1.05 * u, weight: 900, color: '#fff', valign: 'bottom', bind: 'hero.value' }));
  els.push(T('hero-label', { x: tx + heroW + 22 * u, y: y + heroH * 0.35 * u, w: Math.max(tw * 0.3, tw - heroW - 22 * u), h: heroH * 0.6 * u, text: data.hero?.label || '', size: 54 * u, weight: 800, color: theme.accent, upper: true, wrap: true, maxLines: 2, valign: 'bottom', bind: 'hero.label' }));
  y += heroH * u + 14 * u;
  els.push(T('name', { x: tx, y, w: tw, h: 64 * u, text: data.player?.name || r.holderName || '', size: 64 * u, weight: 900, upper: true, bind: 'player.name' }));
  y += 76 * u;
  els.push(T('record-title', { x: tx, y, w: tw, h: 84 * u, text: r.title || '', size: 36 * u, font: 'sans', weight: 800, color: '#fff', wrap: true, maxLines: 2, lineHeight: 1.15, bind: 'record.title' }));
  y += 90 * u;
  if (r.scope) { els.push(T('record-scope', { x: tx, y, w: tw, h: 30 * u, text: r.scope, size: 22 * u, font: 'sans', weight: 600, color: theme.muted, bind: 'record.scope' })); y += 44 * u; }
  if (o.progress) {
    const pw = tw * 0.95, ph = 18 * u, pct = Math.max(0, Math.min(1, (r.value || 0) / (r.target || 1)));
    els.push({ id: 'progress-track', type: 'rect', x: tx, y, w: pw, h: ph, radius: ph / 2, fill: 'rgba(255,255,255,0.12)' });
    els.push({ id: 'progress-bar', type: 'rect', x: tx, y, w: Math.max(ph, pw * pct), h: ph, radius: ph / 2, fill: theme.accent });
    y += ph + 16 * u;
    els.push(T('progress-label', { x: tx, y, w: pw, h: 30 * u, text: o.progress, size: 24 * u, font: 'sans', weight: 700, color: '#fff', bind: 'record.progress' }));
    y += 46 * u;
  }
  if (r.previousText) {
    els.push({ id: 'prev-rule', type: 'line', x: tx, y, w: tw * 0.95, h: 0, color: 'rgba(255,255,255,0.18)', width: 2 * u });
    y += 16 * u;
    els.push(T('prev-label', { x: tx, y, w: tw, h: 26 * u, text: o.prevLabel || 'PREVIOUS RECORD', size: 20 * u, font: 'sans', weight: 800, spacing: 2 * u, color: theme.muted }));
    els.push(T('prev', { x: tx, y: y + 30 * u, w: tw, h: 72 * u, text: r.previousText, size: 28 * u, font: 'sans', weight: 600, color: '#fff', wrap: true, maxLines: 2, lineHeight: 1.2, bind: 'record.previousText' }));
  }
  els.push(...scoreStrip(f, theme, data));
  els.push(...sourceLine(f, theme, data, { y: f.kind === 'land' ? undefined : f.foot.y - 40 * u }));
  els.push(...grain(f, theme));
  return els;
}

function gameResult(data, f, theme) {
  const u = f.u, g = data.game || { teams: [] };
  const [a, h] = g.teams;
  const els = [{ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, gradient: { angle: 90, stops: [[0, mix(theme.bg, vivid(a?.color), 0.5)], [0.5, theme.bg], [1, mix(theme.bg, vivid(h?.color), 0.5)]] } }];
  if (theme.pattern !== 'none') els.push({ id: 'bg-pattern', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, fill: 'none', pattern: theme.pattern || 'halftone', patternOpacity: 0.05, patternSize: 14 * u });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  const top = f.kind === 'land' ? f.H * 0.16 : f.H * 0.14;
  els.push(...pill('kicker', f, { x: f.W / 2 - 90 * u, y: top, text: data.kicker || g.status || 'FINAL', bg: theme.accent, color: onColor(theme.accent), live: !!g.live }));
  const logo = (f.kind === 'land' ? 230 : 250) * u;
  const ly = top + 90 * u;
  [a, h].forEach((t, i) => {
    if (!t) return;
    const cx = i === 0 ? f.W * 0.25 : f.W * 0.75;
    els.push({ id: `team-${i}-logo`, type: 'image', src: t.logo, x: cx - logo / 2, y: ly, w: logo, h: logo, fit: 'contain', shadow: { x: 0, y: 8 * u, blur: 30 * u, color: '#000', opacity: 0.5 } });
    els.push(T(`team-${i}-score`, { x: cx - 220 * u, y: ly + logo + 10 * u, w: 440 * u, h: 170 * u, text: String(t.score ?? ''), size: 180 * u, weight: 900, align: 'center', color: t.winner ? '#fff' : 'rgba(255,255,255,0.45)' }));
    els.push(T(`team-${i}-name`, { x: cx - 260 * u, y: ly + logo + 185 * u, w: 520 * u, h: 44 * u, text: t.name || t.abbr, size: 38 * u, weight: 800, align: 'center', upper: true, spacing: 1.5 * u, color: t.winner ? '#fff' : theme.muted }));
    if (t.record) els.push(T(`team-${i}-record`, { x: cx - 200 * u, y: ly + logo + 232 * u, w: 400 * u, h: 30 * u, text: t.record, size: 24 * u, font: 'sans', weight: 600, align: 'center', color: theme.muted }));
  });
  els.push(T('vs', { x: f.W / 2 - 60 * u, y: ly + logo + 40 * u, w: 120 * u, h: 100 * u, text: '—', size: 90 * u, weight: 700, align: 'center', color: 'rgba(255,255,255,0.4)' }));
  // Top performers.
  const perf = (data.performers || []).slice(0, f.kind === 'land' ? 2 : 4);
  const py = ly + logo + 290 * u;
  const pw = (f.W - 2 * f.m - 20 * u * (perf.length - 1)) / Math.max(1, perf.length);
  perf.forEach((p, i) => {
    const px = f.m + i * (pw + 20 * u);
    const hs = 90 * u;
    els.push({ id: `perf-${i}-bg`, type: 'rect', x: px, y: py, w: pw, h: hs + 24 * u, radius: 16 * u, fill: 'rgba(255,255,255,0.06)' });
    els.push({ id: `perf-${i}-img`, type: 'image', src: p.headshot, x: px + 12 * u, y: py + 12 * u, w: hs, h: hs, circle: true, fit: 'cover', anchor: 'top', bgFill: mix(theme.bg, vivid(p.color), 0.5) });
    els.push(T(`perf-${i}-name`, { x: px + hs + 26 * u, y: py + 16 * u, w: pw - hs - 40 * u, h: 40 * u, text: p.name, size: 36 * u, weight: 800, upper: true }));
    els.push(T(`perf-${i}-line`, { x: px + hs + 26 * u, y: py + 60 * u, w: pw - hs - 40 * u, h: 34 * u, text: p.line, size: 24 * u, font: 'sans', weight: 600, color: '#ddd' }));
  });
  if (data.note) els.push(T('note', { x: f.m, y: f.foot.y - 10 * u, w: f.W - 2 * f.m, h: 40 * u, text: data.note, size: 26 * u, font: 'sans', weight: 600, align: 'center', color: '#eee', bind: 'note' }));
  els.push(...sourceLine(f, theme, data, { y: f.H - f.m * 0.75 - 16 * u }));
  els.push(...grain(f, theme));
  return els;
}

function leaderboard(data, f, theme) {
  const u = f.u;
  const rows = (data.rows || []).slice(0, data.limit || 10);
  const els = [{ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, gradient: { angle: 160, stops: [[0, mix(theme.bg, theme.accent, 0.16)], [0.5, theme.bg], [1, theme.bg]] } }];
  if (theme.pattern !== 'none') els.push({ id: 'bg-pattern', type: 'rect', x: f.W * 0.6, y: 0, w: f.W * 0.4, h: f.H, fill: 'none', pattern: theme.pattern || 'halftone', patternOpacity: 0.06, patternSize: 14 * u });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  let y = f.m * 2.4;
  els.push(...pill('kicker', f, { x: f.m, y, text: data.kicker || 'LEADERS', bg: theme.accent, color: onColor(theme.accent) }));
  y += 64 * u;
  els.push(T('headline', { x: f.m, y, w: f.W - 2 * f.m, h: 96 * u, text: data.headline || '', size: 92 * u, weight: 900, upper: true, bind: 'headline' }));
  y += 104 * u;
  if (data.subhead) { els.push(T('subhead', { x: f.m, y, w: f.W - 2 * f.m, h: 34 * u, text: data.subhead, size: 26 * u, font: 'sans', weight: 600, color: theme.muted, bind: 'subhead' })); y += 50 * u; }
  const avail = f.H - y - f.m * 1.6;
  const cols = rows.length > 12 && f.kind === 'land' ? 2 : rows.length > 14 ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const rh = Math.min(96 * u, avail / Math.max(1, per));
  const cw = (f.W - 2 * f.m - 30 * u * (cols - 1)) / cols;
  const max = Math.max(...rows.map(r => +r.value || 0), 1);
  rows.forEach((r, i) => {
    const col = Math.floor(i / per), row = i % per;
    const x = f.m + col * (cw + 30 * u), ry = y + row * rh;
    const hs = rh * 0.78;
    els.push({ id: `row-${i}-bar`, type: 'rect', x: x + rh * 0.9 + hs + 12 * u, y: ry + rh * 0.12, w: (cw - rh * 0.9 - hs - 12 * u) * Math.max(0.05, (+r.value || 0) / max), h: rh * 0.76, radius: 8 * u, fill: i === 0 ? mix(theme.accent, theme.bg, 0.25) : 'rgba(255,255,255,0.07)' });
    els.push(T(`row-${i}-rank`, { x, y: ry, w: rh * 0.8, h: rh, text: String(r.rank ?? i + 1), size: rh * 0.55, weight: 900, color: i === 0 ? theme.accent : theme.muted, valign: 'middle', align: 'center' }));
    if (r.headshot) els.push({ id: `row-${i}-img`, type: 'image', src: r.headshot, x: x + rh * 0.9, y: ry + (rh - hs) / 2, w: hs, h: hs, circle: true, fit: 'cover', anchor: 'top', bgFill: mix(theme.bg, vivid(r.color), 0.55) });
    els.push(T(`row-${i}-name`, { x: x + rh * 0.9 + hs + 26 * u, y: ry, w: cw * 0.55, h: rh, text: `${r.name}${r.team ? `  ${r.team}` : ''}`, size: rh * 0.4, weight: 800, upper: true, valign: 'middle' }));
    els.push(T(`row-${i}-value`, { x: x + cw - 220 * u, y: ry, w: 210 * u, h: rh, text: String(r.display ?? r.value), size: rh * 0.5, weight: 900, align: 'right', valign: 'middle', color: i === 0 ? '#fff' : '#e5e5e5' }));
  });
  els.push(...sourceLine(f, theme, data, { y: f.H - f.m * 0.75 - 16 * u }));
  els.push(...grain(f, theme));
  return els;
}

function versus(data, f, theme, o = {}) {
  const u = f.u, c = data.compare || {};
  const A = c.a || {}, B = c.b || {};
  const ca = vivid(A.team?.color) || theme.accent, cb = vivid(B.team?.color) || '#4b5563';
  const els = [
    { id: 'bg-a', type: 'rect', x: 0, y: 0, w: f.W / 2, h: f.H, gradient: { angle: 180, stops: [[0, mix(theme.bg, ca, 0.45)], [1, theme.bg]] } },
    { id: 'bg-b', type: 'rect', x: f.W / 2, y: 0, w: f.W / 2, h: f.H, gradient: { angle: 180, stops: [[0, mix(theme.bg, cb, 0.45)], [1, theme.bg]] } },
  ];
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  const ih = f.kind === 'land' ? f.H * 0.36 : f.H * 0.36;
  const iy = f.m * 2.3;
  els.push({ id: 'player-a', type: 'image', src: A.headshot, x: 0, y: iy, w: f.W / 2, h: ih, fit: 'contain', anchor: 'bottom', fade: 'bottom', fadeStart: 0.8 });
  els.push({ id: 'player-b', type: 'image', src: B.headshot, x: f.W / 2, y: iy, w: f.W / 2, h: ih, fit: 'contain', anchor: 'bottom', fade: 'bottom', fadeStart: 0.8 });
  els.push(T('name-a', { x: f.m, y: iy + ih + 8 * u, w: f.W / 2 - f.m - 20 * u, h: 64 * u, text: A.name || '', size: 60 * u, weight: 900, upper: true, bind: 'compare.a.name' }));
  els.push(T('name-b', { x: f.W / 2 + 20 * u, y: iy + ih + 8 * u, w: f.W / 2 - f.m - 20 * u, h: 64 * u, text: B.name || '', size: 60 * u, weight: 900, upper: true, align: 'right', bind: 'compare.b.name' }));
  els.push(T('vs', { x: f.W / 2 - 60 * u, y: iy + ih * 0.4, w: 120 * u, h: 110 * u, text: 'VS', size: 96 * u, weight: 900, italic: true, align: 'center', color: theme.accent, valign: 'middle' }));
  els.push(T('period', { x: f.m, y: iy + ih + 76 * u, w: f.W - 2 * f.m, h: 30 * u, text: c.period || '', size: 24 * u, font: 'sans', weight: 700, align: 'center', color: theme.muted, upper: true, spacing: 2 * u, bind: 'compare.period' }));
  const keys = (c.rows || []).slice(0, f.kind === 'land' ? 5 : 8);
  let y = iy + ih + 124 * u;
  const rh = Math.max(Math.min(84 * u, (f.H - y - f.m * 1.6) / Math.max(1, keys.length)), 40 * u);
  keys.forEach((r, i) => {
    const better = r.better; // 'a' | 'b' | null
    const ry = y + i * rh;
    els.push({ id: `cmp-${i}-bg`, type: 'rect', x: f.m, y: ry + 4 * u, w: f.W - 2 * f.m, h: rh - 8 * u, radius: 10 * u, fill: i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)' });
    els.push(T(`cmp-${i}-a`, { x: f.m + 20 * u, y: ry, w: f.W * 0.3, h: rh, text: String(r.a ?? '—'), size: rh * 0.55, weight: 900, valign: 'middle', color: better === 'a' ? theme.accent : '#fff' }));
    els.push(T(`cmp-${i}-label`, { x: f.W / 2 - 200 * u, y: ry, w: 400 * u, h: rh, text: r.label, size: rh * 0.34, font: 'sans', weight: 700, align: 'center', valign: 'middle', upper: true, spacing: 1.5 * u, color: theme.muted }));
    els.push(T(`cmp-${i}-b`, { x: f.W * 0.7 - f.m - 20 * u, y: ry, w: f.W * 0.3, h: rh, text: String(r.b ?? '—'), size: rh * 0.55, weight: 900, valign: 'middle', align: 'right', color: better === 'b' ? theme.accent : '#fff' }));
  });
  els.push(...sourceLine(f, theme, data, { y: f.H - f.m * 0.75 - 16 * u }));
  els.push(...grain(f, theme));
  return els;
}

function seasonStats(data, f, theme) {
  const u = f.u;
  const els = playerLayout({ ...data, stats: [], note: null, game: null }, f, theme, { kicker: data.kicker || data.season || 'SEASON' });
  // A grid of season averages under the name.
  const stats = data.stats || [];
  const cols = f.kind === 'land' ? 3 : 3;
  const x0 = f.text.x, w = f.kind === 'land' ? f.text.w : f.W - 2 * f.m;
  const y0 = (f.kind === 'land' ? f.H * 0.2 : f.text.y - 20 * u) + 66 * u + (f.kind === 'land' ? 158 : 140) * 1.42 * u + 10 * u;
  const cw = w / cols, ch = 120 * u;
  stats.slice(0, 9).forEach((s, i) => {
    const x = x0 + (i % cols) * cw, y = y0 + Math.floor(i / cols) * ch;
    els.push(T(`grid-${i}-value`, { x, y, w: cw - 12 * u, h: ch * 0.66, text: String(s.value), size: ch * 0.66, weight: 900, valign: 'bottom', bind: `stats.${i}.value` }));
    els.push(T(`grid-${i}-label`, { x, y: y + ch * 0.68, w: cw - 12 * u, h: ch * 0.2, text: s.label, size: 20 * u, font: 'sans', weight: 700, upper: true, spacing: 1.5 * u, color: theme.muted, bind: `stats.${i}.label` }));
  });
  return els;
}

function oddity(data, f, theme) {
  const u = f.u, team = data.team;
  const els = [...background(f, theme, team, { tone: 'mono' })];
  els.push(...playerImage(f, data, { box: f.kind === 'land' ? { x: f.W * 0.58, y: f.H * 0.18, w: f.W * 0.42, h: f.H * 0.82 } : { x: f.W * 0.35, y: f.H * 0.52, w: f.W * 0.65, h: f.H * 0.48 }, filter: 'duotone', id: 'player' }).map(e => ({ ...e, duotone: ['#0a0a0b', theme.accent] })));
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  let y = f.m * 2.6;
  els.push(...pill('kicker', f, { x: f.m, y, text: data.kicker || 'STAT ODDITY', bg: theme.accent, color: onColor(theme.accent) }));
  y += 76 * u;
  const tw = f.kind === 'land' ? f.W * 0.6 : f.W - 2 * f.m;
  els.push(T('headline', { x: f.m, y, w: tw, h: (f.kind === 'land' ? 330 : 420) * u, text: data.headline || '', size: 120 * u, weight: 900, upper: true, wrap: true, maxLines: 4, lineHeight: 0.95, bind: 'headline' }));
  y += (f.kind === 'land' ? 340 : 430) * u;
  els.push(T('note', { x: f.m, y, w: tw * 0.9, h: 110 * u, text: data.note || '', size: 30 * u, font: 'sans', weight: 600, color: '#e5e5e5', wrap: true, maxLines: 3, lineHeight: 1.25, bind: 'note' }));
  els.push(T('name', { x: f.m, y: y + 120 * u, w: tw, h: 50 * u, text: data.player?.name || '', size: 46 * u, weight: 800, upper: true, color: theme.accent, bind: 'player.name' }));
  els.push(...scoreStrip(f, theme, data));
  els.push(...sourceLine(f, theme, data, { y: f.kind === 'land' ? undefined : f.foot.y - 40 * u }));
  els.push(...grain(f, theme));
  return els;
}

function teamRecord(data, f, theme) {
  const u = f.u, team = data.team, r = data.record || {};
  const c = vivid(team?.color) || theme.accent;
  const els = [{ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, gradient: { angle: 135, stops: [[0, mix(theme.bg, c, 0.65)], [1, theme.bg]] } }];
  if (team?.logo) els.push({ id: 'logo-watermark', type: 'image', src: team.logo, x: f.W * (f.kind === 'land' ? 0.5 : 0.2), y: f.H * 0.05, w: f.W * (f.kind === 'land' ? 0.55 : 0.85), h: f.H * 0.7, fit: 'contain', opacity: 0.16 });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  let y = f.H * 0.22;
  els.push(...pill('kicker', f, { x: f.m, y, text: data.kicker || 'FRANCHISE RECORD', bg: theme.accent, color: onColor(theme.accent) }));
  y += 76 * u;
  els.push(T('hero', { x: f.m, y, w: f.W * 0.7, h: 260 * u, text: String(data.hero?.value ?? r.value ?? ''), size: 270 * u, weight: 900, valign: 'bottom', bind: 'hero.value' }));
  y += 270 * u;
  els.push(T('hero-label', { x: f.m, y, w: f.W - 2 * f.m, h: 70 * u, text: data.hero?.label || '', size: 64 * u, weight: 900, upper: true, color: theme.accent, bind: 'hero.label' }));
  y += 84 * u;
  els.push(T('record-title', { x: f.m, y, w: f.W * (f.kind === 'land' ? 0.6 : 0.9), h: 90 * u, text: r.title || '', size: 36 * u, font: 'sans', weight: 800, wrap: true, maxLines: 2, lineHeight: 1.15, bind: 'record.title' }));
  y += 96 * u;
  if (r.previousText) els.push(T('prev', { x: f.m, y, w: f.W * 0.8, h: 70 * u, text: `Previous: ${r.previousText}`, size: 26 * u, font: 'sans', weight: 600, color: '#ddd', wrap: true, maxLines: 2, bind: 'record.previousText' }));
  els.push(...scoreStrip(f, theme, data));
  els.push(...sourceLine(f, theme, data, { y: f.kind === 'land' ? undefined : f.foot.y - 40 * u }));
  els.push(...grain(f, theme));
  return els;
}

function historical(data, f, theme) {
  const u = f.u;
  const els = playerLayout({ ...data, note: null }, f, theme, { kicker: data.kicker || 'HISTORY' });
  // Comparison panel: tonight vs the last time / the record.
  const h = data.history || {};
  const x = f.text.x, w = f.kind === 'land' ? f.text.w : f.W - 2 * f.m;
  const y = f.kind === 'land' ? f.H * 0.73 : f.foot.y - 210 * u;
  els.push({ id: 'hist-bg', type: 'rect', x, y, w, h: 120 * u, radius: 14 * u, fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1.5 * u });
  els.push(T('hist-label', { x: x + 22 * u, y: y + 14 * u, w: w - 44 * u, h: 26 * u, text: h.label || 'FOR COMPARISON', size: 20 * u, font: 'sans', weight: 800, spacing: 2 * u, color: theme.accent, upper: true, bind: 'history.label' }));
  els.push(T('hist-text', { x: x + 22 * u, y: y + 44 * u, w: w - 44 * u, h: 66 * u, text: h.text || '', size: 26 * u, font: 'sans', weight: 600, wrap: true, maxLines: 2, lineHeight: 1.2, bind: 'history.text' }));
  return els;
}

// A team story (comeback, run, streak, collapse): the logo as hero, the headline, the defining number, chips.
function teamStory(data, f, theme) {
  const u = f.u, team = data.team || {};
  const c = vivid(team.color) || theme.accent;
  const els = [{ id: 'bg-wash', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, gradient: { angle: 125, stops: [[0, mix(theme.bg, c, 0.7)], [0.55, mix(theme.bg, c, 0.18)], [1, theme.bg]] } }];
  if (theme.pattern !== 'none') els.push({ id: 'bg-pattern', type: 'rect', x: 0, y: 0, w: f.W, h: f.H, fill: 'none', pattern: theme.pattern || 'halftone', patternOpacity: 0.06, patternSize: 14 * u });
  const lg = f.kind === 'land' ? f.H * 0.62 : f.W * 0.62;
  if (team.logo) els.push({ id: 'logo-hero', type: 'image', src: team.logo, x: f.kind === 'land' ? f.W - lg - f.m * 0.6 : (f.W - lg) / 2, y: f.kind === 'land' ? (f.H - lg) / 2 - 20 * u : f.H * 0.1, w: lg, h: lg, fit: 'contain', opacity: 0.95, shadow: { x: 0, y: 14 * u, blur: 50 * u, color: '#000', opacity: 0.5 } });
  els.push(...brand(f, theme, data), ...handle(f, theme, data));
  const tx = f.m, tw = f.kind === 'land' ? f.W * 0.55 : f.W - 2 * f.m;
  let y = f.kind === 'land' ? f.H * 0.2 : f.H * 0.1 + lg + 30 * u;
  els.push(...pill('kicker', f, { x: tx, y, text: data.kicker || 'STORY', bg: theme.accent, color: onColor(theme.accent), live: !!data.game?.live }));
  y += 70 * u;
  els.push(T('headline', { x: tx, y, w: tw, h: (f.kind === 'land' ? 200 : 210) * u, text: data.headline || '', size: 112 * u, weight: 900, upper: true, wrap: true, maxLines: 2, lineHeight: 0.92, valign: 'top', bind: 'headline' }));
  y += (f.kind === 'land' ? 212 : 220) * u;
  els.push(T('note', { x: tx, y, w: tw, h: 112 * u, text: data.note || '', size: 30 * u, font: 'sans', weight: 600, color: '#ececec', wrap: true, maxLines: 3, lineHeight: 1.22, bind: 'note' }));
  y += 128 * u;
  els.push(...statRow(f, theme, data.stats || [], { x: tx, y, w: tw, h: 130, max: 3 }));
  els.push(...scoreStrip(f, theme, data));
  els.push(...sourceLine(f, theme, data, { y: f.kind === 'land' ? undefined : f.foot.y - 40 * u }));
  els.push(...grain(f, theme));
  return els;
}

// The catalog. stats: default statistic keys for the stat row.
export const TEMPLATES = [
  { id: 'player-story', name: 'Player story', category: 'Feed', stats: [], build: (d, f, t) => playerLayout(d, f, t, { live: !!d.game?.live }) },
  { id: 'team-story', name: 'Team story', category: 'Feed', stats: [], build: (d, f, t) => teamStory(d, f, t) },
  { id: 'game-situation', name: 'Game situation', category: 'Feed', stats: [], build: (d, f, t) => gameResult(d, f, t) },
  { id: 'performance-live', name: 'Live performance', category: 'Performance', stats: ['pts', 'reb', 'ast', 'fg'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || `LIVE · ${d.game?.status || ''}`, live: true, kickerBg: '#1f1f23' }) },
  { id: 'performance-final', name: 'Final performance', category: 'Performance', stats: ['pts', 'reb', 'ast', 'fg'], build: (d, f, t) => playerLayout(d, f, t) },
  { id: 'potn', name: 'Performance of the Night', category: 'Performance', stats: ['pts', 'reb', 'ast', 'ts_pct'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || 'PERFORMANCE OF THE NIGHT', badge: d.dateLabel }) },
  { id: 'record-broken', name: 'Record broken', category: 'Records', stats: [], build: (d, f, t) => recordLayout(d, f, t, { kicker: d.kicker || 'RECORD BROKEN' }) },
  { id: 'record-tied', name: 'Record tied', category: 'Records', stats: [], build: (d, f, t) => recordLayout(d, f, t, { kicker: d.kicker || 'RECORD TIED', kickerBg: '#e5e5e5', prevLabel: 'SHARES THE RECORD WITH' }) },
  { id: 'record-approaching', name: 'Approaching a record', category: 'Records', stats: [], build: (d, f, t) => recordLayout(d, f, t, { kicker: d.kicker || 'CHASING HISTORY', live: !!d.game?.live, kickerBg: '#1f1f23', progress: d.record?.progress || ' ', prevLabel: 'THE RECORD' }) },
  { id: 'milestone', name: 'Career milestone', category: 'Milestones', stats: [], build: (d, f, t) => recordLayout(d, f, t, { kicker: d.kicker || 'MILESTONE', progress: d.record?.progress, prevLabel: 'BEFORE TONIGHT' }) },
  { id: 'franchise-milestone', name: 'Franchise milestone', category: 'Milestones', stats: [], build: (d, f, t) => teamRecord(d, f, t) },
  { id: 'triple-double', name: 'Triple-double', category: 'Performance', stats: ['pts', 'reb', 'ast', 'stl'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || 'TRIPLE-DOUBLE', highlight: ['pts', 'reb', 'ast'].filter(k => (d.values?.[k] ?? 0) >= 10) }) },
  { id: 'game-winner', name: 'Game-winning performance', category: 'Performance', stats: ['pts', 'reb', 'ast', 'fg'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || 'GAME-WINNER' }) },
  { id: 'game-result', name: 'Game result', category: 'Games', stats: [], build: (d, f, t) => gameResult(d, f, t) },
  { id: 'disappointment', name: 'Biggest disappointment', category: 'Performance', stats: ['pts', 'fg', 'tov', 'pm'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || 'ROUGH NIGHT', tone: 'mono', filter: 'grayscale', kickerBg: '#3f3f46' }) },
  { id: 'historical-comparison', name: 'Historical comparison', category: 'History', stats: ['pts', 'reb', 'ast'], build: (d, f, t) => historical(d, f, t) },
  { id: 'leaderboard', name: 'Statistical leaderboard', category: 'Leaderboards', stats: [], build: (d, f, t) => leaderboard(d, f, t) },
  { id: 'player-vs-player', name: 'Player vs. player', category: 'Comparisons', stats: [], build: (d, f, t) => versus(d, f, t) },
  { id: 'season-stats', name: 'Season statistics', category: 'Season', stats: ['pts', 'reb', 'ast', 'fg_pct', 'tp_pct', 'ts_pct'], build: (d, f, t) => seasonStats(d, f, t) },
  { id: 'playoff-performance', name: 'Playoff performance', category: 'Performance', stats: ['pts', 'reb', 'ast', 'fg'], build: (d, f, t) => playerLayout(d, f, { ...t, accent: t.accent === THEME.accent ? '#f5b301' : t.accent }, { kicker: d.kicker || 'PLAYOFFS' }) },
  { id: 'team-record', name: 'Team record', category: 'Records', stats: [], build: (d, f, t) => teamRecord(d, f, t) },
  { id: 'rookie-performance', name: 'Rookie performance', category: 'Performance', stats: ['pts', 'reb', 'ast', 'fg'], build: (d, f, t) => playerLayout(d, f, t, { kicker: d.kicker || 'ROOKIE WATCH', badge: 'ROOKIE' }) },
  { id: 'stat-oddity', name: 'Statistical oddity', category: 'Oddities', stats: [], build: (d, f, t) => oddity(d, f, t) },
];
export const TEMPLATE = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

// Build the scene for a project: template + data + theme, then the editor's overrides, removals and added elements.
export function buildScene(project) {
  const t = TEMPLATE[project.template] || TEMPLATE['performance-final'];
  const size = project.size || { w: 1600, h: 900 };
  const theme = { ...THEME, ...(project.theme || {}) };
  const f = frame(size.w, size.h);
  const data = { ...project.data, dateLabel: project.data?.dateLabel || fmtDate(project.data?.date) };
  let els = t.build(data, f, theme);
  const ov = project.overrides || {};
  const removed = new Set(project.removed || []);
  els = els.filter(e => !removed.has(e.id)).map(e => (ov[e.id] ? { ...e, ...ov[e.id], ...(ov[e.id].text != null ? { bind: undefined } : {}) } : e));
  for (const x of project.extra || []) els.push(ov[x.id] ? { ...x, ...ov[x.id] } : x);
  if (project.order?.length) {
    const pos = new Map(project.order.map((id, i) => [id, i]));
    els = els.map((e, i) => ({ e, k: pos.has(e.id) ? pos.get(e.id) : i })).sort((a, b) => a.k - b.k).map(x => x.e);
  }
  return { w: size.w, h: size.h, bg: theme.bg, elements: els };
}
export { fmtDate };
