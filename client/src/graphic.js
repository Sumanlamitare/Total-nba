// Draws the shareable "Top 10" graphic on a canvas (1080x1350, 4:5 — sized for social feeds).
// Everything is laid out from measured text widths, so long names shrink or get an ellipsis
// instead of running into the photo or the number.
import { fmt } from './util.js';

const W = 1080, H = 1350, PAD = 72;
// older Safari/Firefox lack roundRect
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}
const C = { bg: '#050507', ink: '#f2ede4', dim: 'rgba(242,237,228,.62)', faint: 'rgba(242,237,228,.18)', gold: '#e3c48c', gold2: '#b8975c' };
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const loadImg = src => new Promise(res => {
  if (!src) return res(null);
  const img = new Image();
  const t = setTimeout(() => res(null), 8000);
  img.onload = () => { clearTimeout(t); res(img.naturalWidth ? img : null); };
  img.onerror = () => { clearTimeout(t); res(null); };
  img.src = src;
});

// letter-spaced text (canvas letterSpacing isn't available everywhere)
function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  return width;
}

// largest font size (down to min) at which text fits; then ellipsis if it still doesn't
function fit(ctx, text, maxW, size, min, font) {
  for (let s = size; s >= min; s -= 1) { ctx.font = font(s); if (ctx.measureText(text).width <= maxW) return text; }
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

const initials = n => (n || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('');

function avatar(ctx, img, name, cx, cy, r, highlight) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy - r * .4, r * .1, cx, cy, r);
  g.addColorStop(0, '#2b261d'); g.addColorStop(1, '#0d0d11');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  if (img) {
    // cover-crop to a square from the top-centre of the headshot (where the face is), no stretching
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2, sy = 0;
    ctx.drawImage(img, sx, sy, side, side, cx - r, cy - r * .92, r * 2, r * 2);
  } else {
    ctx.fillStyle = C.dim; ctx.font = `${Math.round(r * .7)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), cx, cy + 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = highlight ? 3 : 2; ctx.strokeStyle = highlight ? C.gold : 'rgba(227,196,140,.35)'; ctx.stroke();
}

/**
 * @param {{ statLabel: string, statLong: string, title: string, subtitle: string,
 *           rows: { name: string, value: number, detail?: string, img?: string }[] }} g
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function drawGraphic(g) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const imgs = await Promise.all(g.rows.map(r => loadImg(r.img)));

  // background: court darkness, gold light from the top, subtle diagonal texture, vignette
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let grad = ctx.createRadialGradient(W * .5, -H * .1, 0, W * .5, -H * .1, H * .95);
  grad.addColorStop(0, 'rgba(227,196,140,.20)'); grad.addColorStop(1, 'rgba(227,196,140,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.strokeStyle = 'rgba(242,237,228,.025)'; ctx.lineWidth = 1;
  for (let x = -H; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
  ctx.restore();
  grad = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .85);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  // card border
  ctx.strokeStyle = 'rgba(227,196,140,.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(28, 28, W - 56, H - 56, 40); ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  // wordmark
  ctx.fillStyle = C.ink; ctx.font = `300 46px ${SERIF}`;
  const wTotal = spaced(ctx, 'TOTAL', PAD, 128, 7);
  ctx.fillStyle = C.gold; ctx.font = `700 46px ${SERIF}`;
  spaced(ctx, 'NBA', PAD + wTotal + 7, 128, 7);
  // period, right-aligned on the wordmark line
  ctx.fillStyle = C.dim; ctx.font = `500 24px ${SANS}`;
  ctx.textAlign = 'left';
  spaced(ctx, g.title.toUpperCase(), W - PAD, 124, 4, 'right');

  // TOP 10 + stat + context line
  ctx.fillStyle = C.gold; ctx.font = `700 28px ${SANS}`;
  spaced(ctx, 'TOP 10', PAD, 228, 12);
  ctx.fillStyle = C.ink;
  const statText = fit(ctx, g.statLong.toUpperCase(), W - PAD * 2, 92, 52, s => `400 ${s}px ${SERIF}`);
  ctx.fillText(statText, PAD, 318);
  ctx.fillStyle = C.dim; ctx.font = `500 22px ${SANS}`;
  const sub = fit(ctx, g.subtitle.toUpperCase(), W - PAD * 2, 22, 16, s => `500 ${s}px ${SANS}`);
  spaced(ctx, sub, PAD, 366, 3);
  // divider
  grad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  grad.addColorStop(0, C.gold); grad.addColorStop(1, 'rgba(227,196,140,0)');
  ctx.fillStyle = grad; ctx.fillRect(PAD, 398, W - PAD * 2, 2);

  // rows
  const top = 426, bottom = 1222, rowH = (bottom - top) / 10;
  const rankX = PAD, photoCX = PAD + 118, photoR = 31, nameX = photoCX + photoR + 28, valueX = W - PAD;
  g.rows.slice(0, 10).forEach((r, i) => {
    const y = top + i * rowH, cy = y + rowH / 2;
    if (i === 0) {
      const hl = ctx.createLinearGradient(PAD - 16, 0, W - PAD + 16, 0);
      hl.addColorStop(0, 'rgba(227,196,140,.16)'); hl.addColorStop(1, 'rgba(227,196,140,.02)');
      ctx.fillStyle = hl; ctx.beginPath(); ctx.roundRect(PAD - 16, y + 4, W - PAD * 2 + 32, rowH - 8, 18); ctx.fill();
    } else if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.beginPath(); ctx.roundRect(PAD - 16, y + 4, W - PAD * 2 + 32, rowH - 8, 18); ctx.fill();
    }
    // rank
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = i < 3 ? C.gold : C.dim; ctx.font = `400 ${i < 3 ? 40 : 34}px ${SERIF}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), rankX, cy + 2);
    avatar(ctx, imgs[i], r.name, photoCX, cy, photoR, i === 0);
    // value (measured first so the name gets the rest of the width)
    const value = fmt(r.value);
    ctx.textAlign = 'right'; ctx.fillStyle = i === 0 ? C.gold : C.ink; ctx.font = `400 46px ${SERIF}`;
    const vw = ctx.measureText(value).width;
    ctx.fillText(value, valueX, cy + 2);
    // name + detail
    ctx.textAlign = 'left';
    const maxName = valueX - vw - 32 - nameX;
    ctx.fillStyle = C.ink;
    const name = fit(ctx, r.name, maxName, 34, 24, s => `400 ${s}px ${SERIF}`);
    ctx.fillText(name, nameX, cy - (r.detail ? 13 : 0));
    if (r.detail) {
      ctx.fillStyle = C.dim;
      const det = fit(ctx, r.detail.toUpperCase(), maxName, 18, 14, s => `500 ${s}px ${SANS}`);
      spaced(ctx, det, nameX, cy + 22, 2);
    }
  });
  if (!g.rows.length) {
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = `400 34px ${SERIF}`;
    ctx.fillText('No games for this selection', W / 2, (top + bottom) / 2);
  }

  // footer
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.faint; ctx.fillRect(PAD, 1250, W - PAD * 2, 1);
  ctx.fillStyle = C.dim; ctx.font = `500 18px ${SANS}`;
  spaced(ctx, 'TOTALNBA', PAD, 1290, 5);
  spaced(ctx, `${g.statLabel} · DATA: ESPN`, W - PAD, 1290, 4, 'right');
  return canvas;
}

export const toBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));
