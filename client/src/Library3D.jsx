import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Room } from './room.js';
import { span } from './shelves.js';
import { headshot } from './api.js';

const POS = { G: 'Guard', F: 'Forward', C: 'Center', PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward' };
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Canvas text needs the web fonts; wait for them (briefly) before painting spines.
async function fontsReady() {
  if (!document.fonts?.load) return;
  await Promise.race([
    Promise.all(['30px "IM Fell English SC"', '30px "EB Garamond"', 'italic 28px "EB Garamond"'].map(f => document.fonts.load(f))),
    new Promise(r => setTimeout(r, 2500)),
  ]).catch(() => {});
}

const Library3D = forwardRef(function Library3D({ players, layout, focus, setFocus, motion, blocked, reading, onOpen, onReady, onDesk, onFail, announce }, ref) {
  const canvasRef = useRef(null);
  const roomRef = useRef(null);
  const slipRef = useRef(null);
  const [station, setStation] = useState(0);
  const [hovered, setHovered] = useState(-1);
  const [ready, setReady] = useState(false);
  const cb = useRef({});
  const focusRef = useRef(focus);
  focusRef.current = focus;
  cb.current = { onOpen, onDesk, onFail, setFocus, announce, onReady };

  useImperativeHandle(ref, () => ({
    showBook: (n, o) => roomRef.current?.showBook(n, o),
    open: (n, { instant } = {}) => roomRef.current ? roomRef.current.open(n, headshot(players[layout.books[n].i].i), { instant }) : Promise.resolve(),
    close: () => roomRef.current?.close(),
  }), [players, layout]);

  useEffect(() => {
    let room = null, dead = false;
    const saved = (() => { try { return JSON.parse(sessionStorage.getItem('library.view')); } catch { return null; } })();
    fontsReady().then(() => {
      if (dead) return;
      try {
        room = new Room(canvasRef.current, {
          players, layout, mobile: isTouch() || innerWidth < 760, reducedMotion: !motion,
          onHover: n => setHovered(n),
          onSelect: n => cb.current.setFocus(n),
          onOpenRequest: n => cb.current.onOpen(n),
          onStation: s => setStation(s),
          onDesk: () => cb.current.onDesk(),
          onFrame: () => placeSlip(),
          onContextLost: () => cb.current.onFail(),
        });
      } catch (e) { console.error(e); cb.current.onFail(); return; }
      roomRef.current = room;
      if (saved && saved.n === layout.cases.length) { room.goTo(Math.round(saved.a), { y: saved.y, dist: saved.dist, instant: true }); }
      // A book chosen before the room was ready (catalogue search, deep link): go to it now.
      if (focusRef.current >= 0) room.showBook(focusRef.current, { instant: true });
      setReady(true);
      cb.current.onReady?.();
    });
    const save = () => { const r = roomRef.current; if (r) try { sessionStorage.setItem('library.view', JSON.stringify({ ...r.goal, a: ((Math.round(r.goal.a) % r.n) + r.n) % r.n, n: r.n })); } catch { /* ignore */ } };
    addEventListener('pagehide', save);
    return () => { dead = true; save(); removeEventListener('pagehide', save); room?.dispose(); roomRef.current = null; };
  }, [players, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (roomRef.current) roomRef.current.reducedMotion = !motion; }, [motion]);
  useEffect(() => { roomRef.current?.pause(reading); }, [reading]);
  // Keep the room's selection in step with selections made elsewhere (search, keyboard).
  useEffect(() => { const r = roomRef.current; if (r && r.selected !== focus) { r.selected = focus; r.dirty = true; } }, [focus]);

  // The paper slip that names the book under the pointer (or the selected one).
  const slipBook = hovered >= 0 ? hovered : focus;
  function placeSlip() {
    const r = roomRef.current, el = slipRef.current;
    if (!r || !el) return;
    const n = r.hovered >= 0 ? r.hovered : r.selected;
    if (n < 0 || r.hero) { el.style.opacity = 0; return; }
    const s = r.screenOf(n);
    if (!s.visible) { el.style.opacity = 0; return; }
    const w = el.offsetWidth || 220;
    el.style.opacity = 1;
    const top = (document.querySelector('.masthead')?.getBoundingClientRect().bottom || 70) + 6;
    let y = s.y - el.offsetHeight - 14;
    if (y < top) y = s.y + 24; // no room above the book: hang the slip below its top edge instead
    el.style.transform = `translate(${Math.round(Math.max(8, Math.min(innerWidth - w - 8, s.x - w / 2)))}px, ${Math.round(y)}px)`;
  }
  useEffect(() => { placeSlip(); });

  // Keyboard: arrows walk the shelves, Enter opens, [ and ] change bookcase.
  useEffect(() => {
    if (blocked) return;
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select, [role=dialog]') || e.altKey || e.metaKey || e.ctrlKey) return;
      const r = roomRef.current;
      // The room may still be waiting for its fonts: a book already chosen (from the catalogue) can be opened.
      if (!r) { if ((e.key === 'Enter' || e.key === ' ') && focusRef.current >= 0) { e.preventDefault(); cb.current.onOpen(focusRef.current); } return; }
      const books = layout.books;
      let n = r.selected;
      const firstOfCase = c => layout.cases[c].first;
      const go = m => { e.preventDefault(); r.showBook(m); const p = players[books[m].i]; const cs = layout.cases[books[m].c]; cb.current.announce(`${p.n}, ${span(p)}. ${cs.label} bookcase, shelf ${books[m].s + 1}.`); };
      switch (e.key) {
        case 'ArrowRight': return go(n < 0 ? firstOfCase(station) : Math.min(books.length - 1, n + 1));
        case 'ArrowLeft': return go(n < 0 ? firstOfCase(station) : Math.max(0, n - 1));
        case 'ArrowUp': case 'ArrowDown': {
          if (n < 0) return go(firstOfCase(station));
          const b = books[n], want = b.s + (e.key === 'ArrowDown' ? 1 : -1);
          const cs = layout.cases[b.c];
          let best = -1, bd = Infinity;
          for (let m = cs.first; m <= cs.last; m++) if (books[m].s === want && Math.abs(books[m].x - b.x) < bd) { bd = Math.abs(books[m].x - b.x); best = m; }
          if (best >= 0) go(best); else e.preventDefault();
          return;
        }
        case ']': case 'PageDown': e.preventDefault(); r.select(-1); return r.nudge(1);
        case '[': case 'PageUp': e.preventDefault(); r.select(-1); return r.nudge(-1);
        case '+': case '=': return r.zoom(0.8);
        case '-': case '_': return r.zoom(1.25);
        case 'Enter': case ' ': if (n >= 0) { e.preventDefault(); cb.current.onOpen(n); } return;
        case 'Escape': if (n >= 0) r.select(-1); return;
        default:
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [blocked, layout, players, station]);

  const cs = layout.cases[station];
  const sp = slipBook >= 0 ? players[layout.books[slipBook].i] : null;
  const touch = isTouch();

  return (
    <section className="room" aria-label="Reading room" aria-hidden={reading || undefined}>
      <canvas ref={canvasRef} className="room-canvas" tabIndex={-1} aria-hidden="true" />
      {!ready && <div className="loading" role="status"><span className="spinner" aria-hidden /> Lighting the lamps…</div>}

      <div ref={slipRef} className={`slip${slipBook === focus && focus >= 0 ? ' chosen' : ''}`} style={{ opacity: 0 }} aria-hidden={!sp || undefined}>
        {sp && (<>
          <strong>{sp.n}</strong>
          <span>{[span(sp), POS[sp.p] || sp.p].filter(Boolean).join(' · ')}</span>
          {slipBook === focus && <button className="btn small" onClick={() => onOpen(focus)}>Open book</button>}
          {slipBook !== focus && <em>{touch ? 'Tap again to open' : 'Click to open'}</em>}
        </>)}
      </div>

      <nav className="stacks" aria-label="Bookcases">
        <div className="case-nav">
          <button className="arrow" onClick={() => { roomRef.current?.select(-1); roomRef.current?.nudge(-1); }} aria-label="Previous bookcase">‹</button>
          <div className="plaque" aria-live="polite">
            <span className="plaque-label">{cs?.label}</span>
            <span className="plaque-sub">{cs?.team.cases > 1 ? `${cs.range} · ` : ''}{cs?.team.count.toLocaleString('en-US')} books · bookcase {station + 1} of {layout.cases.length}</span>
          </div>
          <button className="arrow" onClick={() => { roomRef.current?.select(-1); roomRef.current?.nudge(1); }} aria-label="Next bookcase">›</button>
        </div>
        <div className="az" role="group" aria-label="Go to a team's bookcase">
          {layout.teams.map(t => (
            <button key={t.id || 'none'} title={t.name} aria-label={t.name} className={cs?.team === t ? 'on' : ''}
              style={{ '--team': t.color || '#c49a52' }}
              onClick={() => { roomRef.current?.goTo(t.first, { dist: 3.4, y: 1.55 }); roomRef.current?.select(-1); }}>{t.abbr}</button>
          ))}
        </div>
      </nav>
      <div className="zoom" role="group" aria-label="Distance">
        <button onClick={() => roomRef.current?.zoom(0.75)} aria-label="Step closer">+</button>
        <button onClick={() => roomRef.current?.zoom(1.33)} aria-label="Step back">−</button>
      </div>

      <p className="hint" aria-hidden="true">
        {touch ? 'Drag to walk the shelves · pinch to step closer · tap a book' : 'Drag or use [ ] to walk · scroll to step closer · arrow keys to browse · Enter to open'}
      </p>
    </section>
  );
});

export default Library3D;
