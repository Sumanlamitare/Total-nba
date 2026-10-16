// Canvas painting for spines (one atlas per bay), and the covers and first pages of the book being opened.
// Modern cloth bindings: the team's colour, condensed sans-serif lettering, gold bands for MVP awards.
import { CASE, span, hash, spineColor, teamCloth, inkOn, mix } from './shelves.js';

export const GOLD = '#d8b25a';
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = 'Barlow, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Literata, Georgia, serif';

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// Paint one spine into rect (x, y, w, h) — y is the top edge.
export function paintSpine(ctx, p, team, x, y, w, h) {
  const base = spineColor(p, team);
  const ink = inkOn(base);
  // Cloth: a soft cylinder shade across the spine.
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, mix(base, '#000000', 0.22));
  g.addColorStop(0.3, mix(base, '#ffffff', 0.06));
  g.addColorStop(0.7, base);
  g.addColorStop(1, mix(base, '#000000', 0.25));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const u = w / 30;

  // Head band in the team's second colour; MVP awards as gold bands under it; Finals MVPs as stars at the foot.
  ctx.fillStyle = team?.alt && team.alt !== base ? team.alt : mix(base, '#ffffff', 0.35);
  ctx.globalAlpha = 0.85; ctx.fillRect(x, y + h * 0.035, w, Math.max(2, u * 1.2)); ctx.globalAlpha = 1;
  const mvp = Math.min(p.h?.mvp || 0, 6);
  ctx.fillStyle = GOLD;
  for (let k = 0; k < mvp; k++) ctx.fillRect(x + 1, y + h * 0.07 + k * u * 2.4, w - 2, u * 1.3);
  const fm = Math.min(p.h?.fmvp || 0, 6);
  for (let k = 0; k < fm; k++) star(ctx, x + w / 2, y + h * 0.93 - k * u * 4.6 - u * 2, u * 1.9);

  // Lettering, set vertically (reads top to bottom): SURNAME in bold condensed caps, first name lighter, years.
  const top = y + h * 0.08 + mvp * u * 2.4 + u * 2.5;
  const bottom = y + h * 0.93 - fm * u * 4.6 - u * 3;
  const room = bottom - top;
  ctx.save();
  ctx.translate(x + w / 2, top);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  const surname = (p.l || p.n || '').toUpperCase();
  const first = p.l && p.n && p.n !== p.l ? p.n.slice(0, p.n.length - p.l.length).trim() : '';
  const years = span(p);
  let size = Math.min(w * 0.56, 30);
  const measure = s => {
    ctx.font = `700 ${s}px ${COND}`; let tw = ctx.measureText(surname).width;
    if (first) { ctx.font = `500 ${s * 0.7}px ${COND}`; tw += s * 0.35 + ctx.measureText(first).width; }
    if (years) { ctx.font = `500 ${s * 0.6}px ${COND}`; tw += s * 0.9 + ctx.measureText(years).width; }
    return tw;
  };
  const scale = Math.min(1, (room - 4) / measure(size));
  size *= Math.max(scale, 0.4);
  ctx.font = `700 ${size}px ${COND}`; ctx.fillText(surname, 0, 0);
  let cx = ctx.measureText(surname).width;
  if (first) { ctx.font = `500 ${size * 0.7}px ${COND}`; ctx.globalAlpha = 0.85; cx += size * 0.35; ctx.fillText(first, cx, size * 0.03); cx += ctx.measureText(first).width; }
  if (years && cx + size < room) {
    ctx.font = `500 ${size * 0.6}px ${COND}`; ctx.globalAlpha = 0.75;
    ctx.fillText(years, Math.max(cx + size * 0.8, room - ctx.measureText(years).width), size * 0.03);
  }
  ctx.restore();
}

// One atlas canvas for a bay. Returns { canvas, rects } where rects[n] is [u, v, w, h] in texture space.
export function paintCase(players, layout, caseIndex, ppm) {
  const cs = layout.cases[caseIndex];
  const W = Math.round(CASE.width * ppm), rowH = Math.round(0.36 * ppm), H = rowH * CASE.shelves;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1c1f'; ctx.fillRect(0, 0, W, H);
  const rects = [];
  for (let n = cs.first; n <= cs.last; n++) {
    const b = layout.books[n];
    const x = Math.round((b.x - b.w / 2 + CASE.width / 2) * ppm);
    const w = Math.max(2, Math.round(b.w * ppm)), h = Math.round(b.h * ppm);
    const y = b.s * rowH + (rowH - h);
    paintSpine(ctx, players[b.i], cs.team, x, y, w, h);
    rects.push([x / W, 1 - (y + h) / H, w / W, h / H]);
  }
  return { canvas, rects };
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

// Book cloth: a fine woven texture in the team's colour.
function cloth(ctx, width, height, base, seed) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = hash(seed + k) > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(hash(k + 'x' + seed) * width, hash(k + 'y' + seed) * height, 2, 1);
  }
}

const initials = n => (n || '').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('');

// The front cover: team-coloured cloth, the name in large condensed capitals, a thin gold rule, the years.
export function paintCover(p, team, { width = 512, height = 720, portrait = null } = {}) {
  const { canvas, ctx } = canvasOf(width, height);
  const base = teamCloth(team);
  const ink = inkOn(base);
  cloth(ctx, width, height, base, p.i);
  ctx.fillStyle = team?.alt || GOLD;
  ctx.fillRect(0, height - 54, width, 10);
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  ctx.font = `600 20px ${SANS}`; ctx.globalAlpha = 0.8; ctx.fillText('PLAYER LIBRARY', 48, 76); ctx.globalAlpha = 1;
  if (portrait) {
    const r = 110, cx = width - 48 - r, cy = 230;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = mix(base, '#000000', 0.25); ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const s = (r * 2.4) / portrait.width;
    ctx.drawImage(portrait, cx - (portrait.width * s) / 2, cy - r * 0.9, portrait.width * s, portrait.height * s);
    ctx.restore();
  } else {
    ctx.font = `700 200px ${COND}`; ctx.globalAlpha = 0.14; ctx.textAlign = 'right';
    ctx.fillText(initials(p.n), width - 36, 330); ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  const words = (p.n || '').toUpperCase().split(/\s+/);
  let size = 92; ctx.font = `700 ${size}px ${COND}`;
  while (words.some(w => ctx.measureText(w).width > width - 96) && size > 40) { size -= 4; ctx.font = `700 ${size}px ${COND}`; }
  let y = height * 0.62 - (words.length - 1) * size * 0.9;
  for (const w of words) { ctx.fillText(w, 48, y); y += size * 0.9; }
  ctx.fillStyle = GOLD; ctx.fillRect(48, y - size * 0.45, 64, 4);
  ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.font = `500 26px ${SANS}`; ctx.fillText(span(p) || '', 48, y + 6);
  ctx.globalAlpha = 1;
  return canvas;
}

// Endpapers: a quiet pattern in the team's colours (the 3D book's inside covers and the reader's last page).
export function paintEndpaper(team, width = 512, height = 720) {
  const { canvas, ctx } = canvasOf(width, height);
  const base = mix(teamCloth(team), '#0b0c10', 0.15);
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = mix(base, '#ffffff', 0.12); ctx.lineWidth = 2;
  for (let k = -height; k < width + height; k += 22) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + height, height); ctx.stroke(); }
  return canvas;
}
export const paintMarble = (team, w, h) => paintEndpaper(team, w, h);

const PAPER = '#fbf9f4';
function paper(width, height, edge = 'left') {
  const { canvas, ctx } = canvasOf(width, height);
  const g = ctx.createLinearGradient(0, 0, width, 0);
  if (edge === 'left') { g.addColorStop(0, '#e4ded2'); g.addColorStop(0.07, PAPER); g.addColorStop(1, PAPER); }
  else { g.addColorStop(0, PAPER); g.addColorStop(0.93, PAPER); g.addColorStop(1, '#e4ded2'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

export function paintHalfTitle(p, width = 512, height = 720) {
  const { canvas, ctx } = paper(width, height, 'left');
  ctx.fillStyle = '#1d1e22'; ctx.textAlign = 'center';
  let size = 40; ctx.font = `600 ${size}px ${COND}`;
  const name = (p.n || '').toUpperCase();
  while (ctx.measureText(name).width > width - 140 && size > 20) { size -= 2; ctx.font = `600 ${size}px ${COND}`; }
  ctx.fillText(name, width / 2, height * 0.36);
  return canvas;
}

export function paintBookplate(p, shelfMark, team, width = 512, height = 720) {
  const { canvas, ctx } = paper(width, height, 'right');
  const w = 250, h = 160, x = (width - w) / 2, y = height * 0.42 - h / 2;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = teamCloth(team); ctx.fillRect(x, y, w, 8);
  ctx.strokeStyle = '#d9d4ca'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left'; ctx.fillStyle = '#6a6c72'; ctx.font = `600 14px ${SANS}`; ctx.fillText('FROM THE PLAYER LIBRARY', x + 22, y + 44);
  ctx.fillStyle = '#1d1e22'; ctx.font = `700 30px ${COND}`; ctx.fillText((p.n || '').toUpperCase(), x + 22, y + 84, w - 44);
  if (shelfMark) { ctx.fillStyle = '#6a6c72'; ctx.font = `500 16px ${SANS}`; ctx.fillText(shelfMark, x + 22, y + 122, w - 44); }
  return canvas;
}

export function paintTitlePage(p, team, { width = 512, height = 720, portrait = null } = {}) {
  const { canvas, ctx } = paper(width, height, 'left');
  const accent = teamCloth(team);
  ctx.textAlign = 'left';
  ctx.fillStyle = accent; ctx.fillRect(56, 92, 40, 5);
  ctx.fillStyle = '#6a6c72'; ctx.font = `600 16px ${SANS}`; ctx.fillText('PLAYER LIBRARY', 56, 130);
  const r = 70, cy = 250, cx = 56 + r;
  ctx.fillStyle = '#efece5'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (portrait) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const s = (r * 2.5) / portrait.width;
    ctx.drawImage(portrait, cx - (portrait.width * s) / 2, cy - r * 0.8, portrait.width * s, portrait.height * s);
    ctx.restore();
  } else {
    ctx.fillStyle = accent; ctx.font = `700 64px ${COND}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials(p.n), cx, cy + 3); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#1d1e22';
  let size = 60; ctx.font = `700 ${size}px ${COND}`;
  const name = (p.n || '').toUpperCase();
  while (ctx.measureText(name).width > width - 112 && size > 26) { size -= 2; ctx.font = `700 ${size}px ${COND}`; }
  ctx.fillText(name, 56, 400);
  ctx.fillStyle = '#5a5c62'; ctx.font = `400 24px ${SERIF}`; ctx.fillText(span(p) || '', 56, 440);
  return canvas;
}
