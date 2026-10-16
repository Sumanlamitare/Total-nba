// Canvas painting for spines (one atlas per bay), and the cover of the book being taken down.
// Modern cloth bindings: the team's colour, condensed sans-serif lettering, gold bands for MVP awards.
import { CASE, span, hash, spineColor, teamCloth, inkOn, mix } from './shelves.js';

export const GOLD = '#d8b25a';
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = 'Barlow, "Helvetica Neue", Arial, sans-serif';

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

const initials = n => (n || '').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('');

// The front cover, laid out like the reader's cover (Reader.jsx, .cover in styles.css) so the book in your hand
// and the one that opens are the same: team cloth, the player's photo, a band, the name in big condensed capitals.
export function paintCover(p, team, { width = 512, height = 720, portrait = null } = {}) {
  const { canvas, ctx } = canvasOf(width, height);
  const base = teamCloth(team);
  const ink = inkOn(base);
  const cw = width / 100, ch = height / 100;
  const g = ctx.createRadialGradient(width / 2, height * 0.34, 0, width / 2, height * 0.34, height * 0.75);
  g.addColorStop(0, mix(base, '#ffffff', 0.28)); g.addColorStop(0.55, base); g.addColorStop(1, mix(base, '#000000', 0.3));
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  const hinge = ctx.createLinearGradient(0, 0, width * 0.06, 0);
  hinge.addColorStop(0, 'rgba(0,0,0,0.35)'); hinge.addColorStop(0.4, 'rgba(255,255,255,0.08)'); hinge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hinge; ctx.fillRect(0, 0, width * 0.06, height);

  const padX = 8 * cw, top = 7 * ch;
  ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const imprintSize = Math.max(10, 2.6 * cw);
  ctx.font = `700 ${imprintSize}px ${COND}`; ctx.globalAlpha = 0.8;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${imprintSize * 0.3}px`;
  ctx.fillText('PLAYER LIBRARY', padX, top + imprintSize * 0.8);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;

  // From the bottom up: hint, years, name, band; the photo takes the rest.
  let y = height - 6 * ch;
  const hintSize = Math.max(11, 2.6 * cw), yearsSize = Math.max(12, 3.4 * cw);
  ctx.font = `600 ${hintSize}px ${SANS}`; ctx.globalAlpha = 0.6;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${hintSize * 0.12}px`;
  ctx.fillText('SWIPE OR TAP TO OPEN', padX, y - hintSize * 0.2);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  y -= hintSize + 2 * ch;
  ctx.font = `600 ${yearsSize}px ${SANS}`; ctx.globalAlpha = 0.9;
  ctx.fillText([team?.id ? team.name : null, span(p)].filter(Boolean).join(' · '), padX, y - yearsSize * 0.25);
  y -= yearsSize * 1.2 + 2.2 * ch;
  ctx.globalAlpha = 1;
  const words = (p.n || '').toUpperCase().split(/\s+/).filter(Boolean);
  const sizes = words.map(w => (w.length > 9 ? 12 : 17) * cw);
  for (let k = words.length - 1; k >= 0; k--) {
    ctx.font = `800 ${sizes[k]}px ${COND}`;
    const max = width - 2 * padX;
    while (ctx.measureText(words[k]).width > max && sizes[k] > 20) { sizes[k] -= 2; ctx.font = `800 ${sizes[k]}px ${COND}`; }
    ctx.fillText(words[k], padX, y - sizes[k] * 0.12);
    y -= sizes[k] * 0.86;
  }
  y -= 3 * ch;
  const bandH = 1.2 * ch;
  ctx.fillStyle = team?.alt || GOLD; ctx.fillRect(0, y - bandH, width, bandH);
  y -= bandH;
  const photoTop = top + imprintSize + 2 * ch, photoBottom = y;
  if (portrait && portrait.width) {
    const boxH = photoBottom - photoTop;
    const s = Math.min(width / portrait.width, boxH / portrait.height);
    const w = portrait.width * s, h = portrait.height * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, photoTop, width, boxH); ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 12;
    ctx.drawImage(portrait, (width - w) / 2, photoBottom - h, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = ink; ctx.globalAlpha = 0.22; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${34 * cw}px ${COND}`;
    ctx.fillText(initials(p.n).toUpperCase(), width / 2, (photoTop + photoBottom) / 2);
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  return canvas;
}
