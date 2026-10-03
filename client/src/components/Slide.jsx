import { useEffect, useState } from 'react';
import { fmt, headshot } from '../util.js';
import Reactions from './Reactions.jsx';

function Num({ v }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now() + 700;
    const f = t => { const p = Math.min(1, Math.max(0, (t - t0) / 1100)); setN(Math.round(v * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <div className="num">{fmt(n)}</div>;
}

function Frame({ id }) {
  const [ok, setOk] = useState(true);
  const src = headshot(id);
  return (
    <div className="frame r" style={{ '--d': '.1s' }}>
      {src && ok && <img src={src} alt="" onError={() => setOk(false)} />}
    </div>
  );
}

const rise = d => ({ className: 'r', style: { '--d': d + 's' } });

export default function Slide({ r, i, season, rx }) {
  return (
    <div className="slide">
      <div className="txt">
        <div {...rise(0.25)}><div className="rk">RANK <b>#{i + 1}</b></div></div>
        <div className="nm r" style={{ '--d': '.45s' }}>{r.n}</div>
        <div {...rise(0.65)}><Num v={r.v} /></div>
        <div {...rise(0.8)}><div className="lb">{r.stat}</div></div>
        <div className="inf r" style={{ '--d': '1s' }}>
          <div><small>{season ? 'TEAM' : 'GAME'}</small><span>{r.g}</span></div>
          {season && <div><small>PER GAME</small><span>{r.avg}</span></div>}
          <div><small>{season ? 'SEASON' : 'DATE'}</small><span>{r.period}</span></div>
        </div>
      </div>
      <Frame id={r.id} />
      <Reactions k={r.k} rx={rx} />
    </div>
  );
}

export function Empty({ msg }) {
  return (
    <div className="slide empty">
      <div className="r" style={{ '--d': '.2s' }}><div className="nm">No games</div><p>{msg}</p></div>
    </div>
  );
}
