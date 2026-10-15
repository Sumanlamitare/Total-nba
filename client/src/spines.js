// Canvas painting for spines (one atlas per bookcase) and the cover of the book being opened.
import { CASE, eraOf, span, hash } from './shelves.js';

export const GOLD = '#d4b16a';
const GOLD_DARK = '#9c7a3c';
const FACE = '"IM Fell English SC", "EB Garamond", Georgia, serif';
const TEXT = '"EB Garamond", Georgia, serif';

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// Paint one spine into rect (x, y, w, h) — y is the top edge.
export function paintSpine(ctx, p, x, y, w, h, { dim = false } = {}) {
  const base = eraOf(p).leather;
  const jitter = (hash(p.i + 'c') - 0.5) * 0.06;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(base, jitter - 0.09));
  g.addColorStop(0.35, shade(base, jitter + 0.05));
  g.addColorStop(0.65, shade(base, jitter + 0.02));
  g.addColorStop(1, shade(base, jitter - 0.11));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (dim) return;
  const u = w / 30; // spine unit: scales everything to the book's thickness

  // Decorative double rules, top and bottom (every book has them).
  ctx.fillStyle = GOLD_DARK;
  for (const yy of [y + h * 0.05, y + h * 0.95]) { ctx.fillRect(x + 1, yy - u * 0.7, w - 2, u * 0.6); ctx.fillRect(x + 1, yy + u * 0.5, w - 2, u * 0.35); }

  // MVP awards: solid gold bands under the top rule.
  const mvp = Math.min(p.h?.mvp || 0, 6);
  ctx.fillStyle = GOLD;
  for (let k = 0; k < mvp; k++) ctx.fillRect(x + 1, y + h * 0.085 + k * u * 2.6, w - 2, u * 1.5);
  // Finals MVP: gilt stars above the bottom rule.
  const fm = Math.min(p.h?.fmvp || 0, 6);
  for (let k = 0; k < fm; k++) star(ctx, x + w / 2, y + h * 0.9 - k * u * 5 - u * 2.2, u * 2.1);

  // Title, set vertically (reads top to bottom, as English spines do).
  const top = y + h * 0.1 + mvp * u * 2.6 + u * 2;
  const bottom = y + h * 0.9 - fm * u * 5 - u * 3;
  const room = bottom - top;
  ctx.save();
  ctx.translate(x + w / 2, top);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = GOLD;
  ctx.textBaseline = 'middle';
  const surname = (p.l || p.n || '').toUpperCase();
  const first = p.l && p.n && p.n !== p.l ? p.n.slice(0, p.n.length - p.l.length).trim() : '';
  const years = span(p);
  let size = Math.min(w * 0.5, 30);
  ctx.font = `${size}px ${FACE}`;
  const full = `${surname}${first ? '  ' + first : ''}`;
  let tw = ctx.measureText(full).width;
  ctx.font = `${size * 0.62}px ${TEXT}`;
  const yw = years ? ctx.measureText(years).width + size : 0;
  const scale = Math.min(1, (room - 4) / (tw + yw));
  size *= Math.max(scale, 0.35);
  ctx.font = `${size}px ${FACE}`;
  ctx.fillText(surname, 0, 0);
  let cx = ctx.measureText(surname).width;
  if (first) { ctx.font = `${size * 0.72}px ${FACE}`; cx += size * 0.4; ctx.fillText(first, cx, size * 0.04); cx += ctx.measureText(first).width; }
  if (years && cx + size < room) {
    ctx.font = `${size * 0.62}px ${TEXT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(years, Math.max(cx + size * 0.8, room - ctx.measureText(years).width), size * 0.03);
  }
  ctx.restore();
}

// One atlas canvas for a bookcase. Returns { canvas, rects } where rects[n] is [u, v, w, h] in texture space.
export function paintCase(players, layout, caseIndex, ppm) {
  const cs = layout.cases[caseIndex];
  const W = Math.round(CASE.width * ppm), rowH = Math.round(0.36 * ppm), H = rowH * CASE.shelves;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20150d'; ctx.fillRect(0, 0, W, H);
  const rects = [];
  for (let n = cs.first; n <= cs.last; n++) {
    const b = layout.books[n];
    const x = Math.round((b.x - b.w / 2 + CASE.width / 2) * ppm);
    const w = Math.max(2, Math.round(b.w * ppm)), h = Math.round(b.h * ppm);
    const y = b.s * rowH + (rowH - h);
    paintSpine(ctx, players[b.i], x, y, w, h);
    // Texture v runs bottom-up.
    rects.push([x / W, 1 - (y + h) / H, w / W, h / H]);
  }
  return { canvas, rects };
}

// The front cover of the book being opened: leather, a gilt frame, the name, the years and (if ESPN has one)
// the portrait, which is loaded separately and painted in when it arrives.
export function paintCover(p, { width = 512, height = 720, portrait = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const base = eraOf(p).leather;
  const g = ctx.createRadialGradient(width * 0.45, height * 0.4, 40, width / 2, height / 2, height * 0.75);
  g.addColorStop(0, shade(base, 0.06)); g.addColorStop(1, shade(base, -0.1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  // Leather grain.
  for (let k = 0; k < 2400; k++) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + hash(p.i + k) * 0.05})`;
    ctx.fillRect(hash(k + 'x' + p.i) * width, hash(k + 'y') * height, 2, 2);
  }
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(30, 30, width - 60, height - 60);
  ctx.lineWidth = 1.2; ctx.strokeRect(42, 42, width - 84, height - 84);
  ctx.fillStyle = GOLD; ctx.textAlign = 'center';
  ctx.font = `22px ${FACE}`; ctx.fillText('THE NBA PLAYER LIBRARY', width / 2, 92);
  const cy = height * 0.42, r = 118;
  if (portrait) {
    ctx.save(); ctx.beginPath(); ctx.arc(width / 2, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = shade(base, -0.15); ctx.fillRect(width / 2 - r, cy - r, r * 2, r * 2);
    const s = (r * 2.3) / portrait.width;
    ctx.drawImage(portrait, width / 2 - (portrait.width * s) / 2, cy - r * 0.95, portrait.width * s, portrait.height * s);
    ctx.restore();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(width / 2, cy, r + 6, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(width / 2, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `120px ${FACE}`; ctx.textBaseline = 'middle';
    const initials = (p.n || '').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('');
    ctx.fillText(initials, width / 2, cy + 6); ctx.textBaseline = 'alphabetic';
  }
  let size = 52; ctx.font = `${size}px ${FACE}`;
  while (ctx.measureText(p.n).width > width - 110 && size > 24) { size -= 2; ctx.font = `${size}px ${FACE}`; }
  ctx.fillText(p.n, width / 2, height * 0.74);
  ctx.font = `italic 28px ${TEXT}`; ctx.fillText(span(p) || '', width / 2, height * 0.74 + 46);
  return canvas;
}
