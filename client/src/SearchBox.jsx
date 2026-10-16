// Search every shelf by name. Choosing a player takes you to the shelf and brings the book to the pointer;
// Shift+Enter (or Open) takes the book straight down. Players the catalogue doesn't hold are looked up on ESPN.
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { searchPlayers } from './api.js';
import { span, teamCloth, RETIRED, ALL } from './shelves.js';
import { localSearch } from './search.js';

const SearchBox = forwardRef(function SearchBox({ players, placeOf, teamById, onGo, onOpen, onAdded }, input) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState({ state: 'idle' });
  const results = useMemo(() => localSearch(players, q, 8), [players, q]);
  useEffect(() => { setActive(0); }, [q]);

  // Few local hits: ask ESPN (it may know a player the shelves don't hold yet).
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3 || results.length >= 3) { setRemote({ state: 'idle' }); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setRemote({ state: 'busy' });
      searchPlayers(t, ctl.signal)
        .then(r => { if (r.results?.length) onAdded(r.results); setRemote({ state: 'done' }); })
        .catch(e => { if (e.name !== 'AbortError') setRemote({ state: 'error', msg: e.message }); });
    }, 450);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q, results.length, onAdded]);

  const choose = (p, openIt) => { setOpen(false); setQ(''); input.current?.blur(); (openIt ? onOpen : onGo)(p.i); };
  const onKey = e => {
    if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active], e.shiftKey); }
  };
  const where = p => {
    const pl = placeOf.get(p.i);
    if (!pl) return { label: 'Not shelved yet' };
    if (pl.shelf === RETIRED) return { label: 'Retired', color: teamCloth(teamById.get(p.tm)) };
    if (pl.shelf === ALL) return { label: 'Active, not on a team' };
    const t = teamById.get(pl.shelf);
    return { label: t.name, color: teamCloth(t) };
  };
  const show = open && q.trim().length > 0;

  return (
    <div className="search" role="search">
      <label className="search-field">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
        <span className="sr-only">Search players</span>
        <input ref={input} type="search" value={q} placeholder="Search any player" autoComplete="off" spellCheck="false"
          role="combobox" aria-expanded={show && results.length > 0} aria-controls="search-results" aria-autocomplete="list"
          aria-activedescendant={show && results[active] ? `sr-${results[active].i}` : undefined} aria-keyshortcuts="/"
          onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      </label>
      {show && (
        <div className="results">
          <ul id="search-results" role="listbox" aria-label="Matching players">
            {results.map((p, k) => {
              const w = where(p);
              return (
                <li key={p.i} id={`sr-${p.i}`} role="option" aria-selected={k === active} className={k === active ? 'on' : undefined} onMouseEnter={() => setActive(k)}>
                  <button type="button" className="r-main" onMouseDown={e => e.preventDefault()} onClick={() => choose(p, false)}>
                    <span className="r-name">{p.n}</span>
                    <span className="r-meta">{w.color && <i className="dot" style={{ background: w.color }} aria-hidden />}{[w.label, span(p)].filter(Boolean).join(' · ')}</span>
                  </button>
                  <button type="button" className="r-open" onMouseDown={e => e.preventDefault()} onClick={() => choose(p, true)} aria-label={`Open ${p.n}`}>Open</button>
                </li>
              );
            })}
          </ul>
          <p className="r-foot" role="status">
            {remote.state === 'busy' ? 'Asking ESPN about players not yet shelved…'
              : remote.state === 'error' ? `ESPN search failed: ${remote.msg}`
              : !results.length && remote.state === 'done' ? `No NBA player called “${q.trim()}” on ESPN's record.`
              : !results.length ? 'No match yet…'
              : 'Enter goes to the shelf · Shift+Enter opens the book'}
          </p>
        </div>
      )}
    </div>
  );
});
export default SearchBox;
