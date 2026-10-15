import React, { useEffect, useMemo, useRef, useState } from 'react';
import { searchPlayers } from './api.js';
import { span } from './shelves.js';
import { localSearch } from './search.js';

const POS = { G: 'Guard', F: 'Forward', C: 'Center', PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward' };
// The card catalogue: search by name; choosing a card walks you to the book's shelf.
export default function Catalogue({ players, layout, indexOf, onClose, onGo, onOpen, onAdded }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState({ state: 'idle', q: '' });
  const input = useRef(null);
  const dialog = useRef(null);
  const results = useMemo(() => localSearch(players, q), [players, q]);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [q]);

  // Few local hits: ask ESPN (it may know a player the shelves don't hold yet).
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3 || results.length >= 3) { setRemote({ state: 'idle', q: '' }); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setRemote({ state: 'busy', q: t });
      searchPlayers(t, ctl.signal)
        .then(r => { if (r.results?.length) onAdded(r.results); setRemote({ state: 'done', q: t, added: r.added?.length || 0 }); })
        .catch(e => { if (e.name !== 'AbortError') setRemote({ state: 'error', q: t, msg: e.message }); });
    }, 450);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q, results.length, onAdded]);

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); (e.shiftKey ? onOpen : onGo)(results[active].i); }
    if (e.key === 'Tab') { // keep focus inside the drawer
      const f = [...dialog.current.querySelectorAll('button, input')]; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <div className="drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="cat-title" ref={dialog} onKeyDown={onKey}>
        <div className="drawer-head">
          <h2 id="cat-title">Card catalogue</h2>
          <button className="close" onClick={onClose} aria-label="Close the catalogue">×</button>
        </div>
        <label className="search-field">
          <span className="sr-only">Player name</span>
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name — e.g. Russell, Curry, Wembanyama"
            role="combobox" aria-expanded={results.length > 0} aria-controls="cat-results" aria-activedescendant={results[active] ? `card-${results[active].i}` : undefined} autoComplete="off" spellCheck="false" />
        </label>
        <ul className="cards" id="cat-results" role="listbox" aria-label="Matching players">
          {results.map((p, k) => {
            const n = indexOf.get(p.i), b = n != null ? layout.books[n] : null;
            return (
              <li key={p.i} id={`card-${p.i}`} role="option" aria-selected={k === active} className={`card${k === active ? ' on' : ''}`} onMouseEnter={() => setActive(k)}>
                <button className="card-main" onClick={() => onGo(p.i)}>
                  <span className="card-name">{p.n}</span>
                  <span className="card-meta">{[span(p), POS[p.p] || p.p, (p.t || []).slice(0, 4).join(' · ')].filter(Boolean).join(' — ')}</span>
                  {b && <span className="card-loc">Bookcase {layout.cases[b.c].label} · shelf {b.s + 1}</span>}
                </button>
                <button className="btn small" onClick={() => onOpen(p.i)} aria-label={`Open ${p.n}`}>Open</button>
              </li>
            );
          })}
        </ul>
        <p className="cat-foot" role="status">
          {q.trim().length < 2 ? `${players.length.toLocaleString('en-US')} players on the shelves. Enter takes you to the shelf; Shift+Enter opens the book.` :
            remote.state === 'busy' ? 'Asking ESPN about players not yet shelved…' :
            remote.state === 'error' ? `ESPN search failed: ${remote.msg}` :
            !results.length && remote.state === 'done' ? `No NBA player called “${q.trim()}” on ESPN's record.` :
            remote.state === 'done' && remote.added ? `ESPN found ${remote.added} more; they have been shelved.` :
            `${results.length} match${results.length === 1 ? '' : 'es'}`}
        </p>
      </div>
    </div>
  );
}
