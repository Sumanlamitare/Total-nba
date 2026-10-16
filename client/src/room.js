// The library: a bright hall of double-sided shelving rows, one book per player, walked in first person.
//
// Performance model
//  - Each bay (bookcase) draws its books with one InstancedMesh; all woodwork in the hall is one InstancedMesh.
//  - Spines are painted into one canvas atlas per bay, only for the nearest bays in view; the rest show plain
//    cloth in the team colour. Atlases are built one per frame and freed when you walk away.
//  - The scene renders only when something moves.
import * as THREE from 'three';
import { CASE, shelfY, HALL, hallPlan, spineColor, teamCloth } from './shelves.js';
import { paintCase, paintSpine, paintCover } from './spines.js';

const UP = new THREE.Vector3(0, 1, 0);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = 'Barlow, "Helvetica Neue", Arial, sans-serif';
const angleTo = (from, to) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return from + d; };

// Book material: the spine face (+z) samples the bay atlas at the book's rectangle, the top shows page edges,
// everything else is plain cloth (instance colour).
function bookMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.02 });
  m.userData.atlas = { value: null };
  m.userData.has = { value: 0 };
  m.customProgramCacheKey = () => 'book-v2';
  m.onBeforeCompile = sh => {
    sh.uniforms.uAtlas = m.userData.atlas;
    sh.uniforms.uHas = m.userData.has;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 spineRect;\nvarying vec2 vSpineUv;\nvarying float vFace;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSpineUv = spineRect.xy + uv * spineRect.zw;\nvFace = normal.z > 0.5 ? 1.0 : (normal.y > 0.5 ? 2.0 : 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas;\nuniform float uHas;\nvarying vec2 vSpineUv;\nvarying float vFace;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFace > 1.5) diffuseColor.rgb = vec3(0.86, 0.84, 0.78);
        else if (vFace > 0.5 && uHas > 0.5) diffuseColor.rgb = texture2D(uAtlas, vSpineUv).rgb;`);
  };
  return m;
}

function canvasTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function oakTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a57c'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 256;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,84,48' : '235,210,170'},${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.6 + Math.random() * 1.8; g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y / 70 + i) * 3, y);
    g.stroke();
  }
  return canvasTexture(c);
}

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d5ce'; g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.035)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  g.strokeStyle = 'rgba(80,74,66,0.22)'; g.lineWidth = 2;
  for (let k = 0; k <= 512; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
  return canvasTexture(c, [12, 12]);
}

// A modern bay sign: dark panel, a stripe in the team colour, the name in white condensed capitals.
function signTexture(text, sub, color) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2125'; g.fillRect(0, 0, 1024, 224);
  g.fillStyle = color || '#888'; g.fillRect(0, 0, 22, 224);
  g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
  let size = 104; g.font = `700 ${size}px ${COND}`;
  const t = text.toUpperCase();
  while (g.measureText(t).width > 940 && size > 44) { size -= 4; g.font = `700 ${size}px ${COND}`; }
  g.fillText(t, 58, sub ? 90 : 112);
  if (sub) { g.font = `500 44px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText(sub, 60, 172); }
  return canvasTexture(c);
}

// The sign on the end of each shelving row: row number and the teams down each side.
function rowSignTexture(row, left, right) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2125'; g.fillRect(0, 0, 512, 1024);
  g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `500 40px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('ROW', 44, 92);
  g.font = `700 170px ${COND}`; g.fillStyle = '#ffffff'; g.fillText(String(row), 40, 250);
  const list = (title, teams, y) => {
    g.font = `600 30px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(title, 44, y);
    y += 20;
    for (const t of teams) {
      y += 58;
      g.fillStyle = teamCloth(t); g.fillRect(44, y - 34, 10, 40);
      g.fillStyle = '#ffffff'; g.font = `600 46px ${COND}`; g.fillText((t.short || t.name).toUpperCase(), 72, y);
    }
    return y + 40;
  };
  let y = list('◀ LEFT', left, 340);
  list('RIGHT ▶', right, y + 10);
  return canvasTexture(c);
}

export class Room {
  constructor(canvas, { players, layout, mobile = false, reducedMotion = false, onHover, onSelect, onOpenRequest, onOpened, onStation, onFrame, onContextLost }) {
    this.canvas = canvas; this.players = players; this.layout = layout;
    this.mobile = mobile; this.reducedMotion = reducedMotion;
    this.cb = { onHover, onSelect, onOpenRequest, onOpened, onStation, onFrame, onContextLost };
    this.disposables = [];
    this.atlases = new Map(); // bay index -> { texture }
    this.ppm = mobile ? 460 : 700;
    this.maxAtlases = mobile ? 6 : 12;
    this.hovered = -1; this.selected = -1; this.pull = new Map();
    this.anim = null; this.dirty = true;
    this.plan = hallPlan(layout);
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9e6e0');
    this.scene.fog = new THREE.Fog('#e9e6e0', 16, 42);
    this.heroScene = new THREE.Scene(); // the opened book draws on top, so it never clips into a shelf
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 90);

    // First-person rig: position on the floor, yaw (0 = looking down the hall, -z) and pitch.
    const start = { x: 0, z: HALL.front - 1.2, yaw: 0, pitch: -0.04 };
    this.view = { ...start };
    this.goal = { ...start };

    this.build();
    this.resize();
    this.bind();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---- construction -----------------------------------------------------------------------------------------

  bayFrame(i) {
    const b = this.plan.bays[i];
    return new THREE.Matrix4().makeTranslation(b.x, 0, b.z).multiply(new THREE.Matrix4().makeRotationY(b.rot));
  }

  build() {
    const { scene, layout, players, plan } = this;
    const sky = new THREE.HemisphereLight('#ffffff', '#b8b0a3', 1.25);
    const sun = new THREE.DirectionalLight('#fff4e2', 1.1); sun.position.set(-6, 12, 8);
    scene.add(sky, sun);
    this.heroScene.add(sky.clone(), sun.clone());

    // The hall: floor, walls with tall windows, a ceiling with light strips over each aisle.
    const W = plan.W + 2, D = plan.z1 - plan.z0, cz = (plan.z1 + plan.z0) / 2;
    const ft = floorTexture(); this.disposables.push(ft);
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); this.disposables.push(geo, mat); return m; };
    const floor = mk(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz); floor.userData.floor = true; scene.add(floor);
    this.floor = floor;
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.95 });
    const wall = (w, x, z, ry) => { const m = mk(new THREE.PlaneGeometry(w, HALL.ceiling), wallMat.clone()); m.position.set(x, HALL.ceiling / 2, z); m.rotation.y = ry; scene.add(m); };
    wall(W, 0, plan.z0, 0); wall(W, 0, plan.z1, Math.PI); wall(D, -W / 2, cz, Math.PI / 2); wall(D, W / 2, cz, -Math.PI / 2);
    const glass = new THREE.MeshStandardMaterial({ color: '#dfe9f2', emissive: '#e8f1fa', emissiveIntensity: 0.85, roughness: 0.2 });
    for (const side of [-1, 1]) for (let z = plan.z0 + 2.5; z < plan.z1 - 1.5; z += 3.2) {
      const win = mk(new THREE.PlaneGeometry(1.8, 3.4), glass.clone());
      win.position.set(side * (W / 2 - 0.01), 2.3, z); win.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(win);
    }
    const ceil = mk(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#f6f4f0', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HALL.ceiling, cz); scene.add(ceil);
    const stripMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7ea', emissiveIntensity: 1.4 });
    for (let r = 0; r <= plan.rows; r++) {
      const x = plan.rowX(r) - HALL.pitch / 2;
      const strip = mk(new THREE.BoxGeometry(0.12, 0.04, D - 2), stripMat.clone()); strip.position.set(x, HALL.ceiling - 0.02, cz); scene.add(strip);
    }

    // Woodwork: every board of every bay, plus the end panels of the rows, in one instanced mesh.
    const boards = [];
    const Wb = CASE.width, H = CASE.height, Dd = CASE.depth, bd = CASE.board, s = CASE.side;
    layout.cases.forEach((cs, i) => {
      const F = this.bayFrame(i);
      const add = (x, y, z, sx, sy, sz, tone = 1) => boards.push({ m: F.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz))), tone });
      add(-Wb / 2 - s / 2, H / 2, 0, s, H, Dd); add(Wb / 2 + s / 2, H / 2, 0, s, H, Dd);
      add(0, H + 0.03, 0, Wb + 2 * s, 0.06, Dd); add(0, 0.05, 0, Wb + 2 * s, 0.1, Dd + 0.01, 0.8);
      add(0, H / 2, -Dd / 2 + 0.01, Wb, H, 0.02, 0.85);
      for (let k = 0; k < CASE.shelves; k++) add(0, 0.1 + k * CASE.shelfGap - bd / 2, 0, Wb, bd, Dd);
    });
    for (let r = 0; r < plan.rows; r++) for (const z of [0.03, -HALL.rowLen - 0.03]) {
      boards.push({ m: new THREE.Matrix4().makeTranslation(plan.rowX(r), H / 2 + 0.03, z).multiply(new THREE.Matrix4().makeScale(HALL.rowT + 0.04, H + 0.06, 0.06)), tone: 0.95 });
    }
    const ot = oakTexture(); this.disposables.push(ot);
    const boardGeo = new THREE.BoxGeometry(1, 1, 1), boardMat = new THREE.MeshStandardMaterial({ map: ot, roughness: 0.55 });
    const woodwork = new THREE.InstancedMesh(boardGeo, boardMat, boards.length);
    boards.forEach((bd2, k) => { woodwork.setMatrixAt(k, bd2.m); woodwork.setColorAt(k, new THREE.Color().setScalar(bd2.tone)); });
    woodwork.userData.solid = true;
    scene.add(woodwork); this.disposables.push(boardGeo, boardMat);

    // Signs: one above each bay, one on the entrance end of each row.
    const signGeo = new THREE.PlaneGeometry(Wb + 0.06, 0.23); this.disposables.push(signGeo);
    layout.cases.forEach((cs, i) => {
      const sub = cs.team.cases > 1 ? cs.range : `${cs.team.count.toLocaleString('en-US')} players`;
      const t = signTexture(cs.team.cases > 1 ? cs.label : cs.team.name, sub, teamCloth(cs.team));
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35 });
      const sign = new THREE.Mesh(signGeo, mat);
      sign.applyMatrix4(this.bayFrame(i).multiply(new THREE.Matrix4().makeTranslation(0, H + 0.2, Dd / 2 - 0.02)));
      scene.add(sign); this.disposables.push(t, mat);
    });
    const rowGeo = new THREE.PlaneGeometry(HALL.rowT - 0.04, (HALL.rowT - 0.04) * 2); this.disposables.push(rowGeo);
    for (let r = 0; r < plan.rows; r++) {
      const left = plan.faces[r * 2]?.teams || [], right = plan.faces[r * 2 + 1]?.teams || [];
      const t = rowSignTexture(r + 1, left, right);
      const mat = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3, roughness: 0.6 });
      const sign = new THREE.Mesh(rowGeo, mat);
      sign.position.set(plan.rowX(r), 1.95, 0.07); scene.add(sign); this.disposables.push(t, mat);
    }

    // Books: one instanced mesh per bay.
    this.bookGeo = new THREE.BoxGeometry(1, 1, 1); this.disposables.push(this.bookGeo);
    this.caseMeshes = layout.cases.map((cs, i) => {
      const count = cs.last - cs.first + 1;
      const mat = bookMaterial();
      const mesh = new THREE.InstancedMesh(this.bookGeo, mat, Math.max(count, 1));
      mesh.count = count;
      mesh.geometry = this.bookGeo.clone();
      mesh.geometry.setAttribute('spineRect', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(count, 1) * 4), 4));
      mesh.applyMatrix4(this.bayFrame(i)); mesh.userData = { caseIndex: i, first: cs.first };
      for (let n = cs.first; n <= cs.last; n++) {
        this.setBookMatrix(mesh, n, 0);
        mesh.setColorAt(n - cs.first, new THREE.Color(spineColor(players[layout.books[n].i], cs.team)));
      }
      mesh.computeBoundingSphere();
      scene.add(mesh); this.disposables.push(mesh.geometry, mat);
      return mesh;
    });

    // Bookends, dark steel.
    const ends = layout.cases.flatMap((cs, i) => cs.ends.map(e => ({ i, ...e })));
    const endGeo = new THREE.BoxGeometry(0.01, 0.19, 0.15), endMat = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.4, metalness: 0.6 });
    const bookends = new THREE.InstancedMesh(endGeo, endMat, Math.max(1, ends.length));
    ends.forEach((e, k) => bookends.setMatrixAt(k, this.bayFrame(e.i).multiply(new THREE.Matrix4().makeTranslation(e.x + 0.012, shelfY(e.s) + 0.095, CASE.depth / 2 - 0.1))));
    bookends.count = ends.length;
    scene.add(bookends); this.disposables.push(endGeo, endMat);

    // A ring on the floor where a click would walk to.
    this.ring = mk(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: '#2b6fd6', transparent: true, opacity: 0.7 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);

    this.hero = null;
  }

  bookLocal(n, pull = 0) {
    const b = this.layout.books[n];
    const z = CASE.depth / 2 - b.d / 2 - 0.01 + pull;
    return new THREE.Matrix4().makeTranslation(b.x, shelfY(b.s) + b.h / 2, z).multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d));
  }

  setBookMatrix(mesh, n, pull) {
    mesh.setMatrixAt(n - mesh.userData.first, pull < 0 ? new THREE.Matrix4().makeScale(0, 0, 0) : this.bookLocal(n, pull));
    mesh.instanceMatrix.needsUpdate = true;
  }

  caseOfBook(n) { return this.layout.books[n].c; }

  // ---- atlases (spine lettering) ----------------------------------------------------------------------------

  // The nearest bays that are in front of you.
  nearBays(limit = this.maxAtlases, range = 10) {
    const v = this.view, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const out = [];
    this.plan.bays.forEach((b, i) => {
      const dx = b.x - v.x, dz = b.z - v.z, d = Math.hypot(dx, dz);
      if (d > range) return;
      const front = (dx * fx + dz * fz) / (d || 1);
      if (d > 2.2 && front < -0.1) return;
      out.push({ i, d: d - front * 1.5 });
    });
    return out.sort((a, b) => a.d - b.d).slice(0, limit).map(x => x.i);
  }

  updateAtlases() {
    const want = new Set(this.nearBays());
    for (const [i, at] of this.atlases) {
      if (want.has(i)) continue;
      at.texture.dispose(); this.atlases.delete(i);
      const m = this.caseMeshes[i].material; m.userData.atlas.value = null; m.userData.has.value = 0; this.dirty = true;
    }
    for (const i of want) {
      if (this.atlases.has(i)) continue;
      const { canvas, rects } = paintCase(this.players, this.layout, i, this.ppm);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.maxAniso);
      const mesh = this.caseMeshes[i];
      const attr = mesh.geometry.getAttribute('spineRect');
      rects.forEach((r, k) => attr.array.set(r, k * 4));
      attr.needsUpdate = true;
      mesh.material.userData.atlas.value = texture; mesh.material.userData.has.value = 1;
      this.atlases.set(i, { texture });
      this.dirty = true;
      return; // one per frame keeps walking smooth
    }
  }

  // ---- moving about -----------------------------------------------------------------------------------------

  // Keep a point out of the shelving rows and inside the walls.
  resolve(p) {
    const m = 0.32, plan = this.plan;
    p.x = clamp(p.x, plan.x0 - 0.6 + m, plan.x1 + 0.6 - m);
    p.z = clamp(p.z, plan.z0 + m, plan.z1 - m);
    for (let r = 0; r < plan.rows; r++) {
      const x0 = plan.rowX(r) - HALL.rowT / 2 - m, x1 = plan.rowX(r) + HALL.rowT / 2 + m, z0 = -HALL.rowLen - m, z1 = m;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
        const opts = [[p.x - x0, 'x', x0], [x1 - p.x, 'x', x1], [p.z - z0, 'z', z0], [z1 - p.z, 'z', z1]].sort((a, b) => a[0] - b[0]);
        p[opts[0][1]] = opts[0][2];
      }
    }
    return p;
  }

  walkTo(x, z, { yaw, pitch, instant = false } = {}) {
    const p = this.resolve({ x, z });
    this.goal.x = p.x; this.goal.z = p.z;
    if (yaw != null) this.goal.yaw = angleTo(this.view.yaw, yaw);
    if (pitch != null) this.goal.pitch = pitch;
    if (instant || this.reducedMotion) Object.assign(this.view, this.goal);
    this.dirty = true;
  }

  // Stand in front of a bay, looking at it.
  goToBay(i, { instant = false, dist = 2.1 } = {}) {
    const b = this.plan.bays[i]; if (!b) return;
    const nx = Math.sin(b.rot), nz = Math.cos(b.rot);
    this.walkTo(b.x + nx * dist, b.z + nz * dist, { yaw: Math.atan2(nx, nz), pitch: 0.08, instant });
  }

  // Bring a book into view and mark it (search results land here).
  showBook(n, { instant = false } = {}) {
    const b = this.layout.books[n];
    const world = new THREE.Vector3().setFromMatrixPosition(this.bookLocal(n)).applyMatrix4(this.bayFrame(b.c));
    const bay = this.plan.bays[b.c];
    const nx = Math.sin(bay.rot), nz = Math.cos(bay.rot), d = 1.25;
    this.walkTo(world.x + nx * d, world.z + nz * d, { yaw: Math.atan2(nx, nz), pitch: Math.atan2(world.y - HALL.eye, d), instant });
    this.select(n);
  }

  nextBay(dir) {
    const cur = this.station >= 0 ? this.station : 0;
    this.goToBay(clamp(cur + dir, 0, this.layout.cases.length - 1));
  }

  forward() { return new THREE.Vector3(-Math.sin(this.view.yaw) * Math.cos(this.view.pitch), Math.sin(this.view.pitch), -Math.cos(this.view.yaw) * Math.cos(this.view.pitch)); }

  applyCamera() {
    const v = this.view;
    this.camera.position.set(v.x, HALL.eye, v.z);
    this.camera.lookAt(this.camera.position.clone().add(this.forward()));
  }

  // Which bay you're looking at (for the location label).
  lookedAt() {
    const v = this.view, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    let best = -1, bd = Infinity;
    this.plan.bays.forEach((b, i) => {
      const dx = b.x - v.x, dz = b.z - v.z, d = Math.hypot(dx, dz);
      if (d > 7) return;
      const cos = (dx * fx + dz * fz) / (d || 1);
      const nx = Math.sin(b.rot), nz = Math.cos(b.rot);
      if (cos < 0.7 || -(dx * nx + dz * nz) / (d || 1) < 0.35) return; // in front of you, and facing you
      const score = d * (1.6 - cos);
      if (score < bd) { bd = score; best = i; }
    });
    return best;
  }

  // ---- picking ----------------------------------------------------------------------------------------------

  ray(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  pick(clientX, clientY) {
    const ray = this.ray(clientX, clientY);
    const near = this.nearBays(16, 9).map(i => this.caseMeshes[i]);
    const hit = ray.intersectObjects([...near, this.floor], false)[0];
    if (!hit) return { book: -1 };
    if (hit.object.userData.floor) return { book: -1, floor: hit.point };
    if (hit.instanceId == null) return { book: -1 };
    return { book: hit.object.userData.first + hit.instanceId };
  }

  screenOf(n) {
    const mesh = this.caseMeshes[this.caseOfBook(n)];
    const p = new THREE.Vector3().setFromMatrixPosition(this.bookLocal(n, this.pull.get(n) || 0)).applyMatrix4(mesh.matrixWorld);
    p.y += this.layout.books[n].h / 2;
    p.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  hover(n) { if (n === this.hovered) return; this.hovered = n; this.dirty = true; this.cb.onHover?.(n); }
  select(n) { this.selected = n; this.dirty = true; this.cb.onSelect?.(n); }

  // ---- input ------------------------------------------------------------------------------------------------

  key(code, down) {
    if (down) this.keys.add(code); else this.keys.delete(code);
    this.dirty = true;
  }
  setStick(x, y) { this.stick = { x, y }; this.dirty = true; }

  bind() {
    const c = this.canvas;
    let down = null;
    this.on = {
      down: e => {
        c.setPointerCapture?.(e.pointerId);
        down = { x: e.clientX, y: e.clientY, yaw: this.goal.yaw, pitch: this.goal.pitch, moved: false, type: e.pointerType };
        if (this.anim) this.skip();
      },
      move: e => {
        if (down) {
          const dx = e.clientX - down.x, dy = e.clientY - down.y;
          if (!down.moved && Math.hypot(dx, dy) > 6) { down.moved = true; this.ring.visible = false; this.hover(-1); }
          if (down.moved) {
            const k = (this.camera.fov * Math.PI / 180) / (c.clientHeight || 1);
            this.goal.yaw = down.yaw + dx * k * 1.1;
            this.goal.pitch = clamp(down.pitch + dy * k * 1.1, -1.1, 1.1);
            this.dirty = true;
          }
          return;
        }
        if (e.pointerType !== 'mouse' || this.anim) return;
        const { book, floor } = this.pick(e.clientX, e.clientY);
        this.hover(book);
        if (floor && book < 0) { this.ring.position.set(floor.x, 0.012, floor.z); this.ring.visible = true; } else this.ring.visible = false;
        c.style.cursor = book >= 0 || floor ? 'pointer' : 'grab';
        this.dirty = true;
      },
      up: e => {
        if (!down) return;
        const d = down; down = null;
        if (d.moved) return;
        const { book, floor } = this.pick(e.clientX, e.clientY);
        if (book >= 0) {
          // Mouse: a click opens. Touch: the first tap selects (shows the label), the second opens.
          if (d.type === 'mouse' || this.selected === book) this.cb.onOpenRequest?.(book);
          else { this.select(book); this.hover(book); }
          return;
        }
        if (floor) { this.select(-1); this.walkTo(floor.x, floor.z); }
      },
      leave: () => { if (!down) { this.hover(-1); this.ring.visible = false; this.dirty = true; } },
      wheel: e => {
        e.preventDefault();
        const step = clamp(-e.deltaY * 0.004, -0.8, 0.8);
        this.walkTo(this.goal.x - Math.sin(this.goal.yaw) * step, this.goal.z - Math.cos(this.goal.yaw) * step);
      },
      resize: () => this.resize(),
      lost: e => { e.preventDefault(); this.cb.onContextLost?.(); },
    };
    c.addEventListener('pointerdown', this.on.down);
    c.addEventListener('pointermove', this.on.move);
    c.addEventListener('pointerup', this.on.up);
    c.addEventListener('pointercancel', this.on.up);
    c.addEventListener('pointerleave', this.on.leave);
    c.addEventListener('wheel', this.on.wheel, { passive: false });
    c.addEventListener('webglcontextlost', this.on.lost);
    this.ro = new ResizeObserver(this.on.resize); this.ro.observe(c);
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---- the opening sequence ---------------------------------------------------------------------------------

  // The book being taken down: a closed book with its real spine, cover and page edges.
  async buildHero(n, portraitUrl) {
    const p = this.players[this.layout.books[n].i];
    const b = this.layout.books[n];
    const team = this.layout.cases[b.c].team;
    const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, this.maxAniso); return t; };
    const sw = 64, sh = Math.min(1024, Math.round(sw * b.h / b.w));
    const spineCanvas = document.createElement('canvas'); spineCanvas.width = sw; spineCanvas.height = sh;
    paintSpine(spineCanvas.getContext('2d'), p, team, 0, 0, sw, sh);
    const coverTex = tex(paintCover(p, team)), spineTex = tex(spineCanvas);
    const clothMat = new THREE.MeshStandardMaterial({ color: spineColor(p, team), roughness: 0.75 });
    // The cover lights up to its own colours as it reaches you, so it hands over to the reader's cover without a jump.
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: coverTex, emissiveIntensity: 0 });
    const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.7 });
    const pages = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.95 });
    const W = 0.24, H = 0.33, T = Math.max(0.03, b.w);
    const g = new THREE.Group();
    const geos = [];
    const box = (w, h, d) => { const geo = new THREE.BoxGeometry(w, h, d); geos.push(geo); return geo; };
    // Boards a little larger than the text block, so the page edges sit inside them.
    const boardT = 0.004;
    const block = new THREE.Mesh(box(T - 2 * boardT, H * 0.975, W * 0.985), pages); block.position.z = -W * 0.0075;
    const front = new THREE.Mesh(box(boardT, H, W), [coverMat, clothMat, clothMat, clothMat, clothMat, clothMat]); front.position.x = T / 2 - boardT / 2;
    const back = new THREE.Mesh(box(boardT, H, W), clothMat); back.position.x = -T / 2 + boardT / 2;
    const spine = new THREE.Mesh(box(T, H, boardT), [clothMat, clothMat, clothMat, clothMat, spineMat, clothMat]); spine.position.z = W / 2 - boardT / 2;
    g.add(block, front, back, spine);
    this.hero = { group: g, n, W, H, T, coverMat, mats: [clothMat, coverMat, spineMat, pages], tex: [coverTex, spineTex], geos };
    this.heroScene.add(g);
    if (portraitUrl) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!this.hero || this.hero.n !== n) return;
        coverTex.image = paintCover(p, team, { portrait: img }); coverTex.needsUpdate = true;
        this.dirty = true;
      };
      img.src = portraitUrl;
    }
    const mesh = this.caseMeshes[b.c];
    const start = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, new THREE.Matrix4().makeTranslation(b.x, shelfY(b.s) + b.h / 2, CASE.depth / 2 - b.d / 2 - 0.01));
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    start.decompose(pos, quat, scl);
    const scale = new THREE.Vector3(b.w / T, b.h / H, b.d / W);
    this.hero.from = { pos: pos.clone(), quat: quat.clone(), scale };
    this.hero.out = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    this.hero.side = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    // The book tips on the front edge of its foot: the pivot, relative to its centre, in the room.
    this.hero.pivot = new THREE.Vector3(0, -b.h / 2, b.d / 2);
  }

  // Where the book ends up: in front of the camera, cover facing it, the size the reader shows the cover at.
  heroTarget() {
    const cam = this.camera, h = this.hero;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const vh = this.canvas.clientHeight || 1, aspect = cam.aspect, tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // The reader lays the cover out under its top bar: about 86% of the height on a wide screen, the full width
    // of a phone. Match that so the hand-over to the reader doesn't jump.
    const wide = this.canvas.clientWidth >= 900;
    const fracH = wide ? (vh - 92) / vh : 0.82, fracW = wide ? 0.9 : 0.96;
    const dist = Math.max(h.H / (2 * tan * fracH), h.W / (2 * tan * aspect * fracW));
    const drop = (wide ? 26 : 30) / vh * 2 * tan * dist;
    const pos = cam.position.clone().addScaledVector(fwd, dist + h.T / 2).addScaledVector(up, -drop);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd.clone().negate(), up, right.clone().negate()));
    return { pos, quat: q, fwd, right, up };
  }

  // Taking the book down, as a function of t (0 = on the shelf, 1 = held up, cover to you). Putting it back runs
  // it in reverse. A finger hooks the top of the spine and tips the book out on its foot; it slides off the shelf,
  // and is lifted and turned round to show its cover.
  poseHero(t) {
    const h = this.hero, T = h.target, b = this.layout.books[h.n];
    const seg = (a, c) => ease(clamp((t - a) / (c - a), 0, 1));
    const tip = seg(0, 0.2), slide = seg(0.14, 0.42), fly = seg(0.36, 1), untip = seg(0.4, 0.8);
    const angle = 0.32 * tip * (1 - untip);
    const tilt = new THREE.Quaternion().setFromAxisAngle(h.side, angle);
    // Tip about the pivot: the centre swings round it.
    const c = h.pivot.clone().negate().applyQuaternion(h.from.quat).applyAxisAngle(h.side, angle);
    const pivotW = h.pivot.clone().applyQuaternion(h.from.quat).add(h.from.pos);
    const shelfPos = pivotW.add(c).addScaledVector(h.out, (b.d + 0.05) * slide).addScaledVector(UP, 0.012 * slide);
    const shelfQuat = tilt.multiply(h.from.quat);
    const pos = shelfPos.lerp(T.pos, fly);
    // An arc on the way: up a little and swung out to the side, as a hand would carry it.
    pos.addScaledVector(T.up, Math.sin(Math.PI * fly) * 0.06);
    h.group.position.copy(pos);
    const q = shelfQuat.slerp(T.quat, fly);
    const wobble = new THREE.Quaternion().setFromAxisAngle(T.up, Math.sin(Math.PI * fly) * -0.35);
    h.group.quaternion.copy(wobble.multiply(q));
    h.group.scale.copy(h.from.scale).lerp(new THREE.Vector3(1, 1, 1), fly);
    const glow = seg(0.6, 1);
    h.coverMat.color.setScalar(1 - glow); h.coverMat.emissiveIntensity = glow;
  }

  open(n, portraitUrl, { instant = false } = {}) {
    return new Promise(async resolve => {
      this.closeHero();
      this.hover(-1); this.ring.visible = false;
      await this.buildHero(n, portraitUrl);
      this.setBookMatrix(this.caseMeshes[this.caseOfBook(n)], n, -1);
      this.applyCamera(); this.camera.updateMatrixWorld();
      this.hero.target = this.heroTarget();
      this.poseHero(0);
      const dur = this.reducedMotion || instant ? 0 : 1.9;
      this.anim = { t0: performance.now(), dur, step: t => this.poseHero(t), done: () => { this.cb.onOpened?.(n); resolve(); } };
      if (!dur) this.skip();
      this.dirty = true;
    });
  }

  close() {
    const h = this.hero; if (!h) return;
    const n = h.n;
    if (!h.target) { this.closeHero(); return; }
    const dur = this.reducedMotion ? 0 : 1.5;
    this.anim = {
      t0: performance.now(), dur,
      step: t => this.poseHero(1 - t),
      done: () => { this.closeHero(); this.setBookMatrix(this.caseMeshes[this.caseOfBook(n)], n, 0); this.select(n); },
    };
    if (!dur) this.skip();
    this.dirty = true;
  }

  closeHero() {
    if (!this.hero) return;
    const h = this.hero; this.hero = null;
    this.heroScene.remove(h.group);
    h.mats.forEach(m => m.dispose()); h.tex.forEach(t => t.dispose()); h.geos.forEach(g => g.dispose());
    this.dirty = true;
  }

  skip() {
    if (!this.anim) return;
    const a = this.anim; this.anim = null;
    a.step(1); a.done?.();
    this.dirty = true;
  }

  // ---- frame loop -------------------------------------------------------------------------------------------

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    const v = this.view, g = this.goal;
    const dt = Math.min(0.1, Math.max(0.001, ((now - (this.lastNow || now)) || 16) / 1000)); this.lastNow = now;
    let moving = false;

    // Walking: keys (WASD / Q E to turn) or the touch stick move the goal directly.
    const k = this.keys;
    let fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + -this.stick.y;
    let side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.stick.x;
    const turn = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (fwd || side || turn) {
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.2 : 2.3) * dt;
      const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      const p = this.resolve({ x: g.x + (-sy * fwd + cy * side) * speed, z: g.z + (-cy * fwd - sy * side) * speed });
      g.x = p.x; g.z = p.z; g.yaw -= turn * 1.8 * dt;
      if (fwd || side) { this.ring.visible = false; }
      moving = true;
    }

    const kk = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    for (const key of ['x', 'z', 'yaw', 'pitch']) {
      const d = g[key] - v[key];
      if (Math.abs(d) > 0.0004) { v[key] += d * (key === 'yaw' || key === 'pitch' ? Math.min(1, kk * 2.2) : kk); moving = true; } else v[key] = g[key];
    }
    for (const n of new Set([...this.pull.keys(), this.hovered, this.selected])) {
      if (n < 0 || this.hero?.n === n) continue;
      const want = n === this.selected ? 0.07 : n === this.hovered ? 0.035 : 0;
      const cur = this.pull.get(n) || 0, next = this.reducedMotion ? want : cur + (want - cur) * (1 - Math.exp(-dt * 16));
      if (Math.abs(next - cur) > 0.0002 || (want === 0 && cur !== 0)) {
        const val = Math.abs(next - want) < 0.0005 ? want : next;
        this.setBookMatrix(this.caseMeshes[this.caseOfBook(n)], n, val);
        if (val === 0) this.pull.delete(n); else this.pull.set(n, val);
        moving = true;
      }
    }
    if (this.anim) {
      const t = this.anim.dur ? clamp((performance.now() - this.anim.t0) / (this.anim.dur * 1000), 0, 1) : 1;
      this.anim.step(t);
      if (t >= 1) { const a = this.anim; this.anim = null; a.done?.(); }
      moving = true;
    }
    if (moving || this.dirty) {
      this.applyCamera();
      if (!this.hero) this.updateAtlases();
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      if (this.hero) { this.renderer.clearDepth(); this.renderer.render(this.heroScene, this.camera); }
      this.dirty = false;
      const st = this.lookedAt();
      if (st !== this.station) { this.station = st; this.cb.onStation?.(st); }
      this.cb.onFrame?.();
    }
  }

  pause(p) { this.paused = p; if (!p) this.dirty = true; }

  dispose() {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.on.down);
    c.removeEventListener('pointermove', this.on.move);
    c.removeEventListener('pointerup', this.on.up);
    c.removeEventListener('pointercancel', this.on.up);
    c.removeEventListener('pointerleave', this.on.leave);
    c.removeEventListener('wheel', this.on.wheel);
    c.removeEventListener('webglcontextlost', this.on.lost);
    this.ro.disconnect();
    this.closeHero();
    for (const [, at] of this.atlases) at.texture.dispose();
    this.atlases.clear();
    for (const d of this.disposables) d.dispose?.();
    this.scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
