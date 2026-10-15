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

// ---- Pages inside the 3D book (they match the reader's first spread, so the hand-off is seamless) -------------

const PAPER = '#f6eedb';
function paper(width, height, edge = 'left') {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, width, 0);
  if (edge === 'left') { g.addColorStop(0, '#dccaa0'); g.addColorStop(0.08, PAPER); g.addColorStop(1, PAPER); }
  else { g.addColorStop(0, PAPER); g.addColorStop(0.92, PAPER); g.addColorStop(1, '#dccaa0'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

// Hand-marbled endpaper: combed colour stripes pushed around by layered waves.
export function paintMarble(width = 512, height = 720, seed = 3) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const colors = ['#5c1f18', '#1f3355', '#b88c45', '#e8dcc0', '#24453f', '#7a2a20', '#2a2f52', '#c9a25a'];
  const img = ctx.createImageData(width, height);
  const rgb = colors.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  const s = seed * 1.7;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const d = 0.09 * Math.sin(u * 9 + s + Math.sin(v * 7 + s) * 2) + 0.05 * Math.sin(u * 23 - v * 11 + s * 2) + 0.03 * Math.sin(v * 31 + u * 5);
    const band = Math.floor(((v + d) * 26 + 64) % colors.length);
    const c = rgb[band], o = (y * width + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function paintHalfTitle(p, width = 512, height = 720) {
  const { canvas, ctx } = paper(width, height, 'left');
  ctx.fillStyle = '#2a2118'; ctx.textAlign = 'center';
  let size = 34; ctx.font = `${size}px ${FACE}`;
  while (ctx.measureText(p.n).width > width - 140 && size > 18) { size -= 2; ctx.font = `${size}px ${FACE}`; }
  ctx.fillText(p.n, width / 2, height * 0.36);
  ctx.strokeStyle = '#9c7a3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(width / 2 - 40, height * 0.36 + 22); ctx.lineTo(width / 2 + 40, height * 0.36 + 22); ctx.stroke();
  return canvas;
}

export function paintBookplate(p, shelfMark, width = 512, height = 720) {
  const { canvas, ctx } = paper(width, height, 'right');
  const w = 240, h = 170, x = (width - w) / 2, y = height * 0.42 - h / 2;
  ctx.fillStyle = '#f9f2e1'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8d6a33'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a2f24'; ctx.font = `italic 18px ${TEXT}`; ctx.fillText('Ex libris', width / 2, y + 34);
  ctx.fillStyle = '#2a2118'; ctx.font = `22px ${FACE}`; ctx.fillText('The Player Library', width / 2, y + 64);
  ctx.font = `italic 19px ${TEXT}`; ctx.fillText(p.n, width / 2, y + 102);
  if (shelfMark) { ctx.fillStyle = '#5b4a38'; ctx.font = `15px ${TEXT}`; ctx.fillText(shelfMark, width / 2, y + 136); }
  return canvas;
}

export function paintTitlePage(p, { width = 512, height = 720, portrait = null } = {}) {
  const { canvas, ctx } = paper(width, height, 'left');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5b4a38'; ctx.font = `16px ${FACE}`; ctx.fillText('T H E   P L A Y E R   L I B R A R Y', width / 2, 96);
  const cy = 230, r = 78;
  ctx.fillStyle = '#fbf3e0'; ctx.beginPath(); ctx.arc(width / 2, cy, r, 0, Math.PI * 2); ctx.fill();
  if (portrait) {
    ctx.save(); ctx.beginPath(); ctx.arc(width / 2, cy, r, 0, Math.PI * 2); ctx.clip();
    const s = (r * 2.5) / portrait.width;
    ctx.drawImage(portrait, width / 2 - (portrait.width * s) / 2, cy - r * 0.8, portrait.width * s, portrait.height * s);
    ctx.restore();
  } else {
    ctx.fillStyle = '#8a2f24'; ctx.font = `64px ${FACE}`; ctx.textBaseline = 'middle';
    ctx.fillText((p.n || '').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join(''), width / 2, cy + 4);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.strokeStyle = '#c49a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(width / 2, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2a2118';
  let size = 46; ctx.font = `${size}px ${FACE}`;
  while (ctx.measureText(p.n).width > width - 90 && size > 22) { size -= 2; ctx.font = `${size}px ${FACE}`; }
  ctx.fillText(p.n, width / 2, 380);
  ctx.fillStyle = '#5b4a38'; ctx.font = `italic 22px ${TEXT}`; ctx.fillText(span(p) || '', width / 2, 418);
  ctx.strokeStyle = '#8d6a33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(width / 2 - 50, 446); ctx.lineTo(width / 2 + 50, 446); ctx.stroke();
  return canvas;
}
