import { useEffect, useState } from 'react';
import { fmt } from '../util.js';
import Reactions from './Reactions.jsx';

// counts up on the first few cards; the rest (off-screen at load) just show the number
function Num({ v, animate }) {
  const [n, setN] = useState(animate ? 0 : v);
  useEffect(() => {
    if (!animate) { setN(v); return; }
    let raf;
    const t0 = performance.now() + 700;
    const f = t => { const p = Math.min(1, Math.max(0, (t - t0) / 1100)); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <div className="num">{fmt(n)}</div>;
}

const initials = n => (n || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('');

function Frame({ src, name, eager }) {
  const [ok, setOk] = useState(true);
  return (
    <div className="frame r" style={{ '--d': '.1s' }}>
      {src && ok
        ? <img src={src} alt={name} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setOk(false)} />
        : <div className="ph">{initials(name)}</div>}
    </div>
  );
}

const rise = d => ({ className: 'r', style: { '--d': d + 's' } });

export default function Slide({ r, i, season, rx }) {
  return (
    <div className="slide">
      <div className="sc">
        <div className="txt">
          <div {...rise(0.25)}><div className="rk">RANK <b>#{i + 1}</b></div></div>
          <div className="nm r" style={{ '--d': '.4s' }}>{r.n}</div>
          <div {...rise(0.55)}><Num v={r.v} animate={i < 3} /></div>
          <div {...rise(0.7)}><div className="lb">{season ? 'TOTAL ' : ''}{r.stat}</div></div>
          <div className="inf r" style={{ '--d': '.85s' }}>
            <div><small>{season ? 'TEAM' : 'GAME'}</small><span>{r.g}</span></div>
            {season && <div><small>GAMES</small><span>{r.gp}</span></div>}
            {!season && r.min != null && <div><small>MINUTES</small><span>{r.min}</span></div>}
            <div><small>{season ? 'SEASON' : 'DATE'}</small><span>{r.period}</span></div>
            {r.loaded && <div><small>THROUGH</small><span>{r.loaded}</span></div>}
          </div>
        </div>
        <Frame src={r.img} name={r.n} eager={i < 3} />
        <Reactions k={r.k} rx={rx} />
      </div>
    </div>
  );
}

export function Empty({ msg }) {
  return (
    <div className="slide empty">
      <div className="sc"><div className="r" style={{ '--d': '.2s' }}><div className="nm">No games</div><p>{msg}</p></div></div>
    </div>
  );
}
