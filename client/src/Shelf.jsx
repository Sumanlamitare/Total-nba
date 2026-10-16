// One long shelf of spines that scrolls sideways. Only the books near the view are in the page, so the retired
// shelf (thousands of books) scrolls as smoothly as a team's. A pointer above the shelf shows the letter of the
// book under it, like the flapper on a prize wheel.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { spineOf, fitTitle, letterOf, span } from './shelves.js';

const scaleFor = w => (w <= 560 ? 0.86 : w <= 900 ? 0.92 : 1);
const AHEAD = 700; // px rendered either side of the view

export default function Shelf({ players, books, teamOf, shelfKey, hiddenId, target, onOpen, onLetter, motion }) {
  const scroller = useRef(null), pin = useRef(null);
  const [s, setS] = useState(() => scaleFor(innerWidth));
  const [view, setView] = useState({ left: 0, width: 1000 });
  const [fonts, setFonts] = useState(0);
  const [focus, setFocus] = useState(0);
  const [flash, setFlash] = useState(null);
  const [entering, setEntering] = useState(true);
  const keyNav = useRef(false);

  useEffect(() => {
    const on = () => setS(scaleFor(innerWidth));
    addEventListener('resize', on);
    let live = true;
    document.fonts?.ready.then(() => live && setFonts(f => f + 1));
    const done = () => live && setFonts(f => f + 1);
    document.fonts?.addEventListener?.('loadingdone', done);
    return () => { live = false; removeEventListener('resize', on); document.fonts?.removeEventListener?.('loadingdone', done); };
  }, []);

  // Each book's look and place along the shelf.
  const specs = useMemo(() => books.map(i => {
    const p = players[i], sp = spineOf(p, teamOf(p));
    return { p, sp, fit: fitTitle(p.n, sp) };
  }), [books, players, teamOf, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const padL = 40 * s, gap = 5 * s, pointerX = 66 * s;
  const xs = useMemo(() => {
    const out = new Array(specs.length); let x = padL;
    for (let k = 0; k < specs.length; k++) { out[k] = x; x += specs[k].sp.w * s + gap; }
    return out;
  }, [specs, s, padL, gap]);
  const lastW = specs.length ? specs[specs.length - 1].sp.w * s : 0;
  const end = specs.length ? xs[specs.length - 1] + lastW : padL;
  // Room after the last book so it, too, can reach the pointer.
  const width = Math.max(end + 40 * s, end + view.width - pointerX - lastW / 2);

  const indexAt = x => {
    let lo = 0, hi = specs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] + specs[m].sp.w * s < x) lo = m + 1; else hi = m; }
    return lo;
  };
  const first = specs.length ? indexAt(view.left - AHEAD) : 0;
  const last = specs.length ? indexAt(view.left + view.width + AHEAD) : -1;
  const under = specs.length ? indexAt(view.left + pointerX) : -1;
  const letter = under >= 0 ? letterOf(specs[under].p) : '';

  // Track the scroll position (one update per frame).
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    let raf = 0;
    const read = () => { raf = 0; setView({ left: el.scrollLeft, width: el.clientWidth }); };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    el.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on); ro.observe(el);
    // A mouse wheel turned up or down moves along the shelf.
    const wheel = e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) { e.preventDefault(); el.scrollLeft += e.deltaY; } };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('scroll', on); el.removeEventListener('wheel', wheel); ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // A new shelf starts at the beginning, and its books rise into place.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    el.style.scrollBehavior = 'auto'; el.scrollLeft = 0; el.style.scrollBehavior = '';
    setView(v => ({ ...v, left: 0 })); setFocus(0);
    if (!motion) return;
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 800);
    return () => clearTimeout(t);
  }, [shelfKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The letter under the pointer, and the pointer's little flick when it changes.
  const lastLetter = useRef('');
  useEffect(() => {
    if (letter === lastLetter.current) return;
    const was = lastLetter.current; lastLetter.current = letter;
    onLetter?.(letter);
    if (was && motion) pin.current?.animate([{ transform: 'rotate(-14deg)' }, { transform: 'rotate(6deg)', offset: 0.55 }, { transform: 'rotate(0)' }], { duration: 230, easing: 'ease-out' });
  }, [letter, onLetter, motion]);

  // Bring a book to the pointer (search, a letter, the book just put back) and, for a player, lift it briefly.
  useLayoutEffect(() => {
    if (!target || target.at == null || !specs[target.at]) return;
    const el = scroller.current;
    const x = xs[target.at] + (specs[target.at].sp.w * s) / 2 - pointerX - (target.center ? el.clientWidth / 2 - pointerX : 0);
    el.style.scrollBehavior = target.smooth && motion ? 'smooth' : 'auto';
    el.scrollLeft = Math.max(0, x);
    el.style.scrollBehavior = '';
    setView(v => ({ ...v, left: el.scrollLeft }));
    setFocus(target.at);
    if (target.flash) {
      setFlash(target.at); keyNav.current = !!target.focus;
      const t = setTimeout(() => setFlash(null), 1800);
      return () => clearTimeout(t);
    }
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: one tab stop for the shelf; arrows move along it.
  useEffect(() => {
    if (!keyNav.current) return;
    keyNav.current = false;
    scroller.current?.querySelector(`[data-k="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, view.left]);
  const onKeyDown = e => {
    const k = { ArrowRight: focus + 1, ArrowLeft: focus - 1, Home: 0, End: specs.length - 1, PageDown: focus + 10, PageUp: focus - 10 }[e.key];
    if (k == null) return;
    e.preventDefault();
    const to = Math.max(0, Math.min(specs.length - 1, k));
    const el = scroller.current, x = xs[to], w = specs[to].sp.w * s;
    if (x < el.scrollLeft + 20) el.scrollLeft = x - 20;
    else if (x + w > el.scrollLeft + el.clientWidth - 20) el.scrollLeft = x + w - el.clientWidth + 20;
    setView(v => ({ ...v, left: el.scrollLeft }));
    keyNav.current = true; setFocus(to);
  };

  const canLeft = view.left > 4, canRight = view.left < width - view.width - 4;
  const by = d => scroller.current?.scrollBy({ left: d * view.width * 0.8, behavior: motion ? 'smooth' : 'auto' });

  const items = [];
  for (let k = first; k <= last; k++) {
    const { p, sp, fit } = specs[k];
    const f = sp.font;
    items.push(
      <button key={p.i} type="button" className={`vol${flash === k ? ' flash' : ''}`} data-k={k} data-id={p.i}
        style={{ left: xs[k], visibility: hiddenId === p.i ? 'hidden' : undefined, '--d': `${Math.min(Math.max(0, k - first) * 14, 280)}ms` }}
        tabIndex={k === focus ? 0 : -1}
        aria-label={`${p.n}${span(p) ? `, ${span(p)}` : ''}. Open the book`}
        onClick={e => onOpen(p, e.currentTarget.firstElementChild)} onFocus={() => setFocus(k)}>
        <span className={`spine d-${sp.deco}`} style={{ '--w': sp.w, '--h': sp.h, '--bg': sp.bg, '--fg': sp.fg, '--fs': fit.fs, '--tf': f.family, '--tw': f.weight, '--tls': f.ls, '--ttt': f.upper ? 'uppercase' : 'none' }}>
          <span className="sp-top">{sp.deco === 'bands' && Array.from({ length: sp.mvp }, (_, j) => <i key={j} className="band" />)}</span>
          <span className="sp-mid"><span className={`t${fit.lines > 1 ? ' two' : ''}`}>{p.n}</span></span>
          <span className="sp-bot">{sp.fmvp > 0 && <span className="stars" aria-hidden>{'★'.repeat(sp.fmvp)}</span>}</span>
        </span>
      </button>,
    );
  }

  return (
    <div className="shelf" style={{ '--s': s }} data-left={canLeft} data-right={canRight}>
      {letter && <div className="pointer" aria-hidden style={{ left: pointerX }}><div className="pin" ref={pin}><span className="ptag">{letter}</span></div></div>}
      <div className="shelf-scroll" ref={scroller} onKeyDown={onKeyDown} role="group" aria-label="Books on this shelf, A to Z by surname">
        <div className={`shelf-inner${entering && motion ? ' entering' : ''}`} style={{ width }}>
          <div className="board" aria-hidden />
          {items}
          {!specs.length && <p className="empty">No books on this shelf yet.</p>}
        </div>
      </div>
      <button className="arrow prev" type="button" aria-label="Scroll the shelf left" tabIndex={canLeft ? 0 : -1} onClick={() => by(-1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M10 3L5 8l5 5" /></svg>
      </button>
      <button className="arrow next" type="button" aria-label="Scroll the shelf right" tabIndex={canRight ? 0 : -1} onClick={() => by(1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 3l5 5-5 5" /></svg>
      </button>
    </div>
  );
}
