// The draft: five spins of a franchise and a decade, one pick from each into an open position. No take-backs.
import React, { useEffect, useRef, useState } from 'react';
import { motion as M, AnimatePresence, useReducedMotion } from 'motion/react';
import { SLOT_NAMES, decadeLabel, deal, fits, openSlots, rng, spin } from './game.js';
import { Court, Face, Ovr, Rep, line } from './bits.jsx';
import { teamCloth, teamGlow, inkOn } from './colors.js';
import { sfx } from './sound.js';

// One reel of the spin machine. Steps through random faces, slowing down, and lands on `target`.
function Reel({ items, target, spinning, delay, render, onLand }) {
  const reduce = useReducedMotion();
  const [face, setFace] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!spinning || !target) return;
    if (reduce) { setFace(target); setN(k => k + 1); onLand?.(); return; }
    let alive = true, wait = 45, total = 0;
    const r = Math.random;
    const step = () => {
      if (!alive) return;
      total += wait;
      if (total > 900 + delay) { setFace(target); setN(k => k + 1); sfx('lock'); onLand?.(); return; }
      setFace(items[Math.floor(r() * items.length)]); setN(k => k + 1); sfx('tick');
      wait = Math.min(240, wait * 1.09);
      setTimeout(step, wait);
    };
    step();
    return () => { alive = false; };
  }, [spinning, target]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="reel">
      <AnimatePresence initial={false} mode="popLayout">
        <M.div key={n} className="reel-face" initial={{ y: '-70%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '70%', opacity: 0 }} transition={{ duration: 0.09 }}>
          {face ? render(face) : <span className="reel-q">?</span>}
        </M.div>
      </AnimatePresence>
    </div>
  );
}

export default function Draft({ data, dynasty, seed, eraOf, onDone, onQuit }) {
  const random = useRef(null);
  if (!random.current) random.current = rng(`${seed}:draft`);
  const [lineup, setLineup] = useState({});
  const [round, setRound] = useState(0); // spins used
  const [era, setEra] = useState(null); // the spun franchise-decade
  const [hand, setHand] = useState([]); // the players it dealt
  const [phase, setPhase] = useState('ready'); // ready | spinning | picking | done
  const [landed, setLanded] = useState(0);
  const [choosing, setChoosing] = useState(null); // a player who fits two open spots
  const seen = useRef(new Set());
  const open = openSlots(lineup);

  const go = () => {
    if (phase === 'spinning' || phase === 'picking' || !open.length) return;
    // Spins never repeat a franchise-decade within one draft, and always offer someone who fits an open spot.
    const pool = data.eras.filter(e => !seen.current.has(e.key));
    const e = spin(pool.length ? pool : data.eras, lineup, random.current);
    if (!e) return;
    seen.current.add(e.key);
    setHand(deal(e, lineup, random.current));
    setEra(e); setLanded(0); setPhase('spinning'); setRound(r => r + 1);
  };
  useEffect(() => { if (phase === 'spinning' && landed >= 2) { const t = setTimeout(() => setPhase('picking'), 250); return () => clearTimeout(t); } }, [phase, landed]);

  const sign = (p, slot) => {
    const next = { ...lineup, [slot]: p };
    sfx('pick'); setChoosing(null); setLineup(next);
    if (!openSlots(next).length) { setPhase('done'); setTimeout(() => onDone(next), 1100); }
    else setPhase('ready');
  };
  const choose = p => {
    const f = fits(p, lineup);
    if (!f.length) return;
    if (f.length === 1) sign(p, f[0]); else setChoosing(p);
  };

  const team = era ? data.teamById.get(era.team) : null;
  const teamsForReel = data.teams;
  const decades = data.decades;
  const opp = dynasty;

  return (
    <section className="draft">
      <header className="screen-head">
        <div>
          <p className="eyebrow">The draft · spin {Math.min(round || 1, 5)} of 5</p>
          <h2>Build a five to beat the <span style={{ color: opp.glow }}>{opp.label}</span></h2>
        </div>
        <button type="button" className="btn small ghost" onClick={onQuit}>Leave</button>
      </header>

      <div className="draft-grid">
        <div className="draft-court">
          <Court lineup={lineup} label="Your lineup" eraOf={eraOf} highlight={phase === 'picking' ? open : []} />
          <p className="court-note">{open.length ? <>Open: {open.map(s => <b key={s}>{s}</b>)}</> : 'Lineup set. Heading to the tale of the tape…'}</p>
        </div>

        <div className="draft-side">
          <div className={`machine${phase === 'spinning' ? ' live' : ''}`} style={team && phase !== 'spinning' ? { '--glow': teamGlow(team) } : undefined}>
            <div className="reels">
              <Reel items={teamsForReel} target={team} spinning={phase === 'spinning'} delay={0} onLand={() => setLanded(k => k + 1)}
                render={t => <span className="reel-team" style={{ background: teamCloth(t), color: inkOn(teamCloth(t)) }}><b>{t.abbr}</b><small>{t.short}</small></span>} />
              <Reel items={decades} target={era?.decade} spinning={phase === 'spinning'} delay={450} onLand={() => setLanded(k => k + 1)}
                render={d => <span className="reel-dec"><b>{decadeLabel(d)}</b><small>{d}–{String(d + 9).slice(2)}</small></span>} />
            </div>
            <button type="button" className="btn primary spin" onClick={go} disabled={phase !== 'ready'}>
              {phase === 'spinning' ? 'Spinning…' : phase === 'picking' ? 'Pick a player' : phase === 'done' ? 'Lineup set' : round ? 'Spin again' : 'Spin'}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'picking' && era && (
              <M.div key={era.key} className="pool" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                <p className="pool-head" style={{ '--team': teamCloth(team) }}>
                  <span><b>{team?.name}</b> · the {decadeLabel(era.decade)}</span>
                  <small>{hand.length === 1 ? 'One player fits' : `Pick one of ${hand.length}`}</small>
                </p>
                <ul className="cards">
                  {hand.map((p, k) => {
                    const can = fits(p, lineup).length > 0;
                    return (
                      <M.li key={p.i} initial={{ opacity: 0, rotateY: -90, y: 10 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} transition={{ delay: 0.08 + k * 0.12, type: 'spring', stiffness: 260, damping: 22 }}>
                        <button type="button" className={`card${can ? '' : ' off'}`} disabled={!can} onClick={() => choose(p)}
                          aria-label={`${p.n}, overall ${p.ovr}, plays ${p.slots.join(' or ')}${can ? '' : ', no open spot'}`}>
                          <Face p={p} size={44} />
                          <span className="card-main">
                            <b>{p.n}</b>
                            <small>{line(p)}</small>
                            <Rep p={p} />
                            <small className="card-years">{p.from === p.to ? `${p.from - 1}-${String(p.from).slice(2)}` : `${p.from - 1}–${String(p.to).slice(2)}`} · {p.gp} games</small>
                          </span>
                          <span className="card-pos">{p.slots.map(s => <i key={s} className={lineup[s] ? 'filled' : ''}>{s}</i>)}</span>
                          <Ovr v={p.ovr} />
                        </button>
                      </M.li>
                    );
                  })}
                </ul>
              </M.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {choosing && (
          <M.div className="modal" role="dialog" aria-modal="true" aria-label={`Where does ${choosing.n} play?`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChoosing(null)}>
            <M.div className="modal-card" initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <Face p={choosing} size={72} ring="var(--orange)" />
              <h3>{choosing.n} <Ovr v={choosing.ovr} /></h3>
              <p>Where does he start?</p>
              <div className="modal-actions">
                {fits(choosing, lineup).map(s => <button key={s} type="button" className="btn primary" onClick={() => sign(choosing, s)}>{SLOT_NAMES[s]}</button>)}
              </div>
              <button type="button" className="btn small ghost" onClick={() => setChoosing(null)}>Back to the list</button>
            </M.div>
          </M.div>
        )}
      </AnimatePresence>
    </section>
  );
}
