// The reader: a real book. It arrives closed, showing its cover; content is measured and packed into pages, shown
// as a two-page spread (one page on narrow screens). Pages turn the way paper does: drag a page and its corner
// follows your finger, folding along a crease, with the back of the page showing; tap the right side to turn
// forward, the left to turn back, or use the arrow keys.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadBook, loadHighs } from './api.js';
import { span as spanOf, teamCloth, inkOn } from './shelves.js';
import { buildBlocks, paginate, CHAPTERS, ROMAN, UI_DEFAULTS } from './chapters.jsx';
import { fold, clampCorner, progress, arc, pts, svgPts } from './fold.js';
import { headshot } from './api.js';
import { motion as M, useSpring, useReducedMotion } from 'motion/react';
import { playTurn, soundOn, setSound } from './sound.js';

const ASPECT = 0.7; // page width / height
const TURN_MS = 820;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const INTERACTIVE = 'button, a, input, select, label, textarea, .table-scroll, .chart, [role=radio]';
const ease3 = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function useGeometry(wrap) {
  const [g, setG] = useState(null);
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const calc = () => {
      const W = el.clientWidth, H = el.clientHeight;
      const spread = W >= 900;
      let pageW, pageH;
      if (spread) {
        pageH = Math.min(H - 28, 900);
        pageW = Math.min(pageH * ASPECT, (W - 40) / 2);
        pageH = Math.min(pageH, pageW / ASPECT * 1.12);
      } else { pageW = W; pageH = H; }
      const padX = spread ? Math.round(pageW * 0.085) : 20, padTop = spread ? 54 : 40, padBottom = spread ? 52 : 46;
      setG({ spread, pageW: Math.floor(pageW), pageH: Math.floor(pageH), padX, padTop, padBottom, textW: Math.floor(pageW - padX * 2), textH: Math.floor(pageH - padTop - padBottom) });
    };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);
  return g;
}

export default function Reader({ id, player, shelf, rank, hidden = false, arrived = false, motion, onClose }) {
  const [state, setState] = useState({ book: null, error: null });
  const [highs, setHighs] = useState({ state: 'loading' });
  const [ui, setUiState] = useState(UI_DEFAULTS);
  const setUi = useCallback(patch => setUiState(u => ({ ...u, ...patch })), []);
  const wrap = useRef(null), measure = useRef(null), bookEl = useRef(null), head = useRef(null);
  const frontEl = useRef(null), backEl = useRef(null), castEl = useRef(null), flapEl = useRef(null);
  const geo = useGeometry(wrap);
  const [heights, setHeights] = useState(null);
  const [pos, setPos] = useState(-1); // -1: closed, showing the cover; then a spread index (two pages) or page index
  const [turn, setTurn] = useState(null); // { dir, from, to, top, mirror, reverse }
  const [pending, setPending] = useState(false); // a queued turn is about to start
  const anim = useRef({ P: null, raf: 0 });
  const [announce, setAnnounce] = useState('');
  const [snd, setSnd] = useState(soundOn);
  const reduced = useReducedMotion();
  // A closed book is held up, floating a little and leaning towards the pointer; an open one lies still to be read.
  const tiltX = useSpring(0, { stiffness: 120, damping: 18 }), tiltY = useSpring(0, { stiffness: 120, damping: 18 });
  const pillsEl = useRef(null);
  const onTilt = e => {
    if (pos >= 0 || anim.current.turn || reduced || !motion || e.pointerType === 'touch') { tiltX.set(0); tiltY.set(0); return; }
    const r = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 7);
    tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 5);
  };
  // Keep the current chapter's pill in view (only when it has moved out of view).
  const pillKey = pos < 0 ? 'cover' : `${pos}`;
  useEffect(() => {
    const nav = pillsEl.current, on = nav?.querySelector('.pill.on'); if (!on) return;
    const a = on.getBoundingClientRect(), b = nav.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) nav.scrollTo({ left: nav.scrollLeft + (a.left + a.width / 2) - (b.left + b.width / 2), behavior: motion && !reduced ? 'smooth' : 'auto' });
  }, [pillKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    loadBook(id).then(book => {
      if (!live) return;
      setState({ book, error: null });
      if (!book.regular) setHighs({ state: 'none' });
      else loadHighs(id).then(h => live && setHighs({ state: 'ok', h })).catch(e => live && setHighs({ state: 'error', msg: e.message }));
    }).catch(e => live && setState({ book: null, error: e.message }));
    return () => { live = false; };
  }, [id]);
  useEffect(() => { if (!hidden) head.current?.focus(); }, [hidden]);

  const { book, error } = state;
  const name = book?.name || player?.n || '';

  // Pages: blocks -> measured heights -> packed pages. Two passes so the contents page can show page numbers.
  const [chapterPages, setChapterPages] = useState(null);
  const goPageRef = useRef(() => {});
  const blocks = useMemo(() => (book ? buildBlocks(book, { ui, setUi, highs, player, shelf, rank, chapterPages, goPage: p => goPageRef.current(p) }) : []),
    [book, ui, setUi, highs, player, shelf?.label, rank, chapterPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!geo || !measure.current || !blocks.length) return;
    const read = () => setHeights([...measure.current.children].map(el => el.getBoundingClientRect().height));
    read();
    let live = true;
    document.fonts?.ready.then(() => live && read());
    const imgs = [...measure.current.querySelectorAll('img')].filter(i => !i.complete);
    imgs.forEach(i => i.addEventListener('load', read, { once: true }));
    return () => { live = false; };
  }, [blocks, geo]);

  // The pages on screen come from the last complete measurement, so a re-measure (new data, fonts) swaps the new
  // layout in at once instead of dropping the book for a frame.
  const fresh = useMemo(() => (heights && heights.length === blocks.length && geo ? { blocks, paged: paginate(blocks, heights, geo.textH) } : null), [heights, blocks, geo]);
  const viewRef = useRef(null);
  if (fresh) viewRef.current = fresh;
  const view = viewRef.current;
  const paged = view?.paged || null;
  const shown = view?.blocks || [];
  useEffect(() => {
    if (paged && JSON.stringify(paged.chapterPages) !== JSON.stringify(chapterPages)) setChapterPages(paged.chapterPages);
  }, [paged]); // eslint-disable-line react-hooks/exhaustive-deps

  const pagedRef = useRef(null), blocksRef = useRef([]);
  pagedRef.current = paged; blocksRef.current = shown;
  const n = paged?.pages.length || 0;
  const spread = !!geo?.spread;
  const last = spread ? Math.floor(n / 2) : Math.max(0, n - 1);
  const spreadOf = p => Math.floor((p + 1) / 2);
  // What sits on each side of a spread. -1 is the closed book (its cover, alone); 'front' is the inside of the
  // cover with the bookplate, 'back' the endpaper inside the back cover.
  const leftOf = s => (s < 0 ? null : s === 0 ? 'front' : 2 * s - 1 < n ? 2 * s - 1 : 'back');
  const rightOf = s => (s < 0 ? 'cover' : 2 * s < n ? 2 * s : 'back');
  const firstPageOf = s => (s < 0 ? null : spread ? [leftOf(s), rightOf(s)] : [s]).find(x => typeof x === 'number');

  // Keep the reader on the same text when the book re-paginates (fonts arriving, game logs loading, a resize):
  // remember the first block on the visible page and find it again in the new pagination.
  const anchor = useRef(null);
  useLayoutEffect(() => {
    if (!paged || anchor.current == null) return;
    const k = shown.findIndex(b => b.key === anchor.current);
    if (k < 0) return;
    const p = paged.pages.findIndex(pg => pg.blocks.includes(k));
    if (p < 0) return;
    const want = spread ? spreadOf(p) : p;
    if (want !== pos && !anim.current.turn) setPos(want);
  }, [paged]); // eslint-disable-line react-hooks/exhaustive-deps
  // Land on a spread/page and remember the text there (set at the same moment, so a re-flow can't race it).
  const land = to => {
    const pg = pagedRef.current, fp = firstPageOf(to);
    if (pg && fp != null && pg.pages[fp]) anchor.current = blocksRef.current[pg.pages[fp].blocks[0]].key;
    setPos(to);
  };
  useEffect(() => { if (pos > last && n) setPos(last); }, [last, n, pos]);

  // ---- turning ----------------------------------------------------------------------------------------------

  // A turn moves one page by its corner along a fold (see fold.js). In "turn space" the turning page is [0,W]×[0,H]
  // with the spine at x = 0. Going back in a spread, the left page turns: turn space is mirrored (G flips x).
  // Going back on a phone, the previous page comes back from the left: the forward fold, played in reverse.
  const layoutTurn = t => {
    const W = geo.pageW, H = geo.pageH;
    const END = { x: -W, y: t.top ? 0 : H }, C = { x: W, y: t.top ? 0 : H };
    return { W, H, start: t.reverse ? END : C, end: t.reverse ? C : END };
  };

  const setFold = P => {
    const t = anim.current.turn; if (!t || !geo) return;
    const W = geo.pageW, H = geo.pageH;
    // A cover is a stiff board: it swings about the spine without curling, so its fold stays upright.
    if (t.from < 0 || t.to < 0) P = { x: Math.max(-W, Math.min(W, P.x)), y: t.top ? 0 : H };
    P = clampCorner(P, W, H, t.top);
    anim.current.P = P;
    const f = fold(P, W, H, t.top);
    const G = t.mirror ? (q => ({ x: W - q.x, y: q.y })) : (q => q);     // turn space -> the page's own coordinates
    const Hb = t.mirror ? (q => q) : (q => ({ x: W - q.x, y: q.y }));     // back page's coordinates -> turn space
    const front = frontEl.current, back = backEl.current, cast = castEl.current, flap = flapEl.current;
    const none = 'polygon(0 0, 0 0, 0 0)';
    if (front) front.style.clipPath = !f ? 'none' : f.front.length > 2 ? `polygon(${pts(f.front.map(G))})` : none;
    if (back) {
      if (!f || f.lifted.length < 3) back.style.visibility = 'hidden';
      else {
        const T = B => G(f.reflect(Hb(B)));
        const o = T({ x: 0, y: 0 }), ex = T({ x: 1, y: 0 }), ey = T({ x: 0, y: 1 });
        back.style.visibility = 'visible';
        back.style.transform = `matrix(${ex.x - o.x}, ${ex.y - o.y}, ${ey.x - o.x}, ${ey.y - o.y}, ${o.x}, ${o.y})`;
        back.style.clipPath = `polygon(${pts(f.lifted.map(Hb))})`;
      }
    }
    // Shading: a shadow cast on the page underneath, and the curve of light across the lifted flap.
    const shade = (svg, poly, from, dir, len) => {
      if (!svg) return;
      const g = svg.querySelector('linearGradient'), p = svg.querySelector('polygon');
      if (!f || poly.length < 3) { p.setAttribute('points', ''); return; }
      const a = G(from), b = G({ x: from.x + dir.x * len, y: from.y + dir.y * len });
      g.setAttribute('x1', a.x); g.setAttribute('y1', a.y); g.setAttribute('x2', b.x); g.setAttribute('y2', b.y);
      p.setAttribute('points', svgPts(poly.map(G)));
    };
    if (f) {
      const reach = Math.min(f.len, W) * 0.5 + 12;
      shade(cast, f.lifted, f.M, f.n, reach);
      shade(flap, f.flap, f.M, { x: -f.n.x, y: -f.n.y }, Math.max(30, Math.min(f.len, W)));
    } else { shade(cast, [], null); shade(flap, [], null); }
    // Opening or closing the cover slides the book so the closed book sits in the middle.
    if (spread && bookEl.current && (t.from === -1 || t.to === -1)) {
      const pr = t.reverse ? 1 - progress(P, W) : progress(P, W);
      const open = t.from === -1 ? pr : 1 - pr;
      bookEl.current.style.transform = `translateX(${(-geo.pageW / 2) * (1 - open)}px)`;
    }
  };

  const finish = useCallback((complete) => {
    const t = anim.current.turn;
    anim.current.turn = null;
    setTurn(null);
    if (complete && t) {
      // If the pages re-flowed mid-turn, land on the text the turn was heading for, not the old page number.
      const latest = pagedRef.current, k = t.anchorKey ? blocksRef.current.findIndex(b => b.key === t.anchorKey) : -1;
      const p = k >= 0 && latest ? latest.pages.findIndex(x => x.blocks.includes(k)) : -1;
      if (p >= 0) t.to = spread ? spreadOf(p) : p;
      land(t.to);
      // A turn asked for mid-turn starts next. Until it does, the book still counts as turning (and relative turns
      // count from where it is heading), so nothing slips in between the two.
      if (anim.current.queued != null) {
        const q = anim.current.queued; anim.current.queued = null; anim.current.next = q; setPending(true);
        setTimeout(() => { anim.current.next = null; setPending(false); startTurnRef.current(q); }, 0);
      }
      const pg = t.to < 0 ? [] : spread ? [leftOf(t.to), rightOf(t.to)].filter(x => typeof x === 'number') : [t.to];
      const ch = pg.length ? (pagedRef.current || paged).pages[pg[pg.length - 1]]?.ch ?? 0 : 0;
      setAnnounce(t.to < 0 ? 'The cover.' : `${pg.length === 2 ? `Pages ${pg[0] + 1} and ${pg[1] + 1}` : pg.length ? `Page ${pg[0] + 1}` : 'Endpaper'}${ch > 1 ? `: Chapter ${ROMAN[ch]}, ${CHAPTERS[ch]}` : ch === 1 ? ': Contents' : ''}.`);
    }
  }, [spread, paged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move the corner from where it is to the end of the turn (or back where it started), with a lift on the way.
  const animateTo = useCallback((complete, ms = TURN_MS) => {
    cancelAnimationFrame(anim.current.raf);
    const t = anim.current.turn; if (!t) return;
    const L = layoutTurn(t);
    const from = anim.current.P || L.start, to = complete ? L.end : L.start;
    if (complete) playTurn(t.from < 0 || t.to < 0 ? 'cover' : 'page');
    const dist = Math.hypot(to.x - from.x, to.y - from.y) / (2 * L.W);
    const dur = Math.max(160, ms * Math.min(1, dist));
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = ease3(k);
      const lift = Math.sin(Math.PI * e) * L.H * 0.12 * Math.min(1, dist) * (t.top ? -1 : 1);
      setFold({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - lift });
      if (k < 1) anim.current.raf = requestAnimationFrame(step);
      else finish(complete);
    };
    anim.current.raf = requestAnimationFrame(step);
  }, [finish, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTurn = useCallback((to, { drag = false, top = false } = {}) => {
    // A request while a page is still moving waits for it to land (fast tapping turns page after page).
    if (anim.current.turn) { if (!drag && to >= -1 && to <= last) anim.current.queued = to; return !drag; }
    if (!paged || to === pos || to < -1 || to > last) return false;
    const fp = firstPageOf(to);
    const dir = to > pos ? 1 : -1;
    const t = { dir, from: pos, to, top, mirror: spread && dir < 0, reverse: !spread && dir < 0, anchorKey: fp != null && paged?.pages[fp] ? shown[paged.pages[fp].blocks[0]].key : null };
    if (!motion) { anim.current.turn = t; playTurn(t.from < 0 || t.to < 0 ? 'cover' : 'page'); finish(true); return true; }
    anim.current.turn = t; anim.current.P = layoutTurn(t).start;
    setTurn(t);
    if (!drag) requestAnimationFrame(() => animateTo(true));
    return true;
  }, [pos, last, motion, animateTo, finish, paged, shown, spread, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTurnRef = useRef(startTurn);
  startTurnRef.current = startTurn;
  useLayoutEffect(() => { if (turn && anim.current.P) setFold(anim.current.P); }); // place freshly rendered pages
  // At rest the closed book sits centred; an open one doesn't move.
  useLayoutEffect(() => { if (!turn && bookEl.current && geo) bookEl.current.style.transform = spread && pos < 0 ? `translateX(${-geo.pageW / 2}px)` : ''; });

  const goPage = useCallback(p => { startTurn(spread ? spreadOf(p) : p); }, [startTurn, spread]);
  goPageRef.current = goPage;
  // Relative turns count from where the book is heading, so pressing → three times turns three pages.
  const heading = () => anim.current.queued ?? anim.current.next ?? anim.current.turn?.to ?? pos;
  const next = () => startTurn(heading() + 1);
  const prev = () => startTurn(heading() - 1);

  // Keys.
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.target.closest?.('input, select, textarea, .table-scroll')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      if (e.key === 'Home') { e.preventDefault(); startTurn(0); }
      if (e.key === 'End') { e.preventDefault(); startTurn(last); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // Touch and mouse: drag a page and its corner follows; let go past the middle (or flick) and it turns over.
  // A tap turns: on the right side of the book forward, on the left side back.
  const drag = useRef(null);
  const tapTurnAt = useRef(0);
  const onClickCapture = e => { if (performance.now() - tapTurnAt.current < 600) { e.preventDefault(); e.stopPropagation(); tapTurnAt.current = 0; } };
  const onPointerDown = e => {
    if (e.button > 0 || e.target.closest(INTERACTIVE) || anim.current.turn) return;
    const r = bookEl.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, started: false, top: e.clientY - r.top < r.height * 0.42, rx: (e.clientX - r.left) / r.width };
  };
  const onPointerMove = e => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.started) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.1) { if (Math.abs(dy) > 16) drag.current = null; return; }
      if (!startTurn(pos + (dx < 0 ? 1 : -1), { drag: true, top: d.top })) { drag.current = null; return; }
      d.started = true;
      bookEl.current?.setPointerCapture?.(e.pointerId);
    }
    const t = anim.current.turn; if (!t) return;
    const L = layoutTurn(t);
    const mx = t.mirror ? -dx : dx;
    cancelAnimationFrame(anim.current.raf);
    const P = { x: L.start.x + mx * 1.15, y: L.start.y + dy * 0.6 };
    const now = performance.now();
    d.vx = (mx - (d.lmx ?? 0)) / Math.max(1, now - (d.lt || d.t)); d.lmx = mx; d.lt = now;
    setFold(P);
  };
  const onPointerUp = e => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.started) {
      if (e.type !== 'pointerup' || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || window.getSelection?.()?.toString()) return;
      // A tap on the right of the book turns forward; on the left, back (a closed book opens from anywhere).
      if (pos < 0 || d.rx > (spread ? 0.5 : 0.35)) next(); else prev();
      // The click that follows this tap must not land on whatever the new page has under the finger.
      tapTurnAt.current = performance.now();
      return;
    }
    const t = anim.current.turn; if (!t) return;
    const L = layoutTurn(t);
    const pr = t.reverse ? 1 - progress(anim.current.P, L.W) : progress(anim.current.P, L.W);
    const flick = (t.reverse || t.mirror ? 1 : -1) * (d.vx || 0) > 0.5;
    animateTo(pr > 0.28 || flick, TURN_MS * 0.9);
  };

  // ---- rendering --------------------------------------------------------------------------------------------

  const renderPage = (k, side) => {
    if (k === 'cover') return <Cover book={book} player={player} shelf={shelf} />;
    if (k === 'front' || k === 'back') return <Endpaper side={k} shelf={shelf} id={id} name={name} onClose={onClose} />;
    const page = paged.pages[k];
    if (!page) return null;
    const ch = page.ch;
    return (
      <div className={`pg ${side}`} style={{ padding: `${geo.padTop}px ${geo.padX}px ${geo.padBottom}px` }}>
        <p className="pg-head" aria-hidden>{side === 'left' || !spread ? name : ch > 1 ? `${ROMAN[ch]} · ${CHAPTERS[ch]}` : ''}</p>
        <div className="pg-body">{page.blocks.map(b => <div className="blk" key={shown[b].key}>{shown[b].el}</div>)}</div>
        {ch > 0 && <p className="pg-folio" aria-hidden>{k + 1}</p>}
      </div>
    );
  };

  // What's where during a turn: the pages left lying underneath, the turning page's front, and its back.
  let baseL = null, baseR = null, face = null, back = null;
  if (!paged) baseR = 'cover'; // the pages are still coming: the book stays closed
  else {
    if (spread) {
      if (!turn) { baseL = leftOf(pos); baseR = rightOf(pos); }
      else if (turn.dir > 0) { baseL = leftOf(turn.from); baseR = rightOf(turn.to); face = rightOf(turn.from); back = leftOf(turn.to); }
      else { baseL = leftOf(turn.to); baseR = rightOf(turn.from); face = leftOf(turn.from); back = rightOf(turn.to); }
    } else {
      const at = p => (p < 0 ? 'cover' : p);
      if (!turn) baseR = at(pos);
      else if (turn.dir > 0) { baseR = at(turn.to); face = at(turn.from); }
      else { baseR = at(turn.from); face = at(turn.to); }
    }
  }
  const pagesLeftOfSpine = spread ? Math.max(0, 2 * pos - 1) : Math.max(0, pos);
  const curPage = pos < 0 ? 0 : spread ? (typeof rightOf(pos) === 'number' ? rightOf(pos) : n - 1) : pos;
  const curCh = paged ? paged.pages[Math.min(curPage, n - 1)]?.ch ?? 0 : 0;
  const bookW = geo ? (spread ? geo.pageW * 2 : geo.pageW) : 0;
  const leafLeft = turn && spread && !turn.mirror ? geo.pageW : 0;
  const closed = pos < 0 && !turn;
  const floating = closed && spread && motion && !reduced && !hidden; // on a phone the closed book fills the screen: no float

  return (
    <div className={`reader${hidden ? ' hidden' : ''}${arrived ? ' arrived' : ''}`} role="dialog" aria-modal="true" aria-labelledby="book-title" style={{ '--accent': shelf?.team ? teamCloth(shelf.team) : '#2b6fd6' }}>
      <h1 id="book-title" className="sr-only" tabIndex={-1} ref={head}>{name}</h1>
      <div className="reader-bar">
        <button className="btn" onClick={onClose}>← <span className="long">Back to the shelves</span><span className="short">Shelves</span></button>
        <span className="reader-title" aria-hidden>{name}</span>
        {!paged && !error && <span className="pg-count" role="status"><span className="spinner small" aria-hidden /> Fetching the pages…</span>}
        {paged && <span className="pg-count" aria-hidden>{(() => {
          if (pos < 0) return 'Cover';
          if (!spread) return `${pos + 1} / ${n}`;
          const vis = [leftOf(pos), rightOf(pos)].filter(x => typeof x === 'number').map(x => x + 1);
          return `${vis.length ? vis.join('–') : '—'} / ${n}`;
        })()}</span>}
        <button className="btn icon" onClick={() => { setSound(!snd); setSnd(!snd); }} aria-pressed={snd} aria-label="Page sounds" title={snd ? 'Page sounds on' : 'Page sounds off'}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" />{snd ? <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></> : <path d="M17 9l5 6M22 9l-5 6" />}</svg>
        </button>
      </div>

      <div className="book-wrap" ref={wrap}>
        {error ? <div className="pending" role="alert"><h2>This book won't open right now</h2><p>{error}</p><button className="btn" onClick={() => location.reload()}>Try again</button></div>
          : !geo ? <div className="pending" role="status"><h2 className="display">{name}</h2><p className="lede">{spanOf(player || {})}</p><p><span className="spinner" aria-hidden /> Fetching the pages…</p></div>
          : (
            <div className="desk" onPointerMove={onTilt} onPointerLeave={() => { tiltX.set(0); tiltY.set(0); }}>
            <M.div className="book-float" style={{ rotateX: tiltX, rotateY: tiltY }}
              animate={floating ? { y: [0, -8, 0] } : { y: 0 }}
              transition={floating ? { duration: 5.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.5, ease: 'easeOut' }}>
            <div
              ref={bookEl}
              className={`book ${spread ? 'spread2' : 'single'}${turn || pending ? ' turning' : ''}${closed ? ' closed' : ''}${turn && (turn.from < 0 || turn.to < 0) ? ' cover-turn' : ''}`}
              style={{ width: bookW, height: geo.pageH, '--pw': `${geo.pageW}px`, '--ph': `${geo.pageH}px`, '--text-h': `${geo.textH}px`, '--stack-l': `${Math.min(10, pagesLeftOfSpine * 0.7)}px`, '--stack-r': `${Math.min(10, (n - pagesLeftOfSpine) * 0.7)}px` }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}
            >
              <div className="boards" aria-hidden />
              {spread && <div className="half left base">{baseL != null && renderPage(baseL, 'left')}</div>}
              <div className="half right base">{baseR != null && renderPage(baseR, 'right')}</div>
              {turn && (<>
                <svg ref={castEl} className="fold-shade" style={{ left: leafLeft }} aria-hidden>
                  <defs><linearGradient id="cast-g" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#0a0a0e" stopOpacity=".38" /><stop offset="1" stopColor="#0a0a0e" stopOpacity="0" /></linearGradient></defs>
                  <polygon fill="url(#cast-g)" />
                </svg>
                <div ref={frontEl} className="leaf-front" style={{ left: leafLeft }} aria-hidden inert="">
                  {face != null && renderPage(face, spread && turn.mirror ? 'left' : 'right')}
                </div>
                <div ref={backEl} className="leaf-back" style={{ left: leafLeft }} aria-hidden inert="">
                  {back != null ? renderPage(back, turn.mirror ? 'right' : 'left') : <div className="pg paper-back" />}
                </div>
                <svg ref={flapEl} className="fold-shade top" style={{ left: leafLeft }} aria-hidden>
                  <defs><linearGradient id="flap-g" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#0a0a0e" stopOpacity=".28" /><stop offset=".22" stopColor="#ffffff" stopOpacity=".18" /><stop offset=".6" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#0a0a0e" stopOpacity=".06" /></linearGradient></defs>
                  <polygon fill="url(#flap-g)" />
                </svg>
              </>)}
              {spread && !closed && <i className="gutter" aria-hidden />}
              {pos > -1 && <button className="corner prev" onClick={prev} aria-label="Turn back a page"><i /></button>}
              {pos < last && <button className="corner next" onClick={next} aria-label={pos < 0 ? 'Open the book' : 'Turn the page'}><i /></button>}
            </div>
            </M.div>
            <M.i className="floor-shadow" aria-hidden style={{ width: closed ? geo.pageW : bookW }}
              animate={floating ? { scaleX: [1, 0.9, 1], opacity: [0.55, 0.38, 0.55] } : { scaleX: 1, opacity: 0.5 }}
              transition={floating ? { duration: 5.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.5 }} />
            </div>
          )}
      </div>
      {paged && (
        <nav className="chapter-pills" aria-label="Chapters" ref={pillsEl}>
          {[['cover', 'Cover', 'The cover'], ...CHAPTERS.map((c, k) => (paged.chapterPages[k] == null ? null : [k, ROMAN[k] ? `${ROMAN[k]} · ${c}` : k === 0 ? 'Title' : c, c])).filter(Boolean)].map(([k, label, full]) => {
            const on = k === 'cover' ? pos < 0 : pos >= 0 && curCh === k;
            return (
              <button key={k} type="button" className={`pill${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined} aria-label={full}
                onClick={() => (k === 'cover' ? startTurn(-1) : goPage(paged.chapterPages[k]))}>
                {on && <M.span className="pill-bg" layoutId="pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="pill-t">{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {geo && book && (
        <div className="measure" ref={measure} aria-hidden="true" inert="" style={{ width: geo.textW, '--text-h': `${geo.textH}px` }}>
          {blocks.map(b => <div className="blk" key={b.key}>{b.el}</div>)}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

// The front cover: the team's cloth, the player's photo and name. Opening it is the first page turn.
function Cover({ book, player, shelf }) {
  const [img, setImg] = useState('loading');
  const src = book?.headshot || (player?.i ? headshot(player.i) : null);
  const words = (book?.name || player?.n || '').toUpperCase().split(/\s+/);
  const initials = words.map(w => w[0]).slice(0, 2).join('');
  const start = book?.debut || (book?.regular ? book.regular.first - 1 : null);
  const years = book?.regular && start ? `${start}–${book.active ? 'now' : book.regular.last}` : spanOf(player || {});
  const cloth = shelf?.team ? teamCloth(shelf.team) : '#3a3f47';
  return (
    <div className="pg cover" style={{ '--cloth': cloth, '--cover-ink': inkOn(cloth), '--band': shelf?.team?.alt || '#d8b25a' }}>
      <p className="cover-imprint">Player Library</p>
      <div className={`cover-photo${img === 'ok' ? ' has' : ''}`}>
        {src && img !== 'none' && <img src={src} alt="" onLoad={() => setImg('ok')} onError={() => setImg('none')} />}
        {img !== 'ok' && <span className="cover-mono" aria-hidden>{initials}</span>}
      </div>
      <i className="cover-band" aria-hidden />
      <h2 className="cover-name">{words.map((w, k) => <span key={k} className={w.length > 9 ? 'long' : undefined}>{w}</span>)}</h2>
      <p className="cover-years">{[shelf?.team?.name, years].filter(Boolean).join(' · ')}</p>
      <p className="cover-hint">Swipe or tap to open</p>
    </div>
  );
}

// Before the title page: the back of the half-title leaf, with the bookplate. After the last page: the marbled
// endpaper inside the back cover.
function Endpaper({ side, shelf, id, name, onClose }) {
  return (
    <div className={`pg ${side === 'front' ? 'flyleaf left' : 'endpaper'} ${side}`}>
      {side === 'front' ? (
        <div className="bookplate">
          <p className="bp-ex">From the Player Library</p>
          <p className="bp-name">{name}</p>
          {shelf && <dl><dt>Shelf</dt><dd>{shelf.label}</dd>{shelf.team && <><dt>{shelf.retired ? 'Last team' : 'Team'}</dt><dd>{shelf.team.abbr}</dd></>}</dl>}
        </div>
      ) : (
        <div className="bookplate end">
          <p className="bp-name">The end</p>
          <button className="btn primary small" onClick={onClose}>Put the book back</button>
        </div>
      )}
    </div>
  );
}
