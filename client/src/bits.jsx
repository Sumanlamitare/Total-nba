// Small shared pieces: headshots, rating badges, the count-up number and the half-court lineup.
import React, { useEffect, useRef, useState } from 'react';
import { motion as M, useReducedMotion } from 'motion/react';
import { headshot } from './api.js';
import { SLOTS, surname } from './game.js';

const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export function Face({ p, size = 56, ring }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="face" style={{ width: size, height: size, '--ring': ring || 'rgba(255,255,255,.18)' }}>
      {!failed && p?.i ? <img src={headshot(p.i)} alt="" loading="lazy" onError={() => setFailed(true)} /> : <b style={{ fontSize: size * 0.34 }}>{initials(p?.n)}</b>}
    </span>
  );
}

// Overall rating as a little scoreboard tile, coloured by tier.
export const tier = v => (v >= 90 ? 'gold' : v >= 82 ? 'orange' : v >= 74 ? 'blue' : 'grey');
export const Ovr = ({ v, big }) => <span className={`ovr ${tier(v)}${big ? ' big' : ''}`} aria-label={`Overall ${v}`}>{v}</span>;

export function CountUp({ to, dur = 900, decimals = 0, from = 0 }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : from);
  const start = useRef(from);
  useEffect(() => {
    if (reduce) { setV(to); return; }
    const a = start.current, t0 = performance.now(); let id;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setV(a + (to - a) * e);
      if (k < 1) id = requestAnimationFrame(step); else start.current = to;
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [to, dur, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

export const line = p => [p.ppg != null && `${p.ppg} pts`, p.rpg != null && `${p.rpg} reb`, p.apg != null && `${p.apg} ast`].filter(Boolean).join(' · ');

// The half court, seen from above the basket: five spots, filled as players are signed.
const SPOT = { PG: [50, 18], SG: [84, 36], SF: [16, 36], PF: [70, 70], C: [32, 74] };
export function Court({ lineup, label, eraOf, highlight = [], compact }) {
  return (
    <div className={`court${compact ? ' compact' : ''}`} aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="court-lines">
        <rect x="1" y="1" width="98" height="98" rx="2" />
        <rect x="33" y="62" width="34" height="37" />
        <path d="M33 62 a17 15 0 0 1 34 0" />
        <path d="M6 99 V80 a44 52 0 0 1 88 0 V99" />
        <circle cx="50" cy="93" r="2.4" />
        <path d="M44 97.4 h12" />
      </svg>
      {SLOTS.map(s => {
        const p = lineup[s];
        return (
          <div key={s} className={`spot${p ? ' on' : ''}${highlight.includes(s) ? ' open' : ''}`} style={{ left: `${SPOT[s][0]}%`, top: `${SPOT[s][1]}%` }}>
            {p ? (
              <M.div className="spot-in" initial={{ scale: 0.4, opacity: 0, y: -30 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
                <Face p={p} size={compact ? 40 : 54} ring="var(--orange)" />
                <span className="spot-name">{surname(p.n)}</span>
                <span className="spot-meta"><Ovr v={p.ovr} /> {eraOf?.(p)}</span>
              </M.div>
            ) : <span className="spot-empty">{s}</span>}
          </div>
        );
      })}
    </div>
  );
}
