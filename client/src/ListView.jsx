import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CASE, eraOf, span } from './shelves.js';

const POS = { G: 'guard', F: 'forward', C: 'center', PG: 'point guard', SG: 'shooting guard', SF: 'small forward', PF: 'power forward' };

// The same shelves without WebGL: one bookcase at a time, every spine a real button.
export default function ListView({ players, layout, focus, setFocus, onOpen, hidden }) {
  const [c, setC] = useState(() => (focus >= 0 ? layout.books[focus].c : 0));
  const refs = useRef(new Map());
  useEffect(() => { if (focus >= 0) setC(layout.books[focus].c); }, [focus, layout]);
  useEffect(() => {
    if (focus < 0 || hidden) return;
    const el = refs.current.get(focus);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  }, [focus, c, hidden]);

  const cs = layout.cases[c];
  const shelves = useMemo(() => {
    const out = Array.from({ length: CASE.shelves }, () => []);
    for (let n = cs.first; n <= cs.last; n++) out[layout.books[n].s].push(n);
    return out.filter(s => s.length);
  }, [cs, layout]);

  const onKey = (e, n) => {
    const b = layout.books[n];
    let m = null;
    if (e.key === 'ArrowRight') m = Math.min(layout.books.length - 1, n + 1);
    if (e.key === 'ArrowLeft') m = Math.max(0, n - 1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const want = b.s + (e.key === 'ArrowDown' ? 1 : -1);
      let bd = Infinity;
      for (let k = cs.first; k <= cs.last; k++) if (layout.books[k].s === want && Math.abs(layout.books[k].x - b.x) < bd) { bd = Math.abs(layout.books[k].x - b.x); m = k; }
    }
    if (m != null) { e.preventDefault(); setFocus(m); }
  };

  return (
    <section className="listview" aria-label="Shelf list" hidden={hidden}>
      <div className="case-tabs" role="tablist" aria-label="Bookcases">
        {layout.cases.map((k, i) => (
          <button key={i} role="tab" aria-selected={i === c} className={i === c ? 'on' : ''} onClick={() => { setC(i); setFocus(-1); }}>{k.label}</button>
        ))}
      </div>
      <div className="bookcase" role="tabpanel" aria-label={`Bookcase ${cs.label}`}>
        {shelves.map((row, s) => (
          <div className="shelf" key={s} role="list" aria-label={`Shelf ${s + 1}`}>
            {row.map(n => {
              const b = layout.books[n], p = players[b.i];
              const label = `${p.n}, ${span(p) || 'years not on record'}${p.p && POS[p.p] ? `, ${POS[p.p]}` : ''}`;
              return (
                <button
                  key={p.i} role="listitem" ref={el => (el ? refs.current.set(n, el) : refs.current.delete(n))}
                  className={`spine${n === focus ? ' on' : ''}`} tabIndex={n === focus || (focus < 0 && n === cs.first) ? 0 : -1}
                  style={{ '--w': `${Math.round(b.w * 1000)}px`, '--h': `${Math.round(b.h * 560)}px`, '--leather': eraOf(p).leather }}
                  aria-label={label} title={label}
                  onClick={() => (n === focus ? onOpen(n) : setFocus(n))} onDoubleClick={() => onOpen(n)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onOpen(n); } else onKey(e, n); }}
                >
                  {p.h?.mvp ? <i className="bands" style={{ '--n': Math.min(p.h.mvp, 6) }} aria-hidden /> : null}
                  <span className="spine-name">{p.l || p.n}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {focus >= 0 && layout.books[focus].c === c && (
        <div className="list-chosen" role="status">
          <strong>{players[layout.books[focus].i].n}</strong> <span>{span(players[layout.books[focus].i])}</span>
          <button className="btn small" onClick={() => onOpen(focus)}>Open book</button>
        </div>
      )}
    </section>
  );
}
