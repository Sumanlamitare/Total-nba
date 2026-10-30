// The diagram layout engine: shapes for 1–5 criteria, and a position for every qualifying player inside his exact
// region. It only reads the engine's regions; it never decides who qualifies.
//
// Shapes: circles for 1–3 criteria; for 4 and 5, ellipse arrangements found by search (tools/venn-search.mjs) so that
// every one of the 15 / 31 combinations has its own region, i.e. true Venn diagrams rather than misleading ones. 6+
// criteria use the intersection (UpSet-style) view instead (see upset.js).
//
// Placement: the canvas is sampled on a grid; each cell gets the mask of the shapes containing it. For each region the
// cell farthest from its border is its center; player slots (headshot + name) are laid on a hexagonal lattice around
// it, and a slot counts only if the whole headshot and name sit inside that same region. Players fill the slots
// nearest the center. When a region has more players than slots, headshots shrink; at the smallest size the canvas
// grows. Nobody is hidden.

export const MAX_VENN = 5;

// Unit-space shapes { cx, cy, rx, ry, rot } for n criteria.
export function baseShapes(n) {
  if (n === 1) return [{ cx: 0, cy: 0, rx: 0.9, ry: 0.9, rot: 0 }];
  if (n === 2) return [-0.42, 0.42].map(cx => ({ cx, cy: 0, rx: 0.78, ry: 0.78, rot: 0 }));
  if (n === 3) return [-90, 30, 150].map(a => ({ cx: 0.42 * Math.cos((a * Math.PI) / 180), cy: 0.42 * Math.sin((a * Math.PI) / 180), rx: 0.72, ry: 0.72, rot: 0 }));
  if (n === 4) {
    const p = { dx: 0.123, dx2: 0.293, dy: 0.301, dy2: 0.265, a: 1.048, b: 0.394, th: 0.589 };
    return [
      { cx: -p.dx, cy: -p.dy, rx: p.a, ry: p.b, rot: p.th }, { cx: -p.dx2, cy: p.dy2 - p.dy, rx: p.a, ry: p.b, rot: p.th },
      { cx: p.dx2, cy: p.dy2 - p.dy, rx: p.a, ry: p.b, rot: -p.th }, { cx: p.dx, cy: -p.dy, rx: p.a, ry: p.b, rot: -p.th },
    ];
  }
  if (n === 5) {
    const p = { d: 0.2478, a: 0.818, b: 0.4236, phi: 0.2692 };
    return Array.from({ length: 5 }, (_, i) => { const t = (2 * Math.PI * i) / 5 - Math.PI / 2; return { cx: p.d * Math.cos(t), cy: p.d * Math.sin(t), rx: p.a, ry: p.b, rot: t + p.phi }; });
  }
  throw new Error(`No Venn layout for ${n} criteria`);
}

export const inShape = (e, x, y) => {
  const c = Math.cos(-e.rot), s = Math.sin(-e.rot), dx = x - e.cx, dy = y - e.cy, u = dx * c - dy * s, v = dx * s + dy * c;
  return (u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1;
};
export const maskAt = (shapes, x, y) => shapes.reduce((m, e, i) => (inShape(e, x, y) ? m | (1 << i) : m), 0);
const extent = e => ({ hw: Math.sqrt((e.rx * Math.cos(e.rot)) ** 2 + (e.ry * Math.sin(e.rot)) ** 2), hh: Math.sqrt((e.rx * Math.sin(e.rot)) ** 2 + (e.ry * Math.cos(e.rot)) ** 2) });

// Approximate label width in px for a font size (condensed sans, mixed case).
export const textWidth = (s, f) => String(s || '').length * f * 0.56;

// Apply user adjustments (offsets in unit space, size multipliers) to the base shapes.
export function adjustedShapes(n, adjust = []) {
  return baseShapes(n).map((e, i) => {
    const a = adjust[i] || {};
    return { ...e, cx: e.cx + (+a.dx || 0), cy: e.cy + (+a.dy || 0), rx: e.rx * (+a.scale || 1), ry: e.ry * (+a.scale || 1) };
  });
}

// regions: [{ mask, players: [{ id, label }] }] (from the engine). Options: size (px of the square diagram), r (headshot
// radius), names (show labels), adjust (per-shape { dx, dy, scale }), counts (place count badges).
// -> { size (longer side), width, height, shapes (px), nodes: [{ id, x, y, r, mask }], badges: [{ mask, x, y, count }], labels: [{ i, x, y, dx, dy }],
//      r, font, ok, missing: [masks whose region no longer exists but has players] }
export function layoutVenn(n, regions, { size = 1000, r = 34, minR = 11, names = true, adjust = [], counts = true, labelSpace = 0.1 } = {}) {
  const unit = adjustedShapes(n, adjust);
  let D = size, R = r;
  for (let iter = 0; iter < 60; iter++) {
    const res = attempt(unit, n, regions, D, R, names, counts, labelSpace);
    if (res.ok || res.missing.length) return { ...res, size: D };
    if (R > minR) R = Math.max(minR, R * 0.9);
    else D = Math.round(D * 1.15);
  }
  return { ...attempt(unit, n, regions, D, R, names, counts, labelSpace), size: D, ok: false };
}

function attempt(unit, n, regions, D, R, names, counts, labelSpace) {
  // Fit the shapes in the square with room for the criterion labels around them.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of unit) { const { hw, hh } = extent(e); x0 = Math.min(x0, e.cx - hw); x1 = Math.max(x1, e.cx + hw); y0 = Math.min(y0, e.cy - hh); y1 = Math.max(y1, e.cy + hh); }
  // The canvas follows the shapes' proportions (D is its longer side).
  const m = D * labelSpace, s = (D - 2 * m) / Math.max(x1 - x0, y1 - y0);
  const CW = (x1 - x0) * s + 2 * m, CH = (y1 - y0) * s + 2 * m;
  const ox = CW / 2 - ((x0 + x1) / 2) * s, oy = CH / 2 - ((y0 + y1) / 2) * s;
  const shapes = unit.map(e => ({ cx: ox + e.cx * s, cy: oy + e.cy * s, rx: e.rx * s, ry: e.ry * s, rot: e.rot }));
  const at = (x, y) => (x < 0 || y < 0 || x > CW || y > CH ? -1 : maskAt(shapes, x, y));

  // Grid of masks and each cell's distance to its region's border.
  const g = Math.max(3, D / 240), W = Math.ceil(CW / g), H = Math.ceil(CH / g);
  const grid = new Int16Array(W * H), dist = new Float32Array(W * H).fill(Infinity), queue = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = maskAt(shapes, (i + 0.5) * g, (j + 0.5) * g);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (N4.some(([a, b]) => { const ii = i + a, jj = j + b; return ii < 0 || jj < 0 || ii >= W || jj >= H || grid[jj * W + ii] !== grid[k]; })) { dist[k] = 1; queue.push(k); }
  }
  for (let h = 0; h < queue.length; h++) {
    const p = queue[h], i = p % W, j = (p / W) | 0;
    for (const [a, b] of N4) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const k = jj * W + ii; if (grid[k] === grid[p] && dist[k] > dist[p] + 1) { dist[k] = dist[p] + 1; queue.push(k); } }
  }
  const center = new Map(), bbox = new Map();
  for (let k = 0; k < W * H; k++) {
    const mk = grid[k]; if (mk <= 0) continue;
    const x = ((k % W) + 0.5) * g, y = (((k / W) | 0) + 0.5) * g;
    const c = center.get(mk); if (!c || dist[k] > c.d) center.set(mk, { x, y, d: dist[k] });
    const b = bbox.get(mk) || { x0: x, x1: x, y0: y, y1: y }; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); bbox.set(mk, b);
  }

  const font = Math.max(9, Math.min(22, R * 0.5));
  const nameH = names ? font * 1.3 + 3 : 0;
  const nodes = [], badges = [], missing = [];
  let ok = true;
  for (const reg of regions) {
    const k = reg.players.length;
    if (!k) continue;
    const c = center.get(reg.mask), b = bbox.get(reg.mask);
    if (!c) { missing.push(reg.mask); ok = false; continue; }
    const longest = Math.max(...reg.players.map(p => textWidth(p.label, font)));
    const w = Math.max(2 * R + 6, Math.min(longest, 3.4 * R)) + 4, h = 2 * R + nameH;
    const sx = w + 3, sy = h + 4;
    // Candidate slots on a hex lattice centred on the region's center; the slot's anchor is the headshot's center.
    const cands = [];
    const rows = Math.ceil((b.y1 - b.y0) / sy) + 2, cols = Math.ceil((b.x1 - b.x0) / sx) + 2;
    const cy0 = c.y - (nameH / 2);
    for (let jr = -rows; jr <= rows; jr++) {
      const y = cy0 + jr * sy;
      if (y < b.y0 - sy || y > b.y1 + sy) continue;
      const off = (jr & 1) ? sx / 2 : 0;
      for (let ic = -cols; ic <= cols; ic++) {
        const x = c.x + ic * sx + off;
        if (x < b.x0 - sx || x > b.x1 + sx) continue;
        if (fits(at, reg.mask, x, y, R, w, nameH)) cands.push({ x, y, d: Math.hypot(x - c.x, (y - cy0) * 1.15) });
      }
    }
    cands.sort((a, b2) => a.d - b2.d);
    if (cands.length < k) { ok = false; continue; }
    reg.players.forEach((p, i) => nodes.push({ id: p.id, x: cands[i].x, y: cands[i].y, r: R, mask: reg.mask, w }));
    if (counts) {
      const bR = Math.max(10, font * 0.9);
      const slot = cands.slice(k).find(s => fits(at, reg.mask, s.x, s.y, bR, 2 * bR, 0));
      badges.push({ mask: reg.mask, count: k, ...(slot ? { x: slot.x, y: slot.y } : { x: cands[k - 1].x, y: cands[k - 1].y - R - bR, over: true }) });
    }
  }
  // Criterion labels: just outside each shape, on the side facing away from the diagram's middle.
  const mx = CW / 2, my = CH / 2;
  const labels = shapes.map((e, i) => {
    let dx = e.cx - mx, dy = e.cy - my, len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = 0; dy = -1; len = 1; }
    dx /= len; dy /= len;
    let best = null;
    for (let t = 0; t < 128; t++) {
      const a = (2 * Math.PI * t) / 128, u = e.rx * Math.cos(a), v = e.ry * Math.sin(a);
      const x = e.cx + u * Math.cos(e.rot) - v * Math.sin(e.rot), y = e.cy + u * Math.sin(e.rot) + v * Math.cos(e.rot);
      const score = (x - mx) * dx + (y - my) * dy;
      if (!best || score > best.score) best = { x, y, score };
    }
    return { i, x: best.x + dx * D * 0.035, y: best.y + dy * D * 0.035, dx, dy };
  });
  return { shapes, nodes, badges, labels, r: R, font, ok, missing, nameH, width: CW, height: CH };
}

// Do a headshot (radius r at x, y) and its name (w wide, nameH tall, under it) sit wholly inside the region?
function fits(at, mask, x, y, r, w, nameH) {
  const pts = [[x, y]];
  for (let t = 0; t < 12; t++) { const a = (2 * Math.PI * t) / 12; pts.push([x + (r + 2) * Math.cos(a), y + (r + 2) * Math.sin(a)]); }
  if (nameH) { const yt = y + r + 2, yb = y + r + nameH; for (const xx of [x - w / 2, x - w / 4, x, x + w / 4, x + w / 2]) pts.push([xx, yt], [xx, yb]); }
  return pts.every(([px, py]) => at(px, py) === mask);
}
