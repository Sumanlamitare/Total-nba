import { useEffect, useMemo, useState } from 'react';
import { getGame } from './api.js';

const pct = (x, d = 0) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
const sgn = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d));
const odds = a => (a == null ? '—' : a > 0 ? '+' + a : String(a));
const cls = x => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const when = d => new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', timeZone: 'UTC' });

// how strong a qualifying pick is, by how far our chance beats the odds
export const tier = edge => (edge >= 0.08 ? 'Strong' : edge >= 0.05 ? 'Good' : 'Lean');

const STAT_ABBR = {
  minutes: 'MIN', points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TOV',
  completions: 'CMP', passingAttempts: 'ATT', passingYards: 'PASS YDS', passingTouchdowns: 'PASS TD', rushingAttempts: 'CAR', rushingYards: 'RUSH YDS',
  receptions: 'REC', receivingTargets: 'TGT', receivingYards: 'REC YDS', receivingTouchdowns: 'REC TD', rushingTouchdowns: 'RUSH TD',
};

// "Over" hits are games above the line; "Under" hits are games below it
const sideHits = (h, side) => (h?.n ? { k: side === 'Under' ? h.n - h.over : h.over, n: h.n } : null);
const won = (v, p) => (p.side === 'Under' ? v < p.line : v > p.line);

function propReason(p) {
  const h = sideHits(p.context.hit.l5, p.side), parts = [];
  if (p.market === 'Anytime TD') parts.push(`We expect about ${p.proj.mu} touchdowns.`);
  else parts.push(`We expect about ${p.proj.mu} — the line is ${p.line}.`);
  if (h) parts.push(`${p.side === 'Yes' ? 'Scored' : `Went ${p.side.toLowerCase()}`} in ${h.k} of his last ${h.n}.`);
  if (p.context.lastVsOpp) parts.push(`Had ${p.context.lastVsOpp.value} last time vs ${p.opp}.`);
  return parts.join(' ');
}

function gameReason(s, g) {
  const L = g.lines, fav = L.projMargin >= 0 ? g.home.abbr : g.away.abbr, by = Math.abs(L.projMargin);
  if (s.market === 'Total') return `We expect about ${L.projTotal} total points — the line is ${L.lines.total}.`;
  return `We have ${fav} winning by about ${by}.`;
}

export default function Game({ sport, id, go }) {
  const [g, setG] = useState(null), [err, setErr] = useState(null);
  useEffect(() => { getGame(sport, id).then(setG, e => setErr(e.message)); }, [sport, id]);
  if (err) return <div className="msg bad">Couldn't analyse this game: {err}</div>;
  if (!g) return <div className="msg">Analysing — pulling lines, team form and every player's games…</div>;

  const L = g.lines?.lines;
  const picks = [
    ...(g.lines?.sides || []).filter(s => s.qualifies).map(s => ({ ...s, title: s.market === 'Moneyline' ? `${s.pick} to win` : s.pick, sub: s.market, reason: gameReason(s, g) })),
    ...g.props.filter(p => p.pick).map(p => ({ ...p, title: p.player, sub: `${p.side === 'Yes' ? 'Anytime TD' : `${p.side} ${p.line} ${p.market}`}`, reason: propReason(p) })),
  ].sort((a, b) => b.edge - a.edge);

  return (
    <section className="game">
      <button className="back" onClick={() => go(`/${sport}`)}>‹ All games</button>
      <header className="ghead">
        <Team t={g.away} b2b={g.b2b.away} />
        <div className="at"><span>@</span><small>{g.status.state === 'pre' ? when(g.date) : g.status.detail}</small></div>
        <Team t={g.home} b2b={g.b2b.home} />
      </header>

      <h2>Our picks</h2>
      {!picks.length && <div className="msg small">No picks for this game. Most games don't have a good bet — that's normal, and passing is a win.</div>}
      <div className="picks">{picks.map((p, i) => <PickCard key={i} p={p} />)}</div>

      {g.lines?.sides?.length > 0 && <GameLines g={g} L={L} />}

      <h2>Recent form</h2>
      <div className="form">
        {[g.away, g.home].map(t => {
          const f = g.lastFive.find(x => x.teamId === t.id || x.abbr === t.abbr);
          return (
            <div key={t.id} className="fbox">
              <h3>{t.abbr} last 5 <span>{f?.record || '—'}</span></h3>
              {(f?.events || []).map((e, i) => (
                <div key={i} className="frow"><span className={'wl ' + e.result}>{e.result}</span><span>{e.home ? 'vs' : '@'} {e.opp}</span><span>{e.score}</span><small>{short(e.date)}</small></div>
              ))}
              {!f?.events?.length && <small className="muted">No games yet this season.</small>}
            </div>
          );
        })}
        <div className="fbox">
          <h3>Head to head <span>{g.h2h.team} {g.h2h.record}</span></h3>
          {g.h2h.meetings.map((m, i) => (
            <div key={i} className="frow"><span className={'wl ' + m.result}>{m.result}</span><span>{g.home.abbr} {m.home ? 'vs' : '@'} {g.away.abbr}</span><span>{m.score}</span><small>{short(m.date)}</small></div>
          ))}
          {!g.h2h.meetings.length && <small className="muted">No meetings in the last four seasons.</small>}
        </div>
      </div>

      {g.injuries.some(t => t.list.length) && <>
        <h2>Injuries</h2>
        <div className="form">
          {g.injuries.filter(t => t.list.length).map(t => (
            <div key={t.abbr} className="fbox">
              <h3>{t.abbr}</h3>
              {t.list.map((x, i) => <div key={i} className="frow inj"><span>{x.name}</span><small>{x.pos}</small><span className={/out/i.test(x.status) ? 'neg' : 'warn'}>{x.status}</span></div>)}
            </div>
          ))}
        </div>
      </>}

      <Props g={g} />
    </section>
  );
}

function Team({ t, b2b }) {
  return (
    <div className="gteam">
      {t.logo && <img src={t.logo} alt="" width="52" height="52" />}
      <b>{t.abbr}</b>
      <small>{t.record}</small>
      {b2b && <span className="tag warn">2nd night in a row</span>}
    </div>
  );
}

function PickCard({ p }) {
  return (
    <div className="pick">
      <div className="ptop">
        <div><div className="pl">{p.title}</div><div className="psub">{p.sub}</div></div>
        <span className={'tag tier ' + tier(p.edge).toLowerCase()}>{tier(p.edge)}</span>
      </div>
      <p className="why">{p.reason}</p>
      <div className="pn">
        <span>Our chance <b>{pct(p.p)}</b></span>
        <span>Bet <b>{pct(p.stake, 1)}</b> of bankroll</span>
      </div>
      {p.flags?.length > 0 && <div className="flags">{p.flags.map(f => <span key={f}>{f}</span>)}</div>}
      <TheMath p={p} />
    </div>
  );
}

// the numbers behind a pick, closed by default
function TheMath({ p }) {
  return (
    <details className="math">
      <summary>Show the math</summary>
      <dl>
        <dt>Odds</dt><dd>{odds(p.price)} (needs {pct(1 / (p.price > 0 ? 1 + p.price / 100 : 1 + 100 / -p.price))} to break even)</dd>
        <dt>Our stats model</dt><dd>{pct(p.pModel, 1)}</dd>
        <dt>Sportsbook (no vig)</dt><dd>{pct(p.pMarket, 1)}</dd>
        <dt>Combined chance</dt><dd>{pct(p.p, 1)}</dd>
        <dt>Edge</dt><dd className={cls(p.edge)}>{sgn(p.edge)} pts</dd>
        <dt>Expected return</dt><dd className={cls(p.ev)}>{sgn(p.ev)}¢ per $1</dd>
      </dl>
    </details>
  );
}

function GameLines({ g, L }) {
  const best = m => g.lines.sides.filter(s => s.market === m).sort((a, b) => b.edge - a.edge)[0];
  const fav = g.lines.projMargin >= 0 ? g.home.abbr : g.away.abbr;
  const mlHome = g.lines.sides.find(s => s.market === 'Moneyline' && s.pick === g.home.abbr);
  const rows = [
    ['Spread', best('Spread'), L.spread != null && `${g.home.abbr} ${L.spread > 0 ? '+' : ''}${L.spread}`, `${fav} by ${Math.abs(g.lines.projMargin)}`],
    ['Total', best('Total'), L.total != null && `${L.total} pts`, `${g.lines.projTotal} pts`],
    ['Winner', best('Moneyline'), mlHome && `${g.home.abbr} ${pct(mlHome.pMarket)}`, mlHome && `${g.home.abbr} ${pct(mlHome.pModel)}`],
  ].filter(r => r[1]);
  return (
    <>
      <h2>Game bets</h2>
      <div className="glines">
        <div className="gl head"><span /><span>Book</span><span>Us</span><span /></div>
        {rows.map(([name, s, book, us]) => (
          <div key={name} className="gl">
            <span>{name}</span><span>{book || '—'}</span><span>{us}</span>
            {s.qualifies ? <span className="tag pos">Bet {s.market === 'Moneyline' ? s.pick : s.pick}</span> : <span className="tag">Pass</span>}
          </div>
        ))}
      </div>
      <p className="src">Lines from {L.provider}. "Pass" means our number isn't far enough from the book's to bet.</p>
    </>
  );
}

function Props({ g }) {
  const markets = useMemo(() => [...new Set(g.props.map(p => p.market))], [g]);
  const [m, setM] = useState('All'), [open, setOpen] = useState(null), [onlyQ, setOnlyQ] = useState(false);
  const list = g.props.filter(p => (m === 'All' || p.market === m) && (!onlyQ || p.pick));
  if (!g.props.length) return (<><h2>Player props</h2><div className="msg small">No player props posted for this game yet{g.sport === 'nba' ? ' (NBA props start with the regular season, usually the day before each game)' : ''}.</div></>);
  return (
    <>
      <h2>Player props <small>{g.props.length}</small></h2>
      <div className="chips">
        <button className={onlyQ ? 'a' : ''} onClick={() => setOnlyQ(!onlyQ)}>Picks only</button>
        {['All', ...markets].map(x => <button key={x} className={m === x ? 'a' : ''} onClick={() => setM(x)}>{x}</button>)}
      </div>
      <div className="props">
        {list.map(p => {
          const h = sideHits(p.context.hit.l5, p.side);
          return (
            <div key={p.key} className={'prop' + (p.pick ? ' isPick' : '') + (open === p.key ? ' open' : '')}>
              <button className="prow" onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
                <span className="who"><b>{p.player}</b><small>{p.team} · {p.side === 'Yes' ? 'Anytime TD' : `${p.side} ${p.line} ${p.market}`}</small></span>
                <span className="nums"><span>We expect <b>{p.proj.mu}</b></span>{h && <small>{h.k}/{h.n} last {h.n}</small>}</span>
                {p.pick ? <span className={'tag tier ' + tier(p.edge).toLowerCase()}>{tier(p.edge)}</span> : <span className="tag">—</span>}
              </button>
              {open === p.key && <PropDetail p={p} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PropDetail({ p }) {
  const c = p.context, word = p.side === 'Under' ? 'under' : p.side === 'Yes' ? 'scored' : 'over';
  const hits = [['Last 5', c.hit.l5], ['Last 10', c.hit.l10], ['This season', c.hit.season], ['vs ' + p.opp, c.hit.vsOpp]];
  const cols = statCols(c.last5);
  return (
    <div className="pdetail">
      <p className="why">{propReason(p)}</p>
      {p.pick
        ? <p className="verdict pos">Pick: {p.side === 'Yes' ? 'Anytime TD' : `${p.side} ${p.line}`} · our chance {pct(p.p)} · bet {pct(p.stake, 1)} of bankroll</p>
        : <p className="verdict muted">Not a pick — {p.flags.length ? 'see the warning below' : 'our number isn\'t far enough from the line'}.</p>}

      <h4>How often he's {word === 'scored' ? 'scored' : `gone ${word} ${p.line}`}</h4>
      <div className="hits">
        {hits.map(([l, h]) => { const s = sideHits(h, p.side); return <div key={l} className="hit"><small>{l}</small><b>{s ? `${s.k} of ${s.n}` : '—'}</b></div>; })}
      </div>

      <h4>Last 5 games</h4>
      <div className="tablewrap">
        <table className="t small">
          <thead><tr><th>Date</th><th>Opp</th><th>{p.market}</th>{cols.map(k => <th key={k}>{STAT_ABBR[k] || k}</th>)}</tr></thead>
          <tbody>
            {c.last5.map((r, i) => (
              <tr key={i}>
                <td>{short(r.date)}</td><td>{r.home ? 'vs' : '@'} {r.opp}</td>
                <td className={won(r.value, p) ? 'pos' : 'neg'}><b>{r.value}</b></td>
                {cols.map(k => <td key={k}>{r.line[k] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Green = would have won this bet, red = would have lost.</p>

      <h4>Last game vs {p.opp}</h4>
      {c.lastVsOpp
        ? <p className="lvo"><b className={won(c.lastVsOpp.value, p) ? 'pos' : 'neg'}>{c.lastVsOpp.value}</b> on {short(c.lastVsOpp.date)} ({c.lastVsOpp.result} {c.lastVsOpp.score})</p>
        : <p className="muted">Hasn't played {p.opp} in the last two seasons.</p>}

      {p.flags.length > 0 && <div className="flags">{p.flags.map(f => <span key={f}>{f}</span>)}</div>}
      <TheMath p={p} />
    </div>
  );
}

function statCols(rows) {
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r.line)) seen.add(k);
  return Object.keys(STAT_ABBR).filter(k => seen.has(k)).slice(0, 6);
}
