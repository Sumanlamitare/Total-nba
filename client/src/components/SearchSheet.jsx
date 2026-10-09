import { useEffect, useRef, useState } from 'react';
import { search } from '../api.js';
import { photo, initials } from '../util.js';
import { Search } from './Icons.jsx';

function Face({ id, name }) {
  const [ok, setOk] = useState(true);
  return <span className="sr-face">{id && ok ? <img src={photo(id)} alt="" loading="lazy" onError={() => setOk(false)} /> : initials(name)}</span>;
}

// Find any player stored since 1993-94 and open their page
export default function SearchSheet({ onPick }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const input = useRef(null);
  useEffect(() => { setTimeout(() => input.current?.focus(), 80); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    let alive = true;
    const t = setTimeout(() => search(q).then(r => alive && setRes(r)).catch(() => alive && setRes([])), 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const yr = s => (s ? s.slice(0, 4) : '');
  return (
    <div className="ssheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Search players">
      <label className="sbox"><Search /><input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search any player since 1993…" aria-label="Player name"
        onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); if (e.key === 'Enter' && res?.[0]) onPick(res[0].key); }} /></label>
      <div className="slist sr">
        {res === null && <p className="sr-hint">Try “Kobe”, “Curry” or “Wemban”.</p>}
        {res && !res.length && <p className="sr-hint">No players found.</p>}
        {res?.map((p, i) => (
          <button key={p.key} className="li sr-row" style={{ '--i': i }} onClick={() => onPick(p.key)}>
            <Face id={p.espnId} name={p.name} />
            <span className="li-main">{p.name}<small>{p.team} · {yr(p.first)}–{yr(p.last)}</small></span>
            <span className="li-sub">{p.gp.toLocaleString()} GP</span>
          </button>
        ))}
      </div>
    </div>
  );
}
