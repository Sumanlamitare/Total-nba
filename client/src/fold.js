// Page-fold geometry for turning a page by its corner, the way paper actually folds.
//
// Work in "turn space": the page being turned is the rectangle [0,W]×[0,H] with the spine at x = 0 and the free
// edge at x = W. Grabbing a corner C and moving it to P folds the page along the perpendicular bisector of CP:
// the part on C's side lifts, flips over the fold line, and shows the back of the page.

const dot = (a, b) => a.x * b.x + a.y * b.y;

// Keep the dragged corner where paper can reach: no further from the spine-end at its own edge than the page is
// wide, and no further from the other spine-end than the page's diagonal.
export function clampCorner(P, W, H, top) {
  const near = { x: 0, y: top ? 0 : H }, far = { x: 0, y: top ? H : 0 };
  const lim = (p, c, r) => { const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy); return d > r ? { x: c.x + dx * r / d, y: c.y + dy * r / d } : p; };
  let q = lim(P, near, W);
  q = lim(q, far, Math.hypot(W, H));
  return q;
}

// Clip a polygon to the half-plane where sign * ((X - M) · n) >= 0 (Sutherland–Hodgman, one edge).
function clip(poly, M, n, sign) {
  const out = [];
  const side = p => sign * ((p.x - M.x) * n.x + (p.y - M.y) * n.y);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}

// The fold for corner C dragged to P. Returns null when there is no fold (P at the corner).
export function fold(P, W, H, top) {
  const C = { x: W, y: top ? 0 : H };
  const dx = C.x - P.x, dy = C.y - P.y, len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const n = { x: dx / len, y: dy / len };              // points from P toward the corner
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 }; // the fold line passes here, perpendicular to n
  const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const front = clip(rect, M, n, -1);                  // the part still lying flat
  const lifted = clip(rect, M, n, 1);                  // the part that has lifted off
  const reflect = p => { const k = 2 * ((p.x - M.x) * n.x + (p.y - M.y) * n.y); return { x: p.x - k * n.x, y: p.y - k * n.y }; };
  return { C, P, M, n, len, front, lifted, flap: lifted.map(reflect), reflect };
}

// How far through the turn a corner position is: 0 at the start, 1 when it lies flat on the other side.
export const progress = (P, W) => Math.max(0, Math.min(1, (W - P.x) / (2 * W)));

// The path a corner follows in a turn that isn't being dragged: across, with a lift in the middle.
export function arc(t, W, H, top) {
  const y0 = top ? 0 : H;
  const x = W - 2 * W * t;
  const lift = Math.sin(Math.PI * t) * H * 0.2;
  return { x, y: top ? y0 + lift : y0 - lift };
}

export const pts = poly => poly.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ');
export const svgPts = poly => poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
export { dot };
