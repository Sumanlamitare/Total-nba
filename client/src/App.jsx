// Performance of the Night: the five best individual games of any NBA night, and who collects them over a season.
import React, { useCallback, useEffect, useState } from 'react';
import { motion as M, AnimatePresence } from 'motion/react';
import { loadNight, loadSeasons, loadLeaderboard, longDay, shortDay, isoDay, fromDate } from './api.js';

const TOP = 5;

// ---- Routing: /, /night/YYYYMMDD, /leaderboard, /leaderboard/YYYY ---------------------------------------------------
function parseRoute(path = location.pathname) {
  let m;
  if ((m = path.match(/^\/night\/(\d{8})\/?$/))) return { page: 'night', date: m[1] };
  if ((m = path.match(/^\/leaderboard(?:\/(\d{4}))?\/?$/))) return { page: 'leaderboard', season: m[1] ? +m[1] : null };
  return { page: 'night', date: 'latest' };
}
function useRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => { const on = () => setRoute(parseRoute()); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  const go = useCallback((path, { replace = false } = {}) => {
    if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(parseRoute(path)); scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
const Link = ({ to, go, children, ...rest }) => <a href={to} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>;

// ---- Small pieces --------------------------------------------------------------------------------------------------
const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
function Face({ p, size = 64 }) {
  const [failed, setFailed] = useState(false);
  const src = p.headshot || `https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`;
  return (
    <span className="face" style={{ width: size, height: size }}>
      {!failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <b style={{ fontSize: size * 0.34 }}>{initials(p.name)}</b>}
    </span>
  );
}
const Logo = ({ team, size = 22 }) => (team?.logo ? <img className="logo" src={team.logo} alt="" width={size} height={size} loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /> : null);

// "38 PTS · 5 REB · 4 AST · 14-22 FG"
export function statline(l) {
  const parts = [`${l.pts} PTS`, `${l.reb} REB`, `${l.ast} AST`];
  if (l.stl >= 2) parts.push(`${l.stl} STL`);
  if (l.blk >= 2) parts.push(`${l.blk} BLK`);
  parts.push(`${l.fgm}-${l.fga} FG`);
  if (l.tpa) parts.push(`${l.tpm}-${l.tpa} 3PT`);
  return parts.join(' · ');
}
const STAGE_LABEL = { playin: 'Play-in', playoffs: 'Playoffs', conf: 'Conference finals', finals: 'NBA Finals' };
const CATS = [['result', 'Team result'], ['offense', 'Offense'], ['defense', 'Defense'], ['possession', 'Possession'], ['clutch', 'Crunch time']];
const sign = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const pct = v => (v == null ? '–' : `${Math.round(100 * v)}%`);

// One category: a hand-drawn bar from 0 to 100 (the tick is 50, a typical rotation player's game) and what went into it.
function Category({ name, c }) {
  if (!c) return <li className="cat none"><span className="ck">{name}</span><span className="cs">no data</span></li>;
  return (
    <li className="cat">
      <span className="ck">{name}<small> × {Math.round(100 * c.weight)}%</small></span>
      <span className="bar" aria-hidden><i style={{ width: `${c.score}%` }} /><em /></span>
      <b className="cs">{Math.round(c.score)}</b>
      <ul className="items">
        {c.items.map((x, k) => <li key={k} className={x.value < 0 ? 'neg' : ''}><span>{x.label}</span><span className="lead" aria-hidden /><b>{sign(x.value)}</b></li>)}
      </ul>
    </li>
  );
}

// The score explained: the five categories, the deductions and the arithmetic, the full line and how sure we are.
function Breakdown({ p }) {
  if (!p.categories) return null;
  const ded = [...(p.padding?.items || []).map(d => ({ ...d, kind: 'Stat padding' })), ...(p.fouls?.items || []).map(d => ({ ...d, kind: 'Fouls' }))];
  const l = p.line;
  return (
    <div className="breakdown">
      <ul className="cats">{CATS.map(([k, name]) => <Category key={k} name={name} c={p.categories[k]} />)}</ul>
      {ded.length > 0 && (
        <ul className="deductions">
          {ded.map((d, k) => <li key={k}><span className="dk">{d.kind}</span><span>{d.label}</span><b>{sign(d.value)}</b></li>)}
        </ul>
      )}
      <p className="math">
        <span>Categories {p.base.toFixed(1)}</span>
        {p.padding?.value ? <span> − padding {Math.abs(p.padding.value).toFixed(1)}</span> : null}
        {p.fouls?.value ? <span> − fouls {Math.abs(p.fouls.value).toFixed(1)}</span> : null}
        <b> = {p.score.toFixed(1)}</b><small> / 100</small>
      </p>
      <p className="fine">
        {l.min} min · {l.pts} pts · {l.reb} reb ({l.oreb} off) · {l.ast} ast · {l.stl} stl · {l.blk} blk · {l.to} to{l.pointsOff != null ? ` (${l.pointsOff} pts off them)` : ''} · {l.fgm}-{l.fga} FG · {l.tpm}-{l.tpa} 3PT · {l.ftm}-{l.fta} FT · {l.pf} PF{l.tech ? ` · ${l.tech} tech` : ''}{l.flagrant ? ` · ${l.flagrant} flagrant` : ''} · {l.pm > 0 ? '+' : ''}{l.pm} +/- · TS {pct(l.ts)} · eFG {pct(l.efg)} · usage {pct(l.usage)}{l.astTo != null ? ` · ${l.astTo} ast/to` : ''}
      </p>
      {p.confidence && <p className={`fine conf ${p.confidence.level}`}>Data confidence: {p.confidence.level}{p.confidence.missing.length ? ` — missing ${p.confidence.missing.join('; ')}` : ''}</p>}
    </div>
  );
}

// Why No. 1 won, and how close the next two came.
function Verdict({ potn, players }) {
  if (!potn) return null;
  return (
    <div className="verdict">
      <h3>Why {potn.name.split(' ').slice(-1)[0]} won{players ? <small> · No. 1 of {players} players who appeared</small> : null}</h3>
      <ul>{potn.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
      {potn.competitors.length > 0 && <>
        <h3>Closest competitors</h3>
        <ul>{potn.competitors.map(c => <li key={c.id}><b>{c.name}</b> {c.score.toFixed(1)}, {c.gap.toFixed(1)} behind. {c.text}.</li>)}</ul>
      </>}
    </div>
  );
}

// Chalk and marker marks, drawn by hand (SVG paths through the shared "rough" filter).
const Rough = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="4" result="w" />
      <feDisplacementMap in="SourceGraphic" in2="w" scale="3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);
const Ring = () => <svg className="ring" viewBox="0 0 60 60" aria-hidden><path d="M44 9 C 30 1, 8 8, 6 28 C 4 48, 26 58, 42 50 C 56 43, 58 22, 46 12 C 40 7, 30 6, 24 9" /></svg>;
const Arrow = ({ dir }) => <svg className="arrow" viewBox="0 0 40 24" aria-hidden><path d={dir === 'left' ? 'M36 13 C 26 11, 16 12, 5 12 M13 4 L 4 12 L 14 20' : 'M4 11 C 14 13, 24 12, 35 12 M27 4 L 36 12 L 26 20'} /></svg>;
// Tally marks, in fives.
export function Tally({ n }) {
  const groups = Math.floor(n / 5), rest = n % 5;
  const marks = [];
  for (let g = 0; g < groups + (rest ? 1 : 0); g++) {
    const k = g < groups ? 4 : rest;
    marks.push(
      <svg key={g} className="tally" viewBox="0 0 30 24" aria-hidden>
        {Array.from({ length: k }, (_, i) => <path key={i} d={`M${5 + i * 6} ${3 + (i % 2)} L ${4 + i * 6} ${21 - (i % 2)}`} />)}
        {g < groups && <path className="slash" d="M1 18 L 29 6" />}
      </svg>,
    );
  }
  return <span className="tallies" aria-hidden>{marks}</span>;
}

function PerfCard({ p, rank, hero, onOpen, open, potn, players }) {
  const color = p.team?.color || '#c0392b';
  return (
    <M.li className={`perf${hero ? ' hero' : ''}${open ? ' open' : ''}`} style={{ '--team': color }}
      initial={{ opacity: 0, y: -18, rotate: 0 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * rank, type: 'spring', stiffness: 260, damping: 22 }}>
      <i className="tape" aria-hidden />
      <button type="button" className="perf-main" onClick={onOpen} aria-expanded={open} aria-label={`Number ${rank}: ${p.name}, score ${p.score}. Show why`}>
        <span className="rank"><Ring /><b>{rank}</b></span>
        <Face p={p} size={hero ? 112 : 68} />
        <span className="who">
          <b className="name">{p.name}</b>
          <span className="team"><Logo team={p.team} size={16} /> {p.team?.abbr} {p.home ? 'vs' : '@'} <Logo team={p.opp} size={16} /> {p.opp?.abbr} · <em className={p.result.startsWith('W') ? 'w' : 'l'}>{p.result}</em>{STAGE_LABEL[p.stage] ? <> · <span className="stage">{STAGE_LABEL[p.stage]}</span></> : null}</span>
          <span className="line">{statline(p.line)}</span>
          {p.tags.length > 0 && <span className="tags">{p.tags.map(t => <i key={t} className={t === 'Padded' ? 'pad' : ''}>{t}</i>)}</span>}
        </span>
        <span className="score"><b>{p.score.toFixed(1)}</b><small>{open ? 'hide the math' : 'how?'}</small></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <M.div className="why" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            {hero && <Verdict potn={potn} players={players} />}
            <Breakdown p={p} />
          </M.div>
        )}
      </AnimatePresence>
    </M.li>
  );
}

function SeasonSelect({ seasons, value, onChange, id = 'season' }) {
  return (
    <label className="select">
      <span className="sr-only">Season</span>
      <select id={id} value={value || ''} onChange={e => onChange(+e.target.value)}>
        {seasons.map(s => <option key={s.year} value={s.year}>{s.label} season</option>)}
      </select>
    </label>
  );
}

// How the score works, in brief.
function Method({ unavailable = [], players }) {
  return (
    <details className="method">
      <summary>How the score works</summary>
      <p>Every player who appeared tonight{players ? ` (${players})` : ''} is scored from 0 to 100. Five categories are each measured in points added, then compared with thousands of real NBA games (50 is a typical rotation player's night):</p>
      <ul>
        <li><b>Team result, 20%</b>: winning counts, scaled by his share of it; a loss costs by his minutes, half as much when it was close. Opponent's record, road, overtime, playoffs, plus-minus and win probability added.</li>
        <li><b>Offense, 30%</b>: points, with half the points above or below an average shooter on the same shots, and assists.</li>
        <li><b>Defense, 20%</b>: steals, blocks, defensive rebounds, and the opponent's scoring rate with him on the floor against without him.</li>
        <li><b>Possession, 15%</b>: offensive rebounds; turnovers against what his touches would predict, each costing more when the opponent scored off it and in a close game late.</li>
        <li><b>Crunch time, 15%</b>: the last 5 minutes within 5 points: win probability he added there, and the game-winner.</li>
      </ul>
      <p>Then deductions. <b>Stat padding</b> (up to 12): garbage-time stats for starters (the last 2 minutes with a 15-point lead), and, for box scores that look impressive, volume without efficiency, high usage with little creation, and turnovers out of proportion. <b>Fouls</b> (up to 7): technicals (more if the free throw went in, and in a close game), costly fouls and foul trouble, fouling out (by the time left and the score), flagrants and ejections. Each event is charged once.</p>
      {unavailable.length > 0 && <p className="fine">Not in ESPN's data, so not used: {unavailable.join(', ')}.</p>}
    </details>
  );
}

// ---- The night -----------------------------------------------------------------------------------------------------
function NightPage({ date, go, seasons }) {
  const [night, setNight] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(0);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(null); setOpen(0); setMore(false);
    loadNight(date).then(n => { if (!alive) return; setNight(n); if (date === 'latest') go(`/night/${n.date}`, { replace: true }); }).catch(e => alive && setError(e));
    return () => { alive = false; };
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live nights refresh every minute.
  useEffect(() => {
    if (!night?.live) return;
    const t = setInterval(() => fetch(`/api/night?date=${night.date}`).then(r => r.json()).then(setNight).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, [night?.live, night?.date]);

  const dates = night?.dates || [];
  const cur = night?.date || date;
  const i = dates.indexOf(cur);
  const prev = i > 0 ? dates[i - 1] : dates.filter(x => x < cur).pop();
  const next = i >= 0 ? dates[i + 1] : dates.find(x => x > cur);
  const today = fromDate(new Date());
  const pickSeason = y => {
    const s = seasons.find(x => x.year === y);
    const last = (s?.dates || []).filter(x => x <= today).pop() || s?.dates?.[0];
    if (last) go(`/night/${last}`);
  };
  const pickDay = v => {
    const d = v.replace(/-/g, '');
    if (!/^\d{8}$/.test(d)) return;
    // Snap to the nearest game night on or before the chosen day.
    go(`/night/${dates.length && !dates.includes(d) ? (dates.filter(x => x <= d).pop() || dates[0]) : d}`);
  };

  if (error) return <section className="empty"><h2>Couldn't load that night</h2><p>{error.message}</p><button className="btn" onClick={() => go('/')}>Latest night</button></section>;
  const top = night?.top || [];
  return (
    <section className="night">
      <div className="controls">
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={night?.season} onChange={pickSeason} />}
        <div className="datebar" role="group" aria-label="Choose a night">
          <button type="button" className="icon-btn" disabled={!prev} onClick={() => go(`/night/${prev}`)} aria-label={prev ? `Previous game night, ${longDay(prev)}` : 'No earlier game night'}><Arrow dir="left" /></button>
          <label className="day">
            <span className="day-label">{cur !== 'latest' ? longDay(cur) : 'Loading…'}</span>
            <input type="date" aria-label="Pick a date" value={cur !== 'latest' ? isoDay(cur) : ''} min={dates[0] ? isoDay(dates[0]) : undefined} max={dates.length ? isoDay(dates[dates.length - 1]) : undefined} onChange={e => pickDay(e.target.value)} />
          </label>
          <button type="button" className="icon-btn" disabled={!next || next > today} onClick={() => go(`/night/${next}`)} aria-label={next ? `Next game night, ${longDay(next)}` : 'No later game night'}><Arrow /></button>
        </div>
        <button type="button" className="btn small ghost" onClick={() => go('/')}>Latest</button>
      </div>

      <header className="night-head">
        <p className="eyebrow">Performance of the Night{night ? ` · ${night.games.length} game${night.games.length === 1 ? '' : 's'}` : ''}{night?.live ? ' · live' : ''}</p>
        <h1>{cur !== 'latest' ? longDay(cur) : 'The latest night'}</h1>
        {night && !night.final && night.games.length > 0 && <p className="note">{night.live ? 'Games are still being played: the ranking updates every minute and is final when the last game ends.' : 'Some games haven\'t finished yet.'}</p>}
      </header>

      {night?.games?.length > 0 && (
        <ul className="games" aria-label="Games">
          {night.games.map(g => (
            <li key={g.id} className={g.state === 'in' ? 'live' : ''}>
              {g.teams.slice().sort((a, b) => a.home - b.home).map(t => (
                <span key={t.id} className={t.winner ? 'won' : ''}><Logo team={t} size={18} />{t.abbr}<b>{t.score ?? ''}</b></span>
              ))}
              <small>{g.detail}{g.note ? ` · ${g.note}` : ''}</small>
            </li>
          ))}
        </ul>
      )}

      {!night && <div className="skeleton" aria-busy="true">{Array.from({ length: 5 }, (_, k) => <div key={k} className={`sk${k ? '' : ' hero'}`} />)}</div>}
      {night && !top.length && (
        <div className="empty"><h2>{night.games.length ? 'Waiting for tip-off' : 'No games this night'}</h2><p>{night.games.length ? 'Performances appear once games are under way.' : 'Pick another date, or step to the nearest game night with the arrows.'}</p></div>
      )}
      {top.length > 0 && (
        <>
          <ol className="top" aria-label="Top five performances">
            {top.slice(0, TOP).map((p, k) => <PerfCard key={`${p.event}-${p.id}`} p={p} rank={k + 1} hero={k === 0} open={open === k} onOpen={() => setOpen(open === k ? null : k)} potn={night.potn?.id === p.id ? night.potn : null} players={night.players} />)}
          </ol>
          {top.length > TOP && (
            <div className="also">
              <button type="button" className="btn small ghost" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Hide' : 'Show'} the next {top.length - TOP}</button>
              {more && (
                <ol start={TOP + 1} className="also-list">
                  {top.slice(TOP).map(p => <li key={`${p.event}-${p.id}`}><span>{p.name}</span><small>{p.team?.abbr} · {statline(p.line)}</small><b>{p.score.toFixed(1)}</b></li>)}
                </ol>
              )}
            </div>
          )}
          <Method unavailable={night.unavailable} players={night.players} />
        </>
      )}
      {night && (
        <p className="to-board"><Link to={`/leaderboard/${night.season}`} go={go} className="btn">Season leaderboard →</Link></p>
      )}
    </section>
  );
}

// ---- The leaderboard -----------------------------------------------------------------------------------------------
function LeaderboardPage({ season, go, seasons, current }) {
  const year = season || current || seasons[0]?.year;
  const [stage, setStage] = useState('all');
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!year) return;
    let alive = true;
    setBoard(null); setError(null); setOpen(null);
    loadLeaderboard(year, stage).then(b => alive && setBoard(b)).catch(e => alive && setError(e));
    return () => { alive = false; };
  }, [year, stage]);
  const info = seasons.find(s => s.year === year);

  return (
    <section className="board">
      <div className="controls">
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={year} onChange={y => go(`/leaderboard/${y}`)} />}
        <div className="seg" role="radiogroup" aria-label="Games">
          {[['all', 'All games'], ['regular', 'Regular season'], ['playoffs', 'Playoffs']].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={stage === k} className={stage === k ? 'on' : ''} onClick={() => setStage(k)}>{label}</button>
          ))}
        </div>
      </div>
      <header className="night-head">
        <p className="eyebrow">Season leaderboard{info ? ` · ${info.label}` : ''}</p>
        <h1>Most Performances of the Night</h1>
        <p className="note">A top-five finish on a night counts once; No. 1 nights and points (5 for first down to 1 for fifth) break ties.{board ? ` ${board.nights} nights scored.` : ''}</p>
      </header>
      {error && <div className="empty"><p>{error.message}</p></div>}
      {!board && !error && <div className="skeleton" aria-busy="true">{Array.from({ length: 6 }, (_, k) => <div key={k} className="sk row" />)}</div>}
      {board && !board.players.length && <div className="empty"><h2>Nothing yet</h2><p>No nights have been scored for this selection yet.</p></div>}
      {board && board.players.length > 0 && (
        <ol className="lb">
          <li className="lb-head" aria-hidden><span>#</span><span>Player</span><span>Top 5</span><span>No. 1</span><span>Points</span><span>Best</span></li>
          {board.players.map((p, k) => (
            <li key={p.id} className={open === p.id ? 'open' : ''} style={{ '--team': p.team?.color || '#ff7a1a' }}>
              <button type="button" className="lb-row" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                <span className="lb-rank">{k + 1}</span>
                <span className="lb-who"><Face p={{ id: p.id, name: p.name, headshot: p.headshot }} size={40} /><span><b>{p.name}</b><small><Logo team={p.team} size={14} /> {p.team?.abbr}</small></span></span>
                <span className="lb-n count"><Tally n={p.count} /><b>{p.count}</b><small>top 5</small></span>
                <span className="lb-n"><b>{p.firsts}</b><small>No. 1</small></span>
                <span className="lb-n"><b>{p.points}</b><small>pts</small></span>
                <span className="lb-n"><b>{p.best.toFixed(1)}</b><small>best</small></span>
              </button>
              {open === p.id && (
                <ul className="lb-nights">
                  {[...p.nights].sort((a, b) => b.date.localeCompare(a.date)).map(n => (
                    <li key={n.date}><Link to={`/night/${n.date}`} go={go}><span className={`badge r${n.rank}`}>#{n.rank}</span><span>{shortDay(n.date)} {n.opp ? `vs ${n.opp}` : ''}</span><small>{n.line ? statline(n.line) : ''} · {n.result}</small><b>{n.score.toFixed(1)}</b></Link></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---- The app -------------------------------------------------------------------------------------------------------
export default function App() {
  const [route, go] = useRoute();
  const [seasons, setSeasons] = useState([]);
  const [current, setCurrent] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadSeasons().then(s => { setSeasons(s.seasons); setCurrent(s.current); }).catch(() => {}).finally(() => setReady(true)); }, []);

  // The loading page (index.html) closes once the first data is in.
  useEffect(() => {
    if (!ready) return;
    const boot = document.getElementById('boot'); if (!boot) return;
    boot.classList.add('ready');
    const t = setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 900); }, Math.max(600, 3700 - performance.now()));
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => { document.title = route.page === 'leaderboard' ? 'Leaderboard · Performance of the Night' : 'Performance of the Night'; }, [route.page]);

  return (
    <div className="app">
      <Rough />
      <nav className="nav">
        <Link to="/" go={go} className="brand" aria-label="Performance of the Night, latest night">
          <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden><g fill="none" stroke="#f4a261" strokeWidth="6" strokeLinecap="round" filter="url(#rough)"><circle cx="50" cy="50" r="42" /><path d="M50 8v84M8 50h84" /><path d="M22 20c13 12 13 48 0 60" /><path d="M78 20c-13 12-13 48 0 60" /></g></svg>
          <span>Performance <em>of the Night</em></span>
        </Link>
        <div className="nav-links">
          <Link to="/" go={go} aria-current={route.page === 'night' ? 'page' : undefined}>Tonight</Link>
          <Link to={`/leaderboard${current ? `/${current}` : ''}`} go={go} aria-current={route.page === 'leaderboard' ? 'page' : undefined}>Leaderboard</Link>
        </div>
      </nav>
      <main className="stage">
        {route.page === 'night' && <NightPage key="night" date={route.date} go={go} seasons={seasons} />}
        {route.page === 'leaderboard' && <LeaderboardPage season={route.season} go={go} seasons={seasons} current={current} />}
      </main>
      <footer className="foot">Box scores, play-by-play, win probability and records from ESPN's public data. Not affiliated with the NBA or ESPN.</footer>
    </div>
  );
}
