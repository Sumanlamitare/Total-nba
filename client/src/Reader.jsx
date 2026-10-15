// The reader: a real book. Content is measured and packed into pages; pages are shown as a two-page spread
// (one page on narrow screens) and turn as leaves hinged at the spine — drag a page, swipe, click the corner,
// or use the arrow keys.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadBook, loadHighs } from './api.js';
import { span as spanOf } from './shelves.js';
import { buildBlocks, paginate, CHAPTERS, ROMAN, UI_DEFAULTS } from './chapters.jsx';

const ASPECT = 0.7; // page width / height
const TURN_MS = 720;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const INTERACTIVE = 'button, a, input, select, label, textarea, .table-scroll, .chart, [role=radio]';

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

export default function Reader({ id, player, layout, index, motion, onClose }) {
  const [state, setState] = useState({ book: null, error: null });
  const [highs, setHighs] = useState({ state: 'loading' });
  const [ui, setUiState] = useState(UI_DEFAULTS);
  const setUi = useCallback(patch => setUiState(u => ({ ...u, ...patch })), []);
  const wrap = useRef(null), measure = useRef(null), bookEl = useRef(null), leafEl = useRef(null), head = useRef(null);
  const geo = useGeometry(wrap);
  const [heights, setHeights] = useState(null);
  const [pos, setPos] = useState(0); // spread index (two pages) or page index (one page)
  const [turn, setTurn] = useState(null); // { dir, from, to }
  const anim = useRef({ p: 0, raf: 0 });
  const [announce, setAnnounce] = useState('');

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
  useEffect(() => { head.current?.focus(); }, []);

  const { book, error } = state;
  const name = book?.name || player?.n || '';
  const shelf = index != null && layout ? { cs: layout.cases[layout.books[index].c], s: layout.books[index].s + 1 } : null;

  // Pages: blocks -> measured heights -> packed pages. Two passes so the contents page can show page numbers.
  const [chapterPages, setChapterPages] = useState(null);
  const goPageRef = useRef(() => {});
  const blocks = useMemo(() => (book ? buildBlocks(book, { ui, setUi, highs, player, shelf, chapterPages, goPage: p => goPageRef.current(p) }) : []),
    [book, ui, setUi, highs, player, shelf?.cs, shelf?.s, chapterPages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const paged = useMemo(() => (heights && heights.length === blocks.length && geo ? paginate(blocks, heights, geo.textH) : null), [heights, blocks, geo]);
  useEffect(() => {
    if (paged && JSON.stringify(paged.chapterPages) !== JSON.stringify(chapterPages)) setChapterPages(paged.chapterPages);
  }, [paged]); // eslint-disable-line react-hooks/exhaustive-deps

  const pagedRef = useRef(null), blocksRef = useRef([]);
  pagedRef.current = paged; blocksRef.current = blocks;
  const n = paged?.pages.length || 0;
  const spread = !!geo?.spread;
  const last = spread ? Math.floor(n / 2) : Math.max(0, n - 1);
  const spreadOf = p => Math.floor((p + 1) / 2);
  // What sits on each side of a spread: 'front'/'back' are the marbled pastedowns inside the covers.
  const leftOf = s => (s === 0 ? 'front' : 2 * s - 1 < n ? 2 * s - 1 : 'back');
  const rightOf = s => (2 * s < n ? 2 * s : 'back');
  const firstPageOf = s => (spread ? [leftOf(s), rightOf(s)] : [s]).find(x => typeof x === 'number');

  // Keep the reader on the same text when the book re-paginates (fonts arriving, game logs loading, a resize):
  // remember the first block on the visible page and find it again in the new pagination.
  const anchor = useRef(null);
  useLayoutEffect(() => {
    if (!paged || anchor.current == null) return;
    const k = blocks.findIndex(b => b.key === anchor.current);
    if (k < 0) return;
    const p = paged.pages.findIndex(pg => pg.blocks.includes(k));
    if (p < 0) return;
    const want = spread ? spreadOf(p) : p;
    if (want !== pos && !anim.current.turn) setPos(want);
  }, [paged]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!paged) return;
    const p = firstPageOf(pos);
    if (p != null && paged.pages[p]) anchor.current = blocks[paged.pages[p].blocks[0]].key;
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pos > last && n) setPos(last); }, [last, n, pos]);

  // ---- turning ----------------------------------------------------------------------------------------------

  const setP = p => {
    anim.current.p = p;
    const leaf = leafEl.current, bk = bookEl.current;
    if (!leaf || !bk) return;
    const t = anim.current.turn;
    // Spread: the leaf hinges at the spine. One page: it hinges at the left edge and swings away (or back).
    const angle = spread ? (t.dir > 0 ? -180 * p : 180 * p) : (t.dir > 0 ? -180 * p : -180 * (1 - p));
    leaf.style.transform = `rotateY(${angle}deg)`;
    const s = Math.sin(Math.PI * p);
    bk.style.setProperty('--lift', s.toFixed(3));
    bk.style.setProperty('--p', p.toFixed(3));
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
      setPos(t.to);
      const pg = spread ? [leftOf(t.to), rightOf(t.to)].filter(x => typeof x === 'number') : [t.to];
      const ch = pg.length ? (pagedRef.current || paged).pages[pg[pg.length - 1]]?.ch ?? 0 : 0;
      setAnnounce(`${pg.length === 2 ? `Pages ${pg[0] + 1} and ${pg[1] + 1}` : pg.length ? `Page ${pg[0] + 1}` : 'Endpaper'}${ch > 1 ? `: Chapter ${ROMAN[ch]}, ${CHAPTERS[ch]}` : ch === 1 ? ': Contents' : ''}.`);
    }
  }, [spread, paged]); // eslint-disable-line react-hooks/exhaustive-deps

  const animateTo = useCallback((target, ms = TURN_MS) => {
    cancelAnimationFrame(anim.current.raf);
    const from = anim.current.p, t0 = performance.now();
    const dur = Math.max(120, ms * Math.abs(target - from));
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      setP(from + (target - from) * ease(k));
      if (k < 1) anim.current.raf = requestAnimationFrame(step);
      else finish(target === 1);
    };
    anim.current.raf = requestAnimationFrame(step);
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTurn = useCallback((to, { drag = false } = {}) => {
    if (anim.current.turn || to === pos || to < 0 || to > last) return false;
    const fp = firstPageOf(to);
    const t = { dir: to > pos ? 1 : -1, from: pos, to, anchorKey: fp != null && paged?.pages[fp] ? blocks[paged.pages[fp].blocks[0]].key : null };
    if (!motion) { anim.current.turn = t; finish(true); return true; }
    anim.current.turn = t; anim.current.p = 0;
    setTurn(t);
    if (!drag) requestAnimationFrame(() => animateTo(1));
    return true;
  }, [pos, last, motion, animateTo, finish, paged, blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { if (turn) setP(anim.current.p); }); // place a freshly rendered leaf

  const goPage = useCallback(p => { startTurn(spread ? spreadOf(p) : p); }, [startTurn, spread]);
  goPageRef.current = goPage;
  const next = () => startTurn(pos + 1);
  const prev = () => startTurn(pos - 1);

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

  // Dragging a page: the leaf follows the pointer; let go past a third of the way (or flick) and it turns.
  const drag = useRef(null);
  const onPointerDown = e => {
    if (e.button > 0 || e.target.closest(INTERACTIVE) || anim.current.turn) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, started: false };
  };
  const onPointerMove = e => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.started) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 14) drag.current = null; return; }
      if (!startTurn(pos + (dx < 0 ? 1 : -1), { drag: true })) { drag.current = null; return; }
      d.started = true; d.dir = dx < 0 ? 1 : -1;
      bookEl.current?.setPointerCapture?.(e.pointerId);
    }
    const span = spread ? geo.pageW * 1.6 : geo.pageW * 1.1;
    const p = Math.max(0, Math.min(1, (d.dir > 0 ? -dx : dx) / span));
    d.v = (p - (d.p || 0)) / Math.max(1, performance.now() - (d.lt || d.t)); d.p = p; d.lt = performance.now();
    cancelAnimationFrame(anim.current.raf);
    setP(p);
  };
  const onPointerUp = e => {
    const d = drag.current; drag.current = null;
    if (!d || !d.started) return;
    animateTo(anim.current.p > 0.33 || (d.v || 0) > 0.0015 ? 1 : 0, TURN_MS * 0.8);
  };

  // ---- rendering --------------------------------------------------------------------------------------------

  const renderPage = (k, side) => {
    if (k === 'front' || k === 'back') return <Endpaper side={k} shelf={shelf} id={id} name={name} onClose={onClose} />;
    const page = paged.pages[k];
    const ch = page.ch;
    return (
      <div className={`pg ${side}`} style={{ padding: `${geo.padTop}px ${geo.padX}px ${geo.padBottom}px` }}>
        <p className="pg-head" aria-hidden>{side === 'left' || !spread ? name : ch > 1 ? `${ROMAN[ch]} · ${CHAPTERS[ch]}` : ''}</p>
        <div className="pg-body">{page.blocks.map(b => <div className="blk" key={blocks[b].key}>{blocks[b].el}</div>)}</div>
        {ch > 0 && <p className="pg-folio" aria-hidden>{k + 1}</p>}
      </div>
    );
  };

  let baseL = null, baseR = null, face = null, back = null;
  if (paged) {
    if (spread) {
      if (!turn) { baseL = leftOf(pos); baseR = rightOf(pos); }
      else if (turn.dir > 0) { baseL = leftOf(turn.from); baseR = rightOf(turn.to); face = rightOf(turn.from); back = leftOf(turn.to); }
      else { baseL = leftOf(turn.to); baseR = rightOf(turn.from); face = leftOf(turn.from); back = rightOf(turn.to); }
    } else if (!turn) baseR = pos;
    else if (turn.dir > 0) { baseR = turn.to; face = turn.from; }
    else { baseR = turn.from; face = turn.to; }
  }
  const pagesLeftOfSpine = spread ? Math.max(0, 2 * pos - 1) : pos;
  const curPage = spread ? (typeof rightOf(pos) === 'number' ? rightOf(pos) : n - 1) : pos;
  const curCh = paged ? paged.pages[Math.min(curPage, n - 1)]?.ch ?? 0 : 0;
  const bookW = geo ? (spread ? geo.pageW * 2 : geo.pageW) : 0;

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-labelledby="book-title">
      <h1 id="book-title" className="sr-only" tabIndex={-1} ref={head}>{name}</h1>
      <div className="reader-bar">
        <button className="btn small" onClick={onClose}>← <span className="long">Return to the shelves</span><span className="short">Shelves</span> <kbd className="long">Esc</kbd></button>
        {paged && (
          <label className="chapter-pick">
            <span className="sr-only">Chapter</span>
            <select value={curCh} onChange={e => goPage(paged.chapterPages[e.target.value])}>
              {CHAPTERS.map((c, k) => paged.chapterPages[k] == null ? null : <option key={c} value={k}>{ROMAN[k] ? `${ROMAN[k]}. ` : ''}{c}</option>)}
            </select>
          </label>
        )}
        {paged && <span className="pg-count" aria-hidden>{(() => {
          if (!spread) return `${pos + 1} / ${n}`;
          const vis = [leftOf(pos), rightOf(pos)].filter(x => typeof x === 'number').map(x => x + 1);
          return `${vis.length ? vis.join('–') : '—'} / ${n}`;
        })()}</span>}
      </div>

      <div className="book-wrap" ref={wrap}>
        {error ? <div className="pending" role="alert"><h2>This book won't open right now</h2><p>{error}</p><button className="btn" onClick={() => location.reload()}>Try again</button></div>
          : !paged || !geo ? <div className="pending" role="status"><h2 className="display">{name}</h2><p className="lede">{spanOf(player || {})}</p><p><span className="spinner" aria-hidden /> Fetching the pages from ESPN…</p></div>
          : (
            <div
              ref={bookEl}
              className={`book ${spread ? 'spread2' : 'single'}${turn ? ` turning dir${turn.dir > 0 ? 'f' : 'b'}` : ''}`}
              style={{ width: bookW, height: geo.pageH, '--pw': `${geo.pageW}px`, '--ph': `${geo.pageH}px`, '--text-h': `${geo.textH}px`, '--stack-l': `${Math.min(10, pagesLeftOfSpine * 0.7)}px`, '--stack-r': `${Math.min(10, (n - pagesLeftOfSpine) * 0.7)}px` }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            >
              <div className="boards" aria-hidden />
              {spread && <div className="half left base">{baseL != null && renderPage(baseL, 'left')}<i className="shade" /></div>}
              <div className="half right base">{baseR != null && renderPage(baseR, 'right')}<i className="shade" /></div>
              {turn && (
                <div ref={leafEl} className={`leaf3d ${spread ? (turn.dir > 0 ? 'on-right' : 'on-left') : turn.dir > 0 ? 'single-f' : 'single-b'}`} aria-hidden inert="">
                  <div className="face front">{face != null && renderPage(face, spread && turn.dir < 0 ? 'left' : 'right')}<i className="shade" /></div>
                  <div className="face back">{back != null ? renderPage(back, turn.dir > 0 ? 'left' : 'right') : <div className="pg paper-back" />}<i className="shade" /></div>
                </div>
              )}
              {spread && <i className="gutter" aria-hidden />}
              {pos > 0 && <button className="corner prev" onClick={prev} aria-label="Turn back a page"><i /></button>}
              {pos < last && <button className="corner next" onClick={next} aria-label="Turn the page"><i /></button>}
            </div>
          )}
      </div>

      {geo && book && (
        <div className="measure" ref={measure} aria-hidden="true" inert="" style={{ width: geo.textW, '--text-h': `${geo.textH}px` }}>
          {blocks.map(b => <div className="blk" key={b.key}>{b.el}</div>)}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

// Before the title page: the back of the half-title leaf, with the bookplate. After the last page: the marbled
// endpaper inside the back cover.
function Marbling({ seed }) {
  // Combed stripes pushed around by turbulence: the look of hand-marbled endpaper.
  const colors = ['#5c1f18', '#1f3355', '#b88c45', '#e8dcc0', '#24453f', '#7a2a20', '#2a2f52', '#c9a25a'];
  const fid = `marble-${seed}`;
  return (
    <svg className="marble" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id={`${fid}-p`} width="400" height="48" patternUnits="userSpaceOnUse">
          {colors.map((c, k) => <rect key={c} x="0" y={k * 6} width="400" height="6" fill={c} />)}
        </pattern>
        <filter id={fid} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.018" numOctaves="3" seed={seed} result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="190" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect x="-60" y="-60" width="520" height="680" fill={`url(#${fid}-p)`} filter={`url(#${fid})`} transform="rotate(-8 200 280)" />
    </svg>
  );
}

function Endpaper({ side, shelf, id, name, onClose }) {
  return (
    <div className={`pg ${side === 'front' ? 'flyleaf left' : 'endpaper'} ${side}`}>
      {side === 'back' && <Marbling seed={4} />}
      {side === 'front' ? (
        <div className="bookplate">
          <p className="bp-ex">Ex libris</p>
          <p className="bp-lib">The Player Library</p>
          <p className="bp-name">{name}</p>
          {shelf && <dl><dt>Shelf mark</dt><dd>{shelf.cs.label} · {shelf.s}</dd><dt>ESPN no.</dt><dd>{id}</dd></dl>}
        </div>
      ) : (
        <div className="bookplate end">
          <p className="bp-lib">Finis</p>
          <button className="btn small" onClick={onClose}>Return the book to its shelf</button>
        </div>
      )}
    </div>
  );
}
