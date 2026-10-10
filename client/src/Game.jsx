import { useEffect, useMemo, useState } from 'react';
import { getGame } from './api.js';

const pct = (x, d = 1) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
const sgn = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d));
const odds = a => (a == null ? '—' : a > 0 ? '+' + a : String(a));
const cls = x => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const when = d => new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

const STAT_ABBR = {
  minutes: 'MIN', points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TOV',
  completions: 'CMP', passingAttempts: 'ATT', passingYards: 'PYD', passingTouchdowns: 'PTD', rushingAttempts: 'CAR', rushingYards: 'RYD',
  receptions: 'REC', receivingTargets: 'TGT', receivingYards: 'RECYD', receivingTouchdowns: 'RECTD', rushingTouchdowns: 'RTD',
};

export default function Game({ sport, id, go }) {
  const [g, setG] = useState(null), [err, setErr] = useState(null);
  useEffect(() => { getGame(sport, id).then(setG, e => setErr(e.message)); }, [sport, id]);
  if (err) return <div className="msg bad">Couldn't analyse this game: {err}</div>;
  if (!g) return <div className="msg">Analysing — pulling lines, team form and every player's game log…</div>;

  const L = g.lines?.lines;
  const gamePicks = (g.lines?.sides || []).filter(s => s.qualifies).map(s => ({ ...s, label: `${s.market}: ${s.pick}`, kind: 'game' }));
  const propPicks = g.props.filter(p => p.pick).map(p => ({ ...p, label: `${p.player} ${p.side} ${p.line} ${p.market}`, kind: 'prop' }));
  const picks = [...gamePicks, ...propPicks].sort((a, b) => b.ev - a.ev);

  return (
    <section className="game">
      <button className="back" onClick={() => go(`/${sport}`)}>‹ Slate</button>
      <header className="ghead">
        <Team t={g.away} r={g.ratings.away} b2b={g.b2b.away} />
        <div className="at">
          <span>@</span>
          <small>{g.status.state === 'pre' ? when(g.date) : g.status.detail}</small>
        </div>
        <Team t={g.home} r={g.ratings.home} b2b={g.b2b.home} />
      </header>

      {L && (
        <div className="linebar">
          <div><small>Spread</small><b>{g.home.abbr} {L.spread > 0 ? '+' : ''}{L.spread}</b></div>
          <div><small>Total</small><b>{L.total ?? '—'}</b></div>
          <div><small>Moneyline</small><b>{g.away.abbr} {odds(L.mlAway)} · {g.home.abbr} {odds(L.mlHome)}</b></div>
          <div><small>Model</small><b>{g.home.abbr} {g.lines.projMargin > 0 ? 'by ' + g.lines.projMargin : g.away.abbr + ' by ' + -g.lines.projMargin} · {g.lines.projTotal}</b></div>
        </div>
      )}
      {L && <p className="src">Lines from {L.provider}. {g.predictor?.home ? `ESPN predictor: ${g.home.abbr} ${g.predictor.home.toFixed(0)}%.` : ''}</p>}

      <h2>Best bets</h2>
      {!picks.length && <div className="msg small">Nothing clears the bar for this game. That's the normal result — most games have no edge.</div>}
      <div className="picks">
        {picks.map((p, i) => (
          <div key={i} className="pick">
            <div className="pl">{p.label}</div>
            <div className="pn">
              <span>{odds(p.price)}</span>
              <span>Win {pct(p.p)}</span>
              <span className={cls(p.edge)}>Edge {sgn(p.edge)}</span>
              <span className={cls(p.ev)}>EV {sgn(p.ev)}%</span>
              <span className="stake">Stake {pct(p.stake, 1)}</span>
            </div>
            {p.flags?.length > 0 && <div className="flags">{p.flags.map(f => <span key={f}>{f}</span>)}</div>}
          </div>
        ))}
      </div>

      {g.lines?.sides?.length > 0 && <>
        <h2>Game lines</h2>
        <div className="tablewrap">
          <table className="t">
            <thead><tr><th>Bet</th><th>Price</th><th>Model</th><th>Market</th><th>Blend</th><th>Edge</th><th>EV</th></tr></thead>
            <tbody>
              {g.lines.sides.map((s, i) => (
                <tr key={i} className={s.qualifies ? 'q' : ''}>
                  <td>{s.market === 'Moneyline' ? s.pick + ' ML' : s.pick}</td><td>{odds(s.price)}</td><td>{pct(s.pModel)}</td><td>{pct(s.pMarket)}</td>
                  <td>{pct(s.p)}</td><td className={cls(s.edge)}>{sgn(s.edge)}</td><td className={cls(s.ev)}>{sgn(s.ev)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      <h2>Team form</h2>
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
          <h3>Last {g.h2h.meetings.length} meetings <span>{g.h2h.team} {g.h2h.record}</span></h3>
          {g.h2h.meetings.map((m, i) => (
            <div key={i} className="frow"><span className={'wl ' + m.result}>{m.result}</span><span>{g.home.abbr} {m.home ? 'vs' : '@'} {g.away.abbr}</span><span>{m.score}</span><small>{short(m.date)}{m.post ? ' · playoffs' : ''}</small></div>
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
              {t.list.map((x, i) => <div key={i} className="frow"><span>{x.name}</span><small>{x.pos}</small><span className={/out/i.test(x.status) ? 'neg' : 'warn'}>{x.status}</span></div>)}
            </div>
          ))}
        </div>
      </>}

      <Props g={g} />
    </section>
  );
}

function Team({ t, r, b2b }) {
  return (
    <div className="gteam">
      {t.logo && <img src={t.logo} alt="" width="52" height="52" />}
      <b>{t.abbr}</b>
      <small>{t.record}</small>
      <small className="muted" title="Points for / against per game, padded with last season">{r.pf}–{r.pa}</small>
      {b2b && <span className="tag warn">back-to-back</span>}
    </div>
  );
}

function Props({ g }) {
  const markets = useMemo(() => [...new Set(g.props.map(p => p.market))], [g]);
  const [m, setM] = useState('All'), [open, setOpen] = useState(null), [onlyQ, setOnlyQ] = useState(false);
  const list = g.props.filter(p => (m === 'All' || p.market === m) && (!onlyQ || p.qualifies));
  if (!g.props.length) return (<><h2>Player props</h2><div className="msg small">The sportsbook hasn't posted player props for this game yet{g.sport === 'nba' ? ' (NBA props appear in the regular season, usually the day before)' : ''}.</div></>);
  return (
    <>
      <h2>Player props <small>{g.props.length}</small></h2>
      <div className="chips">
        {['All', ...markets].map(x => <button key={x} className={m === x ? 'a' : ''} onClick={() => setM(x)}>{x}</button>)}
        <button className={onlyQ ? 'a' : ''} onClick={() => setOnlyQ(!onlyQ)}>Qualifying only</button>
      </div>
      <div className="props">
        {list.map(p => (
          <div key={p.key} className={'prop' + (p.pick ? ' isPick' : '') + (open === p.key ? ' open' : '')}>
            <button className="prow" onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
              <span className="who"><b>{p.player}</b><small>{p.team} {p.pos}</small></span>
              <span className="what">{p.market}<small>{p.side} {p.line}</small></span>
              <span className="nums">
                <span>proj <b>{p.proj.mu}</b></span>
                <span className={cls(p.ev)}>EV {sgn(p.ev)}%</span>
              </span>
              {p.pick ? <span className="tag pos">PICK</span> : p.flags.length ? <span className="tag warn">!</span> : <span className="tag ghost" />}
            </button>
            {open === p.key && <PropDetail p={p} sport={g.sport} />}
          </div>
        ))}
      </div>
    </>
  );
}

// hit rates are shown for the side being bet (Under -> games that stayed under the line)
function Hit({ label, h, side }) {
  if (!h?.n) return <div className="hit"><small>{label}</small><b>—</b></div>;
  const under = side === 'Under', k = under ? h.n - h.over : h.over;
  const [lo, hi] = under ? [1 - h.hi, 1 - h.lo] : [h.lo, h.hi];
  return (
    <div className="hit" title={`95% range ${pct(lo, 0)}–${pct(hi, 0)}`}>
      <small>{label}</small><b>{k}/{h.n}</b><span>{pct(k / h.n, 0)} {under ? 'under' : 'over'}</span>
    </div>
  );
}

function PropDetail({ p, sport }) {
  const c = p.context;
  return (
    <div className="pdetail">
      <div className="pgrid">
        <div><small>Projection</small><b>{p.proj.mu}{p.proj.sd ? ` ± ${p.proj.sd}` : ''}</b>{p.proj.minutes && <span>{p.proj.minutes} min</span>}</div>
        <div><small>Over {p.line}</small><b>{pct(p.proj.pOver)}</b>{p.proj.push > 0 && <span>push {pct(p.proj.push)}</span>}</div>
        <div><small>Model / market</small><b>{pct(p.pModel)} / {pct(p.pMarket)}</b><span>{p.side} at {odds(p.price)}</span></div>
        <div><small>Blended</small><b>{pct(p.p)}</b><span className={cls(p.edge)}>edge {sgn(p.edge)}</span></div>
        <div><small>Stake</small><b>{p.qualifies ? pct(p.stake) : '—'}</b><span>{p.qualifies ? 'quarter Kelly' : 'does not qualify'}</span></div>
        {p.moved !== 0 && <div><small>Line move</small><b>{p.open} → {p.line}</b><span className={p.moved > 0 ? 'pos' : 'neg'}>{p.moved > 0 ? '+' : ''}{p.moved}</span></div>}
      </div>

      <h4>{p.side === 'Under' ? 'Under' : 'Over'} {p.line} hit rate</h4>
      <div className="hits">
        {[['Last 5', c.hit.l5], ['Last 10', c.hit.l10], ['Season', c.hit.season], ['vs ' + p.opp, c.hit.vsOpp]].map(([l, h]) => <Hit key={l} label={l} h={h} side={p.side} />)}
      </div>

      <h4>Last 5 games</h4>
      <div className="tablewrap">
        <table className="t small">
          <thead><tr><th>Date</th><th>Opp</th><th>{p.market}</th>{statCols(c.last5).map(k => <th key={k}>{STAT_ABBR[k] || k}</th>)}</tr></thead>
          <tbody>
            {c.last5.map((r, i) => (
              <tr key={i}>
                <td>{short(r.date)}</td><td>{r.home ? 'vs' : '@'} {r.opp} <small className={r.result === 'W' ? 'pos' : 'neg'}>{r.result}</small></td>
                <td className={r.value > p.line ? 'pos' : r.value < p.line ? 'neg' : ''}><b>{r.value}</b></td>
                {statCols(c.last5).map(k => <td key={k}>{r.line[k] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Last game vs {p.opp}</h4>
      {c.lastVsOpp
        ? <p className="lvo"><b className={c.lastVsOpp.value > p.line ? 'pos' : 'neg'}>{c.lastVsOpp.value}</b> {p.market} on {short(c.lastVsOpp.date)} ({c.lastVsOpp.result} {c.lastVsOpp.score})</p>
        : <p className="muted">No game against {p.opp} in the last two seasons.</p>}

      {p.flags.length > 0 && <div className="flags">{p.flags.map(f => <span key={f}>{f}</span>)}</div>}
      {sport === 'nfl' && <p className="muted small">Weather and depth-chart news aren't in the model yet — check them before betting.</p>}
    </div>
  );
}

function statCols(rows) {
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r.line)) seen.add(k);
  return Object.keys(STAT_ABBR).filter(k => seen.has(k)).slice(0, 7);
}
