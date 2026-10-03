import { useEffect, useState } from 'react';
import { fmt } from '../util.js';
import Reactions from './Reactions.jsx';

function Num({ v, decimals = 0 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now() + 700;
    const f = t => { const p = Math.min(1, Math.max(0, (t - t0) / 1100)); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <div className="num">{fmt(n, decimals)}</div>;
}

function Frame({ src }) {
  const [ok, setOk] = useState(true);
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
        <div {...rise(0.65)}><Num v={r.v} decimals={r.decimals} /></div>
        <div {...rise(0.8)}><div className="lb">{r.stat}{r.perGame && ' PER GAME'}</div></div>
        <div className="inf r" style={{ '--d': '1s' }}>
          <div><small>{season ? 'TEAM' : 'GAME'}</small><span>{r.g}</span></div>
          {season && <div><small>GAMES</small><span>{r.gp}</span></div>}
          <div><small>{season ? 'SEASON' : 'DATE'}</small><span>{r.period}</span></div>
        </div>
      </div>
      <Frame src={r.img} />
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
