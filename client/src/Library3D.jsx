import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Room } from './room.js';
import { span, hallPlan, teamCloth, HALL } from './shelves.js';
import { headshot } from './api.js';

const POS = { G: 'Guard', F: 'Forward', C: 'Center', PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward' };
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);

// Canvas text needs the web fonts; wait for them (briefly) before painting spines and signs.
async function fontsReady() {
  if (!document.fonts?.load) return;
  await Promise.race([
    Promise.all(['700 30px "Barlow Condensed"', '500 30px "Barlow Condensed"', '500 30px Barlow', '400 24px Literata'].map(f => document.fonts.load(f))),
    new Promise(r => setTimeout(r, 2500)),
  ]).catch(() => {});
}

const Library3D = forwardRef(function Library3D({ players, layout, focus, setFocus, motion, blocked, reading, onOpen, onReady, onFail, announce }, ref) {
  const canvasRef = useRef(null), roomRef = useRef(null), slipRef = useRef(null), mapRef = useRef(null);
  const [station, setStation] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const cb = useRef({});
  const focusRef = useRef(focus);
  focusRef.current = focus;
  cb.current = { onOpen, onFail, setFocus, announce, onReady };
  const plan = React.useMemo(() => hallPlan(layout), [layout]);
  const touch = isTouch();

  useImperativeHandle(ref, () => ({
    showBook: (n, o) => roomRef.current?.showBook(n, o),
    goToBay: (c, o) => roomRef.current?.goToBay(c, o),
    open: (n, { instant } = {}) => roomRef.current ? roomRef.current.open(n, headshot(players[layout.books[n].i].i), { instant }) : Promise.resolve(),
    close: () => roomRef.current?.close(),
  }), [players, layout]);

  useEffect(() => {
    let room = null, dead = false;
    const saved = (() => { try { return JSON.parse(sessionStorage.getItem('library.walk')); } catch { return null; } })();
    fontsReady().then(() => {
      if (dead) return;
      try {
        room = new Room(canvasRef.current, {
          players, layout, mobile: touch || innerWidth < 760, reducedMotion: !motion,
          onHover: n => setHovered(n),
          onSelect: n => cb.current.setFocus(n),
          onOpenRequest: n => cb.current.onOpen(n),
          onStation: s => setStation(s),
          onFrame: () => { placeSlip(); drawMap(); },
          onContextLost: () => cb.current.onFail(),
        });
      } catch (e) { console.error(e); cb.current.onFail(); return; }
      roomRef.current = room;
      if (saved && saved.n === layout.cases.length) room.walkTo(saved.x, saved.z, { yaw: saved.yaw, pitch: saved.pitch, instant: true });
      // A book chosen before the room was ready (catalogue search, deep link): go to it now.
      if (focusRef.current >= 0) room.showBook(focusRef.current, { instant: true });
      setReady(true);
      cb.current.onReady?.();
    });
    const save = () => { const r = roomRef.current; if (r) try { sessionStorage.setItem('library.walk', JSON.stringify({ ...r.goal, n: layout.cases.length })); } catch { /* ignore */ } };
    addEventListener('pagehide', save);
    return () => { dead = true; save(); removeEventListener('pagehide', save); room?.dispose(); roomRef.current = null; };
  }, [players, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (roomRef.current) roomRef.current.reducedMotion = !motion; }, [motion]);
  useEffect(() => { roomRef.current?.pause(reading); }, [reading]);
  useEffect(() => { const r = roomRef.current; if (r && r.selected !== focus) { r.selected = focus; r.dirty = true; } }, [focus]);

  // The card that names the book under the pointer (or the selected one).
  const slipBook = hovered >= 0 ? hovered : focus;
  function placeSlip() {
    const r = roomRef.current, el = slipRef.current;
    if (!r || !el) return;
    const n = r.hovered >= 0 ? r.hovered : r.selected;
    if (n < 0 || r.hero) { el.style.opacity = 0; return; }
    const s = r.screenOf(n);
    if (!s.visible) { el.style.opacity = 0; return; }
    const w = el.offsetWidth || 220;
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 64) + 8;
    let y = s.y - el.offsetHeight - 14;
    if (y < top) y = s.y + 24;
    el.style.opacity = 1;
    el.style.transform = `translate(${Math.round(Math.max(8, Math.min(innerWidth - w - 8, s.x - w / 2)))}px, ${Math.round(y)}px)`;
  }
  useEffect(() => { placeSlip(); });

  // The floor plan: rows, each bay in its team's colour, and where you are.
  const mapGeo = React.useMemo(() => {
    const pad = 0.6, x0 = plan.x0 - pad, z0 = plan.z0, w = plan.x1 + pad - x0, h = plan.z1 - plan.z0;
    const W = 168, S = W / w, H = Math.round(h * S);
    return { x0, z0, w, h, W, H, S, toPx: (x, z) => [(x - x0) * S, (z - z0) * S], toWorld: (px, py) => [px / S + x0, py / S + z0] };
  }, [plan]);
  const lastDraw = useRef(0);
  function drawMap(force) {
    const cvs = mapRef.current, r = roomRef.current; if (!cvs || !r) return;
    const now = performance.now(); if (!force && now - lastDraw.current < 60) return; lastDraw.current = now;
    const { W, H, toPx, S } = mapGeo;
    const dpr = devicePixelRatio || 1;
    if (cvs.width !== W * dpr) { cvs.width = W * dpr; cvs.height = H * dpr; }
    const g = cvs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, W, H);
    plan.bays.forEach((b, i) => {
      const cs = layout.cases[i];
      const [px, py] = toPx(b.x, b.z);
      g.fillStyle = teamCloth(cs.team);
      const bw = CASE_D * S, bh = HALL.bayW * S;
      g.fillRect(px - bw / 2, py - bh / 2 + 0.5, bw, bh - 1);
    });
    const v = r.view;
    const [cx, cy] = toPx(v.x, v.z);
    g.save(); g.translate(cx, cy); g.rotate(-v.yaw);
    g.fillStyle = 'rgba(43,111,214,0.25)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 26, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill();
    g.fillStyle = '#2b6fd6'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  useEffect(() => { drawMap(true); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMapClick = e => {
    const r = roomRef.current; if (!r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const [x, z] = mapGeo.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    r.select(-1); r.walkTo(x, z); setMoved(true);
  };

  // Keyboard: WASD (Q/E turn, Shift to hurry) walks; arrows browse the books on the shelf; [ ] next bay; Enter opens.
  useEffect(() => {
    if (blocked) { for (const k of WALK_KEYS) roomRef.current?.key(k, false); return; }
    const onDown = e => {
      if (e.target.closest?.('input, textarea, select, [role=dialog]') || e.altKey || e.metaKey || e.ctrlKey) return;
      const r = roomRef.current;
      if (!r) { if ((e.key === 'Enter' || e.key === ' ') && focusRef.current >= 0) { e.preventDefault(); cb.current.onOpen(focusRef.current); } return; }
      if (WALK_KEYS.has(e.code)) { r.key(e.code, true); setMoved(true); return; }
      const books = layout.books;
      const n = r.selected;
      const firstInView = () => (r.station >= 0 ? layout.cases[r.station].first : 0);
      const go = m => { e.preventDefault(); r.showBook(m); const p = players[books[m].i]; const cs = layout.cases[books[m].c]; cb.current.announce(`${p.n}, ${span(p)}. ${cs.label}, shelf ${books[m].s + 1}.`); };
      switch (e.key) {
        case 'ArrowRight': return go(n < 0 ? firstInView() : Math.min(books.length - 1, n + 1));
        case 'ArrowLeft': return go(n < 0 ? firstInView() : Math.max(0, n - 1));
        case 'ArrowUp': case 'ArrowDown': {
          if (n < 0) return go(firstInView());
          const b = books[n], want = b.s + (e.key === 'ArrowDown' ? 1 : -1), cs = layout.cases[b.c];
          let best = -1, bd = Infinity;
          for (let m = cs.first; m <= cs.last; m++) if (books[m].s === want && Math.abs(books[m].x - b.x) < bd) { bd = Math.abs(books[m].x - b.x); best = m; }
          if (best >= 0) go(best); else e.preventDefault();
          return;
        }
        case ']': case 'PageDown': e.preventDefault(); r.select(-1); return r.nextBay(1);
        case '[': case 'PageUp': e.preventDefault(); r.select(-1); return r.nextBay(-1);
        case 'Enter': case ' ': if (n >= 0) { e.preventDefault(); cb.current.onOpen(n); } return;
        case 'Escape': if (n >= 0) r.select(-1); return;
        default:
      }
    };
    const onUp = e => { if (WALK_KEYS.has(e.code)) roomRef.current?.key(e.code, false); };
    const onBlur = () => { for (const k of WALK_KEYS) roomRef.current?.key(k, false); };
    addEventListener('keydown', onDown); addEventListener('keyup', onUp); addEventListener('blur', onBlur);
    return () => { removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); removeEventListener('blur', onBlur); };
  }, [blocked, layout, players]);

  // Touch thumb-stick for walking.
  const stick = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickMove = e => {
    const s = stick.current; if (!s) return;
    const dx = e.clientX - s.cx, dy = e.clientY - s.cy, d = Math.min(1, Math.hypot(dx, dy) / 44), a = Math.atan2(dy, dx);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    setKnob({ x: x * 36, y: y * 36 });
    roomRef.current?.setStick(Math.abs(x) < 0.15 ? 0 : x * 0.8, Math.abs(y) < 0.15 ? 0 : y);
  };
  const stickEnd = () => { stick.current = null; setKnob({ x: 0, y: 0 }); roomRef.current?.setStick(0, 0); };

  const cs = station >= 0 ? layout.cases[station] : null;
  const sp = slipBook >= 0 ? players[layout.books[slipBook].i] : null;
  const row = cs ? plan.bays[station].row + 1 : null;

  return (
    <section className="room" aria-label="The library" aria-hidden={reading || undefined}>
      <canvas ref={canvasRef} className="room-canvas" tabIndex={-1} aria-hidden="true" />
      {!ready && <div className="loading" role="status"><span className="spinner" aria-hidden /> Opening the library…</div>}

      <div ref={slipRef} className={`slip${slipBook === focus && focus >= 0 ? ' chosen' : ''}`} style={{ opacity: 0 }} aria-hidden={!sp || undefined}>
        {sp && (<>
          <strong>{sp.n}</strong>
          <span>{[span(sp), POS[sp.p] || sp.p].filter(Boolean).join(' · ')}</span>
          {slipBook === focus ? <button className="btn primary small" onClick={() => onOpen(focus)}>Open book</button>
            : <em>{touch ? 'Tap again to open' : 'Click to open'}</em>}
        </>)}
      </div>

      <div className="where" aria-live="polite">
        {cs ? (<>
          <i className="dot" style={{ background: teamCloth(cs.team) }} aria-hidden />
          <span className="where-name">{cs.team.cases > 1 ? cs.label : cs.team.name}</span>
          <span className="where-sub">Row {row} · {cs.team.cases > 1 ? cs.range : `${cs.team.count} players`}</span>
        </>) : <span className="where-sub">{layout.books.length.toLocaleString('en-US')} books · {plan.rows} rows · {layout.teams.length} sections</span>}
      </div>

      <figure className="minimap" aria-label="Floor plan">
        <canvas ref={mapRef} style={{ width: mapGeo.W, height: mapGeo.H }} onClick={onMapClick} title="Click to walk there" />
        <figcaption>Entrance</figcaption>
      </figure>

      {touch && (
        <div className="stick" aria-hidden
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); stick.current = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; stickMove(e); setMoved(true); }}
          onPointerMove={e => stick.current && stickMove(e)} onPointerUp={stickEnd} onPointerCancel={stickEnd}>
          <i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      )}

      {!moved && ready && (
        <p className="hint" aria-hidden="true">
          {touch ? 'Drag to look around · walk with the stick · tap a book' : 'Drag to look · W A S D to walk · click the floor to go there · click a book to open it'}
        </p>
      )}
    </section>
  );
});

const CASE_D = 0.34;
export default Library3D;
