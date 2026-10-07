import { useEffect, useRef, useState } from 'react';
import { fmt, fmtStat, decimalsFor, SHORT, initials } from '../util.js';
import { Bubble, Star } from './Icons.jsx';

// counts up on the first few cards; the rest (off-screen at load) just show the number
function Num({ v, animate, decimals }) {
  const [n, setN] = useState(animate ? 0 : v);
  useEffect(() => {
    if (!animate) { setN(v); return; }
    let raf;
    const t0 = performance.now() + 700;
    const f = t => { const p = Math.min(1, Math.max(0, (t - t0) / 1100)); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <div className="num">{fmt(n, decimals)}</div>;
}

function Frame({ src, name, eager, rarity }) {
  const [ok, setOk] = useState(true);
  return (
    <div className="frame r" style={{ '--d': '.1s' }}>
      {src && ok
        ? <img src={src} alt={name} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setOk(false)} />
        : <div className="ph">{initials(name)}</div>}
      <span className={'gem ' + rarity}>{rarity}</span>
    </div>
  );
}

// the full line under the big number; the stat on screen is highlighted
const LINE_GAME = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'tov', 'min', 'fan'];
const LINE_TOTAL = ['gp', 'pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'min', 'fan'];
function StatLine({ c }) {
  const fields = c.kind === 'game' ? LINE_GAME : LINE_TOTAL;
  return (
    <div className="sl">
      {fields.map(f => (
        <div key={f} className={'slc' + (f === c.f ? ' on' : '')}>
          <small>{SHORT[f]}</small><span>{fmtStat(c.line[f] ?? 0, f)}</span>
        </div>
      ))}
    </div>
  );
}

function Notes({ k, book, open, onClose }) {
  const [text, setText] = useState('');
  const notes = book.notes(k);
  const post = () => { const x = text.trim(); if (!x) return; book.note(k, x); setText(''); };
  return (
    <div className={'cm' + (open ? ' open' : '')}>
      <div className="cm-hd"><span>NOTES</span><button className="ib" aria-label="Close notes" onClick={onClose}>✕</button></div>
      <div className="cl">
        {notes.length ? notes.map((c, i) => <p key={i}><b>{new Date(c.ts).toLocaleDateString()}</b>{c.text}</p>) : <p className="em">No notes yet.</p>}
      </div>
      <div className="ci">
        <input value={text} maxLength={280} placeholder="Add a note" onChange={e => setText(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') post(); }} />
        <button onClick={post}>SAVE</button>
      </div>
    </div>
  );
}

const rise = d => ({ className: 'r', style: { '--d': d + 's' } });

// Tilt + holographic glare that follows the mouse (touch devices get a slow idle shimmer instead)
function useTilt() {
  const ref = useRef(null);
  const move = e => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.style.setProperty('--rx', ((x - 0.5) * 7).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((0.5 - y) * 7).toFixed(2) + 'deg');
    el.classList.add('tilting');
  };
  const leave = () => { const el = ref.current; el.classList.remove('tilting'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
  return { ref, onPointerMove: move, onPointerLeave: leave };
}

export default function Slide({ c, i, book, onPlayer, onCollect }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const tilt = useTilt();
  const collected = book.has(c.k);
  const total = c.kind === 'total';
  return (
    <div className={'slide ' + c.rarity}>
      <div className="sc" {...tilt}>
        <div className="holo" aria-hidden="true" />
        <div className="txt">
          <div {...rise(0.2)}><div className="rk">RANK <b>#{i + 1}</b></div></div>
          <button className="nm r" style={{ '--d': '.35s' }} onClick={() => onPlayer(c)} aria-label={`Open ${c.n}'s player page`}>{c.n}<span className="go">↗</span></button>
          <div className="numrow r" style={{ '--d': '.5s' }}>
            <Num v={c.v} animate={i < 3} decimals={decimalsFor(c.f) && !Number.isInteger(c.v) ? 1 : 0} />
            <div className="lb">{total ? 'TOTAL ' : ''}{c.stat}</div>
          </div>
          {c.badges.length > 0 && (
            <div className="bdg r" style={{ '--d': '.65s' }}>{c.badges.map((b, j) => <span key={b} style={{ '--j': j }}>{b}</span>)}</div>
          )}
          <div {...rise(0.75)}><StatLine c={c} /></div>
          <div className="inf r" style={{ '--d': '.85s' }}>
            <div><small>{total ? 'TEAM' : 'GAME'}</small><span>{c.g}</span></div>
            <div><small>{c.scope === 'season' ? 'SEASON' : c.scope === 'week' ? 'WEEK' : 'DATE'}</small><span>{c.period}</span></div>
            {c.loaded && <div><small>THROUGH</small><span>{c.loaded}</span></div>}
          </div>
        </div>
        <Frame src={c.img} name={c.n} eager={i < 3} rarity={c.rarity} />
        <div className="rx r" style={{ '--d': '1s' }}>
          <button className={'rb2 star' + (collected ? ' on' : '')} aria-label={collected ? 'Remove from your Book' : 'Collect to your Book'}
            onClick={e => onCollect(c, e)}><Star /><span>{collected ? 'COLLECTED' : 'COLLECT'}</span></button>
          <button className={'rb2' + (notesOpen ? ' on' : '')} aria-label="Notes" onClick={() => setNotesOpen(!notesOpen)}><Bubble /><span>{book.notes(c.k).length}</span></button>
          <button className="rb2" aria-label={`Open ${c.n}'s player page`} onClick={() => onPlayer(c)}><span>PLAYER</span></button>
        </div>
        <Notes k={c.k} book={book} open={notesOpen} onClose={() => setNotesOpen(false)} />
      </div>
    </div>
  );
}

export function Empty({ msg, title = 'No games' }) {
  return (
    <div className="slide empty">
      <div className="sc"><div className="r" style={{ '--d': '.2s' }}><div className="nm">{title}</div><p>{msg}</p></div></div>
    </div>
  );
}
