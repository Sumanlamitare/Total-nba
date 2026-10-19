// After the draft: the tale of the tape (matchups and ratings), the best-of-seven, and the final result.
import React, { useEffect, useRef, useState } from 'react';
import { motion as M, AnimatePresence } from 'motion/react';
import { seriesOdds, gameProb, topScorer, shareText, surname } from './game.js';
import { CountUp, Court, Face, Ovr, Rep } from './bits.jsx';
import { sfx } from './sound.js';

const pct = p => `${Math.round(p * 100)}%`;
const signed = v => (v > 0 ? `+${v}` : `${v}`);

function Breakdown({ side, name, color }) {
  return (
    <div className="breakdown" style={{ '--side': color }}>
      <p className="bd-name">{name}</p>
      <p className="bd-rating"><CountUp to={side.rating} decimals={1} dur={1200} /></p>
      <ul>
        <li><span>Starting five average</span><b>{side.base.toFixed(1)}</b></li>
        {side.fit.map(f => <li key={f.label} className={f.value > 0 ? 'up' : 'down'}><span>{f.label}</span><b>{signed(f.value)}</b></li>)}
        {side.won > 0 && <li className="up"><span>{side.won} matchup{side.won > 1 ? 's' : ''} won</span><b>+{side.boost}</b></li>}
      </ul>
    </div>
  );
}

export function Tape({ mine, theirs, rated, names, colors, eraOf, onTip }) {
  const gap = rated.mine.rating - rated.theirs.rating;
  const odds = seriesOdds(gap);
  return (
    <section className="tape">
      <header className="screen-head">
        <div>
          <p className="eyebrow">Tale of the tape</p>
          <h2>{names.mine} <span className="vs">vs</span> <span style={{ color: colors.theirs }}>{names.theirsFull}</span></h2>
        </div>
      </header>
      <div className="tape-ratings">
        <Breakdown side={rated.mine} name={names.mine} color="var(--orange)" />
        <div className="tape-odds">
          <p>Series odds</p>
          <b><CountUp to={odds * 100} dur={1400} />%</b>
          <small>{gap >= 0 ? `${names.mine} by ${gap.toFixed(1)}` : `${names.theirs} by ${(-gap).toFixed(1)}`}</small>
          <small>Game 1 (at {names.theirs}): {pct(gameProb(gap, 0))}</small>
        </div>
        <Breakdown side={rated.theirs} name={names.theirsFull} color={colors.theirs} />
      </div>

      <ol className="matchups">
        {rated.matchups.map((m, k) => {
          const a = m.mine, b = m.theirs, total = a.ovr + b.ovr;
          return (
            <M.li key={m.slot} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.12 }}
              className={m.winner === 'mine' ? 'won' : m.winner === 'theirs' ? 'lost' : 'even'}>
              <div className="mu-side mine"><Face p={a} size={44} ring="var(--orange)" /><span className="mu-name"><b>{a.n}</b><small>{eraOf(a)}</small><Rep p={a} max={2} /></span><Ovr v={a.ovr} /></div>
              <div className="mu-mid">
                <span className="mu-slot">{m.slot}</span>
                <span className="mu-bar"><M.i style={{ background: 'var(--orange)' }} initial={{ width: '50%' }} animate={{ width: `${(a.ovr / total) * 100}%` }} transition={{ delay: 0.4 + k * 0.12, duration: 0.6 }} /><i style={{ background: colors.theirs, flex: 1 }} /></span>
                <span className="mu-res">{m.winner === 'mine' ? 'You +0.5' : m.winner === 'theirs' ? `${names.theirs} +0.5` : 'Even'}</span>
              </div>
              <div className="mu-side theirs"><Ovr v={b.ovr} /><span className="mu-name"><b>{b.n}</b><small>{eraOf(b)}</small><Rep p={b} max={2} /></span><Face p={b} size={44} ring={colors.theirs} /></div>
            </M.li>
          );
        })}
      </ol>
      <div className="tape-foot">
        <p className="fine">The rating gap sets each game's odds. The {names.theirs} have home court in Games 1, 2, 5 and 7; Game 7 is a coin with a thumb on it.</p>
        <button type="button" className="btn primary big" onClick={onTip}>Tip off</button>
      </div>
    </section>
  );
}

function BoxScore({ g, names, colors }) {
  const team = (key, label, color) => (
    <table className="box">
      <caption style={{ '--side': color }}>{label} <b>{g[key].total}</b></caption>
      <thead><tr><th scope="col">Player</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th></tr></thead>
      <tbody>
        {g[key].rows.map(r => <tr key={r.i} className={r === topScorer(g[key]) ? 'top' : ''}><th scope="row"><i>{r.slot}</i>{r.n}</th><td>{r.pts}</td><td>{r.reb}</td><td>{r.ast}</td></tr>)}
        <tr className="bench"><th scope="row"><i>—</i>Bench</th><td>{g[key].bench}</td><td /><td /></tr>
      </tbody>
    </table>
  );
  return <div className="boxes">{team('mine', names.mine, 'var(--orange)')}{team('theirs', names.theirsFull, colors.theirs)}</div>;
}

export function Series({ series, names, colors, onEnd }) {
  const [shown, setShown] = useState(0); // games revealed
  const [live, setLive] = useState(true); // the newest game is still counting up
  const [open, setOpen] = useState(null);
  const g = series.games[Math.max(0, shown - 1)];
  const over = shown >= series.games.length;

  const count = useRef(0);
  const timer = useRef(null);
  // Game 1 tips off on its own.
  useEffect(() => { timer.current = setTimeout(() => reveal(), 500); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function reveal() {
    if (count.current >= series.games.length) return;
    const k = Math.min(series.games.length, count.current + 1);
    count.current = k;
    setShown(k); setLive(true); setOpen(k - 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLive(false);
      const last = k === series.games.length;
      sfx(last ? 'buzzer' : 'swish');
      if (last) timer.current = setTimeout(() => sfx(series.won ? 'cheer' : 'groan'), 700);
    }, 1700);
  }
  const simRest = () => { clearTimeout(timer.current); count.current = series.games.length; setShown(series.games.length); setLive(false); setOpen(series.games.length - 1); sfx('buzzer'); setTimeout(() => sfx(series.won ? 'cheer' : 'groan'), 600); };

  if (!g) return <section className="series"><p className="eyebrow">Tip-off…</p></section>;
  const w = series.games.slice(0, shown).filter(x => x.won).length, l = shown - w;
  const lead = !live ? (w > l ? `${names.mine} lead ${w}-${l}` : l > w ? `The ${names.theirs} lead ${l}-${w}` : `Series tied ${w}-${l}`) : '';
  const finalLine = over && !live ? (series.won ? `${names.mine} win the series ${series.w}-${series.l}` : `The ${names.theirs} win the series ${series.l}-${series.w}`) : lead;

  return (
    <section className="series">
      <div className="board" role="status" aria-live="polite">
        <p className="board-game">{g.n === 7 ? 'Game 7' : `Game ${g.n}`} · at {g.home === 'mine' ? names.mine : names.theirsFull}{g.ot && !live ? ' · OT' : ''}</p>
        <div className="board-row">
          <div className="board-team"><span>{names.mine}</span><b className={!live && g.won ? 'win' : ''}><CountUp key={`m${g.n}`} to={g.mine.total} dur={1600} /></b></div>
          <span className="board-clock">{live ? <i className="clock-dot" /> : 'FINAL'}</span>
          <div className="board-team"><span style={{ color: colors.theirs }}>{names.theirs}</span><b className={!live && !g.won ? 'win' : ''}><CountUp key={`t${g.n}`} to={g.theirs.total} dur={1600} /></b></div>
        </div>
        <div className="pips" aria-label={`Series: ${w} wins, ${l} losses`}>
          {Array.from({ length: 7 }, (_, k) => {
            const x = series.games[k]; const done = k < shown - (live ? 1 : 0);
            return <span key={k} className={`pip${done ? (x.won ? ' w' : ' l') : ''}${k === shown - 1 && live ? ' now' : ''}`}>{k + 1}</span>;
          })}
        </div>
        <AnimatePresence mode="wait">
          {!live && <M.p key={g.n} className="headline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{g.headline}</M.p>}
        </AnimatePresence>
        <p className="board-lead">{finalLine || ' '}</p>
      </div>

      <div className="series-actions">
        {!over && <button type="button" className="btn primary" onClick={reveal} disabled={live}>Play game {shown + 1}</button>}
        {!over && <button type="button" className="btn ghost" onClick={simRest}>Sim to the end</button>}
        {over && !live && <button type="button" className="btn primary big" onClick={onEnd}>{series.won ? 'Raise the banner' : 'Final result'}</button>}
      </div>

      <ol className="games">
        {series.games.slice(0, shown).map((x, k) => {
          const pending = k === shown - 1 && live;
          return (
            <li key={x.n} className={pending ? 'pending' : x.won ? 'w' : 'l'}>
              <button type="button" className="game-row" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)} disabled={pending}>
                <span className="g-n">G{x.n}</span>
                <span className="g-score">{pending ? '…' : `${x.won ? 'W' : 'L'} ${x.mine.total}-${x.theirs.total}${x.ot ? ' OT' : ''}`}</span>
                <span className="g-head">{pending ? 'In progress' : x.headline}</span>
                <span className="g-top">{pending ? '' : (() => { const a = topScorer(x.mine), b = topScorer(x.theirs); const t = a.pts >= b.pts ? a : b; return `${surname(t.n)} ${t.pts}`; })()}</span>
              </button>
              {open === k && !pending && <BoxScore g={x} names={names} colors={colors} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Result({ lineup, dynasty, series, rating, names, colors, eraOf, daily, next, onAgain, onNext, onHome }) {
  const [copied, setCopied] = useState('');
  const text = shareText({ lineup, eraOf, dynasty, series, rating: rating.mine.rating.toFixed(1), daily });
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Beat the Dynasty', text: `${text}\n${location.origin}` }); return; }
      await navigator.clipboard.writeText(`${text}\n${location.origin}`); setCopied('Copied — paste it anywhere');
    } catch (e) { if (e?.name !== 'AbortError') setCopied('Could not copy — select the text below'); }
  };
  const best = series.games.flatMap(g => g.mine.rows).reduce((m, r) => { m[r.n] = (m[r.n] || 0) + r.pts; return m; }, {});
  const [mvp, mvpPts] = Object.entries(best).sort((a, b) => b[1] - a[1])[0] || [];
  return (
    <section className={`result ${series.won ? 'won' : 'lost'}`}>
      <M.div className="share-card" initial={{ opacity: 0, y: 30, rotateX: 18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}>
        <p className="eyebrow">{daily ? `Daily challenge · ${daily}` : 'Beat the Dynasty'}</p>
        <h2 className="verdict">{series.won ? 'Dynasty down' : 'Eliminated'}</h2>
        <p className="verdict-sub">{series.won ? `${names.mine} beat the ${dynasty.label}` : `The ${dynasty.label} win`} <b>{series.won ? `${series.w}-${series.l}` : `${series.l}-${series.w}`}</b></p>
        <p className="dots" aria-hidden>{series.games.map(g => <i key={g.n} className={g.won ? 'w' : 'l'} />)}</p>
        <Court lineup={lineup} label="Your five" eraOf={eraOf} compact />
        <dl className="result-stats">
          <div><dt>Team</dt><dd>{rating.mine.rating.toFixed(1)}</dd></div>
          <div><dt>{dynasty.label}</dt><dd style={{ color: colors.theirs }}>{rating.theirs.rating.toFixed(1)}</dd></div>
          {mvp && <div><dt>Series MVP</dt><dd>{surname(mvp)} <small>{(mvpPts / series.games.length).toFixed(1)} ppg</small></dd></div>}
        </dl>
      </M.div>
      <div className="result-actions">
        <button type="button" className="btn primary big" onClick={share}>Share result</button>
        {series.won && next && <button type="button" className="btn big" onClick={onNext}>Next: {next.label}</button>}
        <button type="button" className="btn" onClick={onAgain}>{series.won ? 'Play again' : 'Try again'}</button>
        <button type="button" className="btn ghost" onClick={onHome}>Home</button>
      </div>
      {copied && <p className="fine" role="status">{copied}</p>}
      <pre className="share-text" aria-label="Result to share">{text}</pre>
    </section>
  );
}

