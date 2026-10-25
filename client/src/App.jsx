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
const PART_NAME = { production: 'Production', efficiency: 'Efficiency', impact: 'Impact', clutch: 'Clutch', result: 'Result', breakout: 'Breakout', stage: 'Stage' };

function Breakdown({ parts }) {
  const max = Math.max(...parts.map(p => Math.abs(p.value)), 1);
  return (
    <ul className="parts">
      {parts.map(p => (
        <li key={p.k} className={p.value < 0 ? 'neg' : ''}>
          <span className="pk">{PART_NAME[p.k] || 'Milestone'}</span>
          <span className="pl">{p.label}</span>
          <span className="pbar"><i style={{ width: `${(Math.abs(p.value) / max) * 100}%` }} /></span>
          <b className="pv">{p.value > 0 ? '+' : ''}{p.value.toFixed(1)}</b>
        </li>
      ))}
    </ul>
  );
}

function PerfCard({ p, rank, hero, onOpen, open }) {
  const color = p.team?.color || '#ff7a1a';
  return (
    <M.li className={`perf${hero ? ' hero' : ''}${open ? ' open' : ''}`} style={{ '--team': color }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * rank, type: 'spring', stiffness: 220, damping: 24 }}>
      <button type="button" className="perf-main" onClick={onOpen} aria-expanded={open} aria-label={`Number ${rank}: ${p.name}, score ${p.score}. Show why`}>
        <span className="rank">{rank}</span>
        <Face p={p} size={hero ? 112 : 64} />
        <span className="who">
          <b className="name">{p.name}</b>
          <span className="team"><Logo team={p.team} size={16} /> {p.team?.abbr} {p.home ? 'vs' : '@'} <Logo team={p.opp} size={16} /> {p.opp?.abbr} · <em className={p.result.startsWith('W') ? 'w' : 'l'}>{p.result}</em>{STAGE_LABEL[p.stage] ? <> · <span className="stage">{STAGE_LABEL[p.stage]}</span></> : null}</span>
          <span className="line">{statline(p.line)}</span>
          {p.tags.length > 0 && <span className="tags">{p.tags.map(t => <i key={t}>{t}</i>)}</span>}
        </span>
        <span className="score"><b>{p.score.toFixed(1)}</b><small>score</small></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <M.div className="why" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <Breakdown parts={p.parts} />
            <p className="fine">{p.line.min} minutes · {p.line.ftm}-{p.line.fta} FT · {p.line.to} turnovers · {p.line.pm > 0 ? '+' : ''}{p.line.pm} plus-minus</p>
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
          <button type="button" className="icon-btn" disabled={!prev} onClick={() => go(`/night/${prev}`)} aria-label={prev ? `Previous game night, ${longDay(prev)}` : 'No earlier game night'}>‹</button>
          <label className="day">
            <span className="day-label">{cur !== 'latest' ? longDay(cur) : 'Loading…'}</span>
            <input type="date" aria-label="Pick a date" value={cur !== 'latest' ? isoDay(cur) : ''} min={dates[0] ? isoDay(dates[0]) : undefined} max={dates.length ? isoDay(dates[dates.length - 1]) : undefined} onChange={e => pickDay(e.target.value)} />
          </label>
          <button type="button" className="icon-btn" disabled={!next || next > today} onClick={() => go(`/night/${next}`)} aria-label={next ? `Next game night, ${longDay(next)}` : 'No later game night'}>›</button>
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
            {top.slice(0, TOP).map((p, k) => <PerfCard key={`${p.event}-${p.id}`} p={p} rank={k + 1} hero={k === 0} open={open === k} onOpen={() => setOpen(open === k ? null : k)} />)}
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
          <p className="fine method">The score adds production (Game Score, weighted by the opponent's record), shooting efficiency, plus-minus, win probability added in the moment, the result, milestones, how far above his own season average he played, and the stage. Tap a performance to see its parts.</p>
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
                <span className="lb-n"><b>{p.count}</b><small>top 5</small></span>
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
    const t = setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 900); }, Math.max(600, 1800 - performance.now()));
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => { document.title = route.page === 'leaderboard' ? 'Leaderboard · Performance of the Night' : 'Performance of the Night'; }, [route.page]);

  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" go={go} className="brand" aria-label="Performance of the Night, latest night">
          <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="46" fill="#e8701f" /><g fill="none" stroke="#2a1306" strokeWidth="5" strokeLinecap="round"><path d="M50 4v92M4 50h92" /><path d="M18 17c14 12 14 54 0 66" /><path d="M82 17c-14 12-14 54 0 66" /></g></svg>
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
