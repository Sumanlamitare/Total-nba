// The reading room: a rotunda of walnut bookcases, one book per player, rendered with three.js.
//
// Performance model
//  - Each bookcase draws its books with one InstancedMesh (≈400 books → 1 draw call); all woodwork in the room
//    is a single InstancedMesh.
//  - Spines are painted into one canvas atlas per bookcase, only for the cases near the camera; far cases show
//    plain leather. Atlases are built one per idle frame and disposed when the camera moves away.
//  - The scene renders on demand: when nothing moves, nothing is drawn.
import * as THREE from 'three';
import { CASE, shelfY } from './shelves.js';
import { paintCase, paintCover, paintMarble, paintHalfTitle, paintBookplate, paintTitlePage } from './spines.js';
import { eraOf } from './shelves.js';

const UP = new THREE.Vector3(0, 1, 0);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Shared book material: the spine face (+z) samples the case atlas at the book's rectangle, the top shows
// cream page edges, everything else is plain leather (instance colour).
function bookMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 });
  m.userData.atlas = { value: atlas };
  m.userData.has = { value: atlas ? 1 : 0 };
  m.customProgramCacheKey = () => 'book-v1';
  m.onBeforeCompile = sh => {
    sh.uniforms.uAtlas = m.userData.atlas;
    sh.uniforms.uHas = m.userData.has;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 spineRect;\nvarying vec2 vSpineUv;\nvarying float vFace;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSpineUv = spineRect.xy + uv * spineRect.zw;\nvFace = normal.z > 0.5 ? 1.0 : (normal.y > 0.5 ? 2.0 : 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas;\nuniform float uHas;\nvarying vec2 vSpineUv;\nvarying float vFace;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFace > 1.5) diffuseColor.rgb = vec3(0.60, 0.54, 0.43);
        else if (vFace > 0.5 && uHas > 0.5) diffuseColor.rgb = texture2D(uAtlas, vSpineUv).rgb;`);
  };
  return m;
}

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 256, w = 0.6 + Math.random() * 2.2;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,16,8' : '120,80,48'},${0.08 + Math.random() * 0.16})`;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y / 60 + i) * 4, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const l = 30 + Math.random() * 10;
    g.fillStyle = `hsl(28, 38%, ${l}%)`; g.fillRect(x * 64, y * 64, 64, 64);
    g.strokeStyle = 'rgba(20,10,4,0.5)'; g.strokeRect(x * 64 + 0.5, y * 64 + 0.5, 63, 63);
    g.strokeStyle = 'rgba(20,10,4,0.18)';
    for (let k = 1; k < 4; k++) { g.beginPath(); if ((x + y) % 2) { g.moveTo(x * 64 + k * 16, y * 64); g.lineTo(x * 64 + k * 16, y * 64 + 64); } else { g.moveTo(x * 64, y * 64 + k * 16); g.lineTo(x * 64 + 64, y * 64 + k * 16); } g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
}

// A brass plaque naming the team, with enamel bands in the team's colours at either end.
function plaqueTexture(text, sub, color, alt) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 192);
  grd.addColorStop(0, '#e2c27c'); grd.addColorStop(0.5, '#b38a45'); grd.addColorStop(1, '#8a6630');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 192);
  if (color) {
    for (const x of [22, 1024 - 22 - 46]) { g.fillStyle = color; g.fillRect(x, 22, 46, 148); if (alt) { g.fillStyle = alt; g.fillRect(x + 17, 22, 12, 148); } }
  }
  g.strokeStyle = '#5e4320'; g.lineWidth = 8; g.strokeRect(10, 10, 1004, 172);
  g.fillStyle = '#2a1c0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 84; g.font = `${size}px "IM Fell English SC", Georgia, serif`;
  while (g.measureText(text).width > 820 && size > 40) { size -= 4; g.font = `${size}px "IM Fell English SC", Georgia, serif`; }
  g.fillText(text, 512, sub ? 80 : 98);
  if (sub) { g.font = 'italic 38px "EB Garamond", Georgia, serif'; g.fillStyle = '#3d2a12'; g.fillText(sub, 512, 146); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Room {
  constructor(canvas, { players, layout, mobile = false, reducedMotion = false, onHover, onSelect, onOpenRequest, onOpened, onStation, onDesk, onFrame, onContextLost }) {
    this.canvas = canvas; this.players = players; this.layout = layout;
    this.mobile = mobile; this.reducedMotion = reducedMotion;
    this.cb = { onHover, onSelect, onOpenRequest, onOpened, onStation, onDesk, onFrame, onContextLost };
    this.disposables = [];
    this.atlases = new Map(); // case index -> { texture, rects }
    this.ppm = mobile ? 460 : 720;
    this.hovered = -1; this.selected = -1; this.pull = new Map(); // book index -> current pull-out
    this.anim = null; this.dirty = true;

    const n = layout.cases.length;
    this.n = n;
    this.step = (Math.PI * 2) / Math.max(n, 8);
    this.R = Math.max(4.2, (Math.max(n, 8) * (CASE.width + 0.3)) / (Math.PI * 2));

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#140d08');
    this.scene.fog = new THREE.Fog('#140d08', 6, this.R * 2.4);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);

    // Camera rig state: angle (in bookcase units), distance from the case front, look height.
    this.view = { a: 0, dist: 3.4, y: 1.55 };
    this.goal = { a: 0, dist: 3.4, y: 1.55 };

    this.build();
    this.resize();
    this.bind();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---- construction -----------------------------------------------------------------------------------------

  caseFrame(i) {
    const phi = -i * this.step;
    const m = new THREE.Matrix4().makeRotationY(phi).multiply(new THREE.Matrix4().makeTranslation(0, 0, -this.R));
    return m;
  }

  build() {
    const { scene, layout, players } = this;
    // Light: a warm hemisphere, a high key light, and a reading lamp that follows the camera.
    scene.add(new THREE.HemisphereLight('#ffe2b8', '#2a1810', 0.6));
    const key = new THREE.DirectionalLight('#ffd9a0', 0.55); key.position.set(0, 9, 0); scene.add(key);
    this.lamp = new THREE.PointLight('#ffc879', 5, 7, 1.6); scene.add(this.lamp);

    // Floor, rug, dome.
    const ft = floorTexture(); this.disposables.push(ft);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(this.R + 1, 64), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const rug = new THREE.Mesh(new THREE.RingGeometry(0, this.R * 0.55, 64), new THREE.MeshStandardMaterial({ color: '#1d2a44', roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.005; scene.add(rug);
    const rugEdge = new THREE.Mesh(new THREE.RingGeometry(this.R * 0.53, this.R * 0.55, 64), new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.6, metalness: 0.4 }));
    rugEdge.rotation.x = -Math.PI / 2; rugEdge.position.y = 0.007; scene.add(rugEdge);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(this.R + 1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a1b12', side: THREE.BackSide, roughness: 1 }));
    dome.position.y = CASE.height + 0.2; dome.scale.y = 0.55; scene.add(dome);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(this.R + 1.2, this.R + 1.2, CASE.height + 0.25, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#24170f', side: THREE.BackSide, roughness: 1 }));
    wall.position.y = (CASE.height + 0.25) / 2; scene.add(wall);
    for (const m of [floor, rug, rugEdge, dome, wall]) this.disposables.push(m.geometry, m.material);

    // The librarian's desk with its card catalogue and lamp — the search point.
    this.desk = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2d18', roughness: 0.55 });
    const leather = new THREE.MeshStandardMaterial({ color: '#23402f', roughness: 0.75 });
    const brass = new THREE.MeshStandardMaterial({ color: '#c49a52', roughness: 0.35, metalness: 0.8 });
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.8), wood); deskTop.position.y = 0.76;
    const deskBody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 0.7), wood); deskBody.position.y = 0.37;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.01, 0.5), leather); pad.position.y = 0.795;
    const drawers = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.42), wood); drawers.position.set(0.5, 1.04, -0.12);
    const pulls = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const pull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), brass); pull.position.set(0.32 + k * 0.18, 0.86 + r * 0.115, 0.1); pulls.push(pull); }
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#2f5a3c', emissive: '#ffcf80', emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    shade.position.set(-0.55, 1.2, -0.1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8), brass); stem.position.set(-0.55, 0.99, -0.1);
    this.desk.add(deskTop, deskBody, pad, drawers, shade, stem, ...pulls);
    const deskLight = new THREE.PointLight('#ffcf80', 2.2, 3, 2); deskLight.position.set(-0.55, 1.1, -0.1); this.desk.add(deskLight);
    this.desk.traverse(o => { if (o.isMesh) { this.disposables.push(o.geometry); o.userData.desk = true; } });
    this.disposables.push(wood, leather, brass, shade.material);
    scene.add(this.desk);

    // Woodwork: every board of every case in one instanced mesh.
    const boards = [];
    const W = CASE.width, H = CASE.height, D = CASE.depth, b = CASE.board, s = CASE.side;
    for (let i = 0; i < layout.cases.length; i++) {
      const F = this.caseFrame(i);
      const add = (x, y, z, sx, sy, sz, tone = 1) => boards.push({ m: F.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz))), tone });
      add(-W / 2 - s / 2, H / 2, 0, s, H, D + 0.04); add(W / 2 + s / 2, H / 2, 0, s, H, D + 0.04);
      add(0, H + 0.04, 0.01, W + 2 * s + 0.12, 0.08, D + 0.12); add(0, 0.05, 0, W + 2 * s, 0.1, D + 0.04);
      add(0, H / 2, -D / 2 - 0.01, W, H, 0.02, 0.55);
      for (let k = 0; k < CASE.shelves; k++) add(0, 0.1 + k * CASE.shelfGap - b / 2, 0, W, b, D);
    }
    const wt = woodTexture(); this.disposables.push(wt);
    const boardGeo = new THREE.BoxGeometry(1, 1, 1);
    const boardMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6, color: '#c79a72' });
    const woodwork = new THREE.InstancedMesh(boardGeo, boardMat, boards.length);
    boards.forEach((bd, k) => { woodwork.setMatrixAt(k, bd.m); woodwork.setColorAt(k, new THREE.Color(bd.tone < 1 ? '#5e4636' : '#ffffff')); });
    scene.add(woodwork); this.disposables.push(boardGeo, boardMat);

    // Brass plaques with each case's letter range.
    this.plaques = [];
    const plaqueGeo = new THREE.PlaneGeometry(0.94, 0.176); this.disposables.push(plaqueGeo);
    layout.cases.forEach((cs, i) => {
      const t = plaqueTexture(cs.label, cs.team.cases > 1 ? cs.range : `${cs.team.count.toLocaleString('en-US')} books`, cs.team.color, cs.team.alt);
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.6 });
      const pl = new THREE.Mesh(plaqueGeo, mat);
      pl.applyMatrix4(this.caseFrame(i).multiply(new THREE.Matrix4().makeTranslation(0, H + 0.04, D / 2 + 0.071)));
      scene.add(pl); this.disposables.push(t, mat); this.plaques.push(pl);
    });

    // Brass bookends at the end of each shelf's run of books.
    const ends = layout.cases.flatMap((cs, i) => cs.ends.map(e => ({ i, ...e })));
    const endGeo = new THREE.BoxGeometry(0.012, 0.2, 0.16), endMat = new THREE.MeshStandardMaterial({ color: '#b48a46', roughness: 0.35, metalness: 0.75 });
    const bookends = new THREE.InstancedMesh(endGeo, endMat, Math.max(1, ends.length));
    ends.forEach((e, k) => bookends.setMatrixAt(k, this.caseFrame(e.i).multiply(new THREE.Matrix4().makeTranslation(e.x + 0.012, shelfY(e.s) + 0.1, CASE.depth / 2 - 0.1))));
    bookends.count = ends.length;
    scene.add(bookends); this.disposables.push(endGeo, endMat);

    // Books: one instanced mesh per case.
    this.bookGeo = new THREE.BoxGeometry(1, 1, 1); this.disposables.push(this.bookGeo);
    this.caseMeshes = layout.cases.map((cs, i) => {
      const count = cs.last - cs.first + 1;
      const mat = bookMaterial(null);
      const mesh = new THREE.InstancedMesh(this.bookGeo, mat, Math.max(count, 1));
      mesh.count = count;
      const rect = new Float32Array(count * 4);
      mesh.geometry = this.bookGeo.clone(); // own geometry so each case carries its own spine rectangles
      mesh.geometry.setAttribute('spineRect', new THREE.InstancedBufferAttribute(rect, 4));
      const F = this.caseFrame(i);
      mesh.applyMatrix4(F); mesh.userData = { caseIndex: i, first: cs.first };
      for (let n = cs.first; n <= cs.last; n++) {
        this.setBookMatrix(mesh, n, 0);
        mesh.setColorAt(n - cs.first, new THREE.Color(eraOf(players[layout.books[n].i]).leather));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh); this.disposables.push(mesh.geometry, mat);
      return mesh;
    });

    // The hero book (the one being opened) is built on demand.
    this.hero = null;
  }

  bookLocal(n, pull = 0) {
    const b = this.layout.books[n];
    const y = shelfY(b.s) + b.h / 2;
    const z = CASE.depth / 2 - b.d / 2 - 0.01 + pull;
    return new THREE.Matrix4().makeTranslation(b.x, y, z).multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d));
  }

  setBookMatrix(mesh, n, pull) {
    const k = n - mesh.userData.first;
    mesh.setMatrixAt(k, pull < 0 ? new THREE.Matrix4().makeScale(0, 0, 0) : this.bookLocal(n, pull));
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- atlases (spine text) ---------------------------------------------------------------------------------

  wantedAtlases() {
    const c = Math.round(this.view.a);
    const want = new Set();
    const reach = this.view.dist > 5 ? 2 : 1;
    for (let d = -reach; d <= reach; d++) want.add(((c + d) % this.n + this.n) % this.n);
    return want;
  }

  updateAtlases() {
    const want = this.wantedAtlases();
    for (const [i, at] of this.atlases) {
      if (!want.has(i)) {
        at.texture.dispose(); this.atlases.delete(i);
        const m = this.caseMeshes[i].material; m.userData.atlas.value = null; m.userData.has.value = 0; this.dirty = true;
      }
    }
    // Paint at most one atlas per frame to keep frames smooth.
    for (const i of [Math.round(this.view.a) % this.n, ...want]) {
      const idx = ((i % this.n) + this.n) % this.n;
      if (this.atlases.has(idx) || !want.has(idx)) continue;
      const { canvas, rects } = paintCase(this.players, this.layout, idx, this.ppm);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.maxAniso);
      const mesh = this.caseMeshes[idx];
      const attr = mesh.geometry.getAttribute('spineRect');
      rects.forEach((r, k) => attr.array.set(r, k * 4));
      attr.needsUpdate = true;
      mesh.material.userData.atlas.value = texture; mesh.material.userData.has.value = 1;
      this.atlases.set(idx, { texture });
      this.dirty = true;
      break;
    }
  }

  // ---- camera -----------------------------------------------------------------------------------------------

  caseOfBook(n) { return this.layout.books[n].c; }

  // Move to a case (and optionally a shelf height and distance).
  goTo(caseIndex, { y, dist, instant = false } = {}) {
    // Choose the equivalent angle nearest to where we are, so the camera takes the short way round.
    const cur = this.goal.a;
    let a = caseIndex;
    while (a - cur > this.n / 2) a -= this.n;
    while (cur - a > this.n / 2) a += this.n;
    this.goal.a = a;
    if (y != null) this.goal.y = y;
    if (dist != null) this.goal.dist = dist;
    if (instant || this.reducedMotion) Object.assign(this.view, this.goal);
    this.dirty = true;
  }

  // Bring a book into view and mark it (search results land here).
  showBook(n, { instant = false } = {}) {
    const b = this.layout.books[n];
    const close = this.mobile ? 1.5 : 1.25;
    this.goTo(b.c, { y: shelfY(b.s) + 0.2, dist: Math.min(this.goal.dist, close), instant });
    // Slide along the arc so the book itself, not the middle of its case, is in front of the camera.
    this.goal.a += b.x / (this.step * this.R);
    if (instant || this.reducedMotion) this.view.a = this.goal.a;
    this.select(n);
  }

  nudge(dx) { this.goTo(((Math.round(this.goal.a) + dx) % this.n + this.n) % this.n); }
  zoom(f) { this.goal.dist = clamp(this.goal.dist * f, 0.9, this.R * 0.9); this.dirty = true; }
  lift(dy) { this.goal.y = clamp(this.goal.y + dy, 0.35, CASE.height - 0.25); this.dirty = true; }

  applyCamera() {
    const v = this.view;
    const phi = -v.a * this.step;
    const out = new THREE.Vector3(-Math.sin(phi), 0, -Math.cos(phi)); // from centre towards the case
    const front = out.clone().multiplyScalar(this.R - CASE.depth / 2);
    const dist = Math.min(v.dist, this.R * 0.95);
    // Far away, look a little lower and from a little higher, like standing in the room.
    const far = clamp((dist - 1.2) / 4, 0, 1);
    const camY = lerp(v.y + 0.05, 1.7, far);
    const lookY = lerp(v.y, 1.45, far * 0.6);
    this.camera.position.copy(front).addScaledVector(out, -dist).setY(camY);
    this.camera.lookAt(front.x, lookY, front.z);
    this.lamp.position.copy(front).addScaledVector(out, -0.9).setY(clamp(v.y + 0.6, 1.2, 2.8));
  }

  // ---- picking ----------------------------------------------------------------------------------------------

  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const near = [...this.wantedAtlases()].map(i => this.caseMeshes[i]);
    const hit = ray.intersectObjects([...near, this.desk], true)[0];
    if (!hit) return { book: -1 };
    if (hit.object.userData.desk) return { desk: true, book: -1 };
    if (hit.instanceId == null) return { book: -1 };
    return { book: hit.object.userData.first + hit.instanceId };
  }

  screenOf(n) {
    const mesh = this.caseMeshes[this.caseOfBook(n)];
    const p = new THREE.Vector3().setFromMatrixPosition(this.bookLocal(n, this.pull.get(n) || 0)).applyMatrix4(mesh.matrixWorld);
    const b = this.layout.books[n];
    p.y += b.h / 2;
    p.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  hover(n) {
    if (n === this.hovered) return;
    this.hovered = n; this.dirty = true;
    this.cb.onHover?.(n);
  }

  select(n) {
    this.selected = n; this.dirty = true;
    this.cb.onSelect?.(n);
  }

  // ---- input ------------------------------------------------------------------------------------------------

  bind() {
    const c = this.canvas;
    let down = null, pinch = null;
    const pointers = new Map();
    this.on = {
      down: e => {
        c.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), dist: this.goal.dist }; down = null; return; }
        down = { x: e.clientX, y: e.clientY, a: this.goal.a, yy: this.goal.y, moved: false, t: performance.now(), type: e.pointerType };
        if (this.anim) this.skip();
      },
      move: e => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pointers.size === 2) {
          const [p, q] = [...pointers.values()];
          this.goal.dist = clamp(pinch.dist * (pinch.d / Math.max(20, Math.hypot(p.x - q.x, p.y - q.y))), 0.9, this.R * 0.9);
          this.dirty = true; return;
        }
        if (down) {
          const dx = e.clientX - down.x, dy = e.clientY - down.y;
          if (!down.moved && Math.hypot(dx, dy) > 6) down.moved = true;
          if (down.moved) {
            const w = c.clientWidth || 1;
            this.goal.a = down.a - (dx / w) * (this.goal.dist < 2 ? 0.9 : 1.8);
            this.goal.y = clamp(down.yy + (dy / (c.clientHeight || 1)) * 2.2, 0.35, CASE.height - 0.25);
            this.dirty = true;
            this.hover(-1);
          }
          return;
        }
        if (e.pointerType === 'mouse' && !this.anim) {
          const { book, desk } = this.pick(e.clientX, e.clientY);
          this.hover(book); c.style.cursor = book >= 0 || desk ? 'pointer' : 'grab';
        }
      },
      up: e => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (!down) return;
        const d = down; down = null;
        // Standing back, settle squarely on a bookcase; up close, stay where the drag left off.
        if (d.moved) { if (this.goal.dist > 2) this.goal.a = Math.round(this.goal.a); this.dirty = true; return; }
        const { book, desk } = this.pick(e.clientX, e.clientY);
        if (desk) { this.cb.onDesk?.(); return; }
        if (book < 0) { this.select(-1); return; }
        // Mouse: a click opens. Touch: the first tap selects (shows the label), the second opens.
        if (d.type === 'mouse' || this.selected === book) this.cb.onOpenRequest?.(book);
        else { this.select(book); this.hover(book); }
      },
      leave: () => { if (!down) this.hover(-1); },
      wheel: e => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) this.zoom(Math.exp(e.deltaY * 0.0012)); else { this.goal.a += e.deltaX * 0.003; this.dirty = true; clearTimeout(this.snapT); this.snapT = setTimeout(() => { if (this.goal.dist > 2) this.goal.a = Math.round(this.goal.a); this.dirty = true; }, 220); } },
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
    this.camera.fov = w / h < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---- the opening sequence ---------------------------------------------------------------------------------

  async buildHero(n, portraitUrl) {
    const p = this.players[this.layout.books[n].i];
    const b = this.layout.books[n];
    const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, this.maxAniso); return t; };
    const mat = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    const shelfMark = `Shelf ${this.layout.cases[b.c].label} · ${b.s + 1}`;
    const coverTex = tex(paintCover(p)), marbleTex = tex(paintMarble(512, 720, 11)), halfTex = tex(paintHalfTitle(p));
    const plateTex = tex(paintBookplate(p, shelfMark)), titleTex = tex(paintTitlePage(p)), backTex = tex(paintMarble(512, 720, 4));
    const leather = new THREE.MeshStandardMaterial({ color: eraOf(p).leather, roughness: 0.6 });
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.55 });
    const pages = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.9 });
    const marble = mat(marbleTex), half = mat(halfTex), plate = mat(plateTex), title = mat(titleTex), endBack = mat(backTex);
    // Real books are not this thick in proportion; open a "reading copy" at a pleasant size (its proportions
    // match the reader's pages).
    const W = 0.24, H = 0.33, T = Math.max(0.03, b.w);
    const inner = T / 2 - 0.003; // inside surface of the front board
    const g = new THREE.Group();
    const geos = [];
    const box = (w, h, d) => { const geo = new THREE.BoxGeometry(w, h, d); geos.push(geo); return geo; };
    // The text block: its top page (facing the front cover) is the title page.
    const bt = inner - 0.0032 + (T / 2 - 0.003);
    const block = new THREE.Mesh(box(bt, H * 0.97, W * 0.97), [title, pages, pages, pages, pages, pages]);
    block.position.set(inner - 0.0032 - bt / 2, 0, 0);
    const back = new THREE.Mesh(box(0.006, H, W), leather); back.position.x = -T / 2;
    const spine = new THREE.Mesh(box(T, H, 0.006), leather); spine.position.z = W / 2;
    // Hinged parts, from the outside in: the front board (cover outside, marbled pastedown inside), the free
    // endpaper (marbled / plain), and the half-title leaf (half-title / bookplate on its back).
    const leaf = (x, geo, mats) => {
      const hinge = new THREE.Group(); hinge.position.set(x, 0, W / 2);
      const m = new THREE.Mesh(geo, mats); m.position.set(0, 0, -W / 2); hinge.add(m); g.add(hinge);
      return hinge;
    };
    const board = leaf(T / 2, box(0.006, H, W), [coverMat, marble, leather, leather, leather, leather]);
    const endLeaf = leaf(inner - 0.0007, box(0.0008, H * 0.97, W * 0.97), [endBack, pages, pages, pages, pages, pages]);
    const halfLeaf = leaf(inner - 0.0021, box(0.0008, H * 0.97, W * 0.97), [half, plate, pages, pages, pages, pages]);
    g.add(block, back, spine);
    this.hero = { group: g, hinges: [board, endLeaf, halfLeaf], n, W, H, mats: [leather, coverMat, pages, marble, half, plate, title, endBack], tex: [coverTex, marbleTex, halfTex, plateTex, titleTex, backTex], geos };
    this.scene.add(g);
    if (portraitUrl) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!this.hero || this.hero.n !== n) return;
        coverTex.image = paintCover(p, { portrait: img }); coverTex.needsUpdate = true;
        titleTex.image = paintTitlePage(p, { portrait: img }); titleTex.needsUpdate = true;
        this.dirty = true;
      };
      img.src = portraitUrl;
    }
    // Spine-out on the shelf: the hero's +z is the spine, matching the shelf book.
    const mesh = this.caseMeshes[b.c];
    const start = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, new THREE.Matrix4().makeTranslation(b.x, shelfY(b.s) + b.h / 2, CASE.depth / 2 - b.d / 2 - 0.01));
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    start.decompose(pos, quat, scl);
    this.hero.from = { pos: pos.clone(), quat: quat.clone(), scale: new THREE.Vector3(b.w / T, b.h / H, b.d / W) };
    this.hero.out = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    this.hero.outPos = pos.clone().addScaledVector(this.hero.out, b.d + 0.06);
  }

  heroTarget() {
    // In front of the camera, cover facing it, as a Western book is held: spine (+z) on the reader's left.
    const cam = this.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const pos = cam.position.clone().addScaledVector(fwd, 0.62).addScaledVector(up, -0.01);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd.clone().negate(), up, right.clone().negate()));
    // Open, the spine should sit in the middle of the view and the spread should fill it, like the reader.
    const near = 0.33 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.86);
    return { pos, quat: q, fwd, right, near };
  }

  // The whole sequence as a function of t (0 = on the shelf, 1 = open at the title page). Closing runs it back.
  poseHero(t) {
    const h = this.hero, T = h.target;
    const seg = (a, b) => ease(clamp((t - a) / (b - a), 0, 1));
    const out = seg(0, 0.12), fly = seg(0.1, 0.4), cover = seg(0.4, 0.6), end = seg(0.56, 0.76), half = seg(0.7, 0.9), push = seg(0.42, 1);
    const pos = h.from.pos.clone().lerp(h.outPos, out);
    if (fly > 0) pos.lerp(T.pos, fly);
    // As it opens, slide so the spine is centred and come close enough for the spread to fill the view.
    pos.addScaledVector(T.right, (h.W / 2) * cover);
    pos.addScaledVector(T.fwd, -(0.62 - T.near) * push);
    h.group.position.copy(pos);
    h.group.quaternion.copy(h.from.quat).slerp(T.quat, fly);
    h.group.scale.copy(h.from.scale).lerp(new THREE.Vector3(1, 1, 1), fly);
    h.hinges[0].rotation.y = -Math.PI * 0.985 * cover;
    h.hinges[1].rotation.y = -Math.PI * 0.975 * end;
    h.hinges[2].rotation.y = -Math.PI * 0.965 * half;
  }

  open(n, portraitUrl, { instant = false } = {}) {
    return new Promise(async resolve => {
      this.closeHero();
      this.hover(-1);
      await this.buildHero(n, portraitUrl);
      this.setBookMatrix(this.caseMeshes[this.caseOfBook(n)], n, -1);
      this.applyCamera(); this.camera.updateMatrixWorld();
      this.hero.target = this.heroTarget();
      this.poseHero(0);
      const dur = this.reducedMotion || instant ? 0 : 2.9;
      this.anim = { t0: performance.now(), dur, step: t => this.poseHero(t), done: () => { this.cb.onOpened?.(n); resolve(); } };
      if (!dur) this.skip();
      this.dirty = true;
    });
  }

  // Close the book (the leaves fall back, the cover shuts) and put it back on its shelf.
  close() {
    const h = this.hero; if (!h) return;
    const n = h.n;
    if (!h.target) { this.closeHero(); return; }
    const dur = this.reducedMotion ? 0 : 1.7;
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
    this.scene.remove(h.group);
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
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const key of ['a', 'dist', 'y']) {
      const d = g[key] - v[key];
      if (Math.abs(d) > 0.0005) { v[key] += d * k; moving = true; } else v[key] = g[key];
    }
    // Pull-out of the hovered / selected book.
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
      const prev = Math.round(v.a);
      this.applyCamera();
      if (!this.hero) this.updateAtlases();
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
      const station = ((prev % this.n) + this.n) % this.n;
      if (station !== this.lastStation) { this.lastStation = station; this.cb.onStation?.(station); }
      this.cb.onFrame?.();
    }
  }

  pause(p) { this.paused = p; if (!p) this.dirty = true; }

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.snapT);
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
