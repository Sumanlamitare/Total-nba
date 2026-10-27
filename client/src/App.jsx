// Performance of the Night: the best individual games of any NBA night, ranked 0 to 100, and who collects them over a
// season. A quiet dashboard: a ranked table with each performance's five category scores, opening into the breakdown.
import React, { useCallback, useEffect, useState } from 'react';
import { motion as M, AnimatePresence } from 'motion/react';
import { loadNight, loadSeasons, loadLeaderboard, longDay, shortDay, isoDay, fromDate } from './api.js';
import { perfText, nightText } from '../../lib/share.js';

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
function Face({ p, size = 32 }) {
  const [failed, setFailed] = useState(false);
  const src = p.headshot || `https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`;
  return (
    <span className="face" style={{ width: size, height: size }}>
      {!failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <b style={{ fontSize: size * 0.36 }}>{initials(p.name)}</b>}
    </span>
  );
}
const Logo = ({ team, size = 16 }) => (team?.logo ? <img className="logo" src={team.logo} alt="" width={size} height={size} loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /> : null);
const Chevron = ({ dir = 'right' }) => <svg className="chev" viewBox="0 0 16 16" aria-hidden><path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} /></svg>;

// "38 pts · 5 reb · 4 ast · 14-22 FG"
export function statline(l) {
  const parts = [`${l.pts} pts`, `${l.reb} reb`, `${l.ast} ast`];
  if (l.stl >= 2) parts.push(`${l.stl} stl`);
  if (l.blk >= 2) parts.push(`${l.blk} blk`);
  parts.push(`${l.fgm}-${l.fga} FG`);
  return parts.join(' · ');
}
const STAGE_LABEL = { playin: 'Play-in', playoffs: 'Playoffs', conf: 'Conf. finals', finals: 'Finals' };
const CATS = [['result', 'Result', 'R'], ['offense', 'Offense', 'O'], ['defense', 'Defense', 'D'], ['possession', 'Possession', 'P'], ['clutch', 'Crunch time', 'C']];
const sign = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const pct = v => (v == null ? '–' : `${Math.round(100 * v)}%`);
const won = p => String(p.result || '').startsWith('W');

// Five small bars, one per category, 0 to 100 with a tick at 50 (a typical rotation player's night).
function Spark({ c }) {
  return (
    <span className="spark" aria-hidden>
      {CATS.map(([k, name]) => {
        const v = c?.[k]?.score;
        return <i key={k} title={v == null ? `${name}: no data` : `${name} ${Math.round(v)}`} className={v == null ? 'na' : ''}><b style={{ height: `${v ?? 0}%` }} /></i>;
      })}
    </span>
  );
}

// ---- A performance: its row, and the breakdown it opens into -------------------------------------------------------
function Bar({ value }) {
  return <span className="bar" aria-hidden><b style={{ width: `${value}%` }} /><i /></span>;
}

function Categories({ p }) {
  return (
    <div className="cats">
      {CATS.map(([k, name]) => {
        const c = p.categories?.[k];
        return (
          <div key={k} className={`cat${c ? '' : ' na'}`}>
            <div className="cat-head">
              <span className="cat-name">{name}<small>{c ? `${Math.round(100 * c.weight)}%` : ''}</small></span>
              {c ? <Bar value={c.score} /> : <span className="muted">no data</span>}
              <b className="num">{c ? Math.round(c.score) : '–'}</b>
            </div>
            {c && (
              <ul className="items">
                {c.items.map((x, j) => <li key={j}><span>{x.label}</span><b className={`num${x.value < 0 ? ' neg' : ''}`}>{sign(x.value)}</b></li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Share: the phone's own share sheet where there is one, else a menu of networks and a copy-link button. Links go
// through /s/... so previews show the score card.
const shareUrl = (date, p) => `${location.origin}/s/${date}${p ? `/${p.id}` : ''}`;
function Share({ url, text, title, label = 'Share' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!e.target.closest?.('.share')) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const click = async () => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, text, url }); } catch { /* dismissed */ } return; }
    setOpen(!open);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { const t = document.createElement('textarea'); t.value = url; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const e = encodeURIComponent;
  const links = [
    ['X', `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`],
    ['Threads', `https://www.threads.net/intent/post?text=${e(`${text} ${url}`)}`],
    ['Bluesky', `https://bsky.app/intent/compose?text=${e(`${text} ${url}`)}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`],
    ['Reddit', `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`],
    ['WhatsApp', `https://wa.me/?text=${e(`${text} ${url}`)}`],
  ];
  return (
    <span className="share">
      <button type="button" className="btn share-btn" aria-expanded={open} onClick={click}>
        <svg viewBox="0 0 16 16" aria-hidden><path d="M8 10V2M5 5l3-3 3 3M3 8v5.5h10V8" /></svg>{label}
      </button>
      {open && (
        <span className="share-menu" role="menu">
          {links.map(([name, href]) => <a key={name} role="menuitem" href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{name}</a>)}
          <button type="button" role="menuitem" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
        </span>
      )}
    </span>
  );
}

function Detail({ p, potn, players, date }) {
  const l = p.line;
  const ded = [...(p.padding?.items || []).map(d => ({ ...d, kind: 'Padding' })), ...(p.fouls?.items || []).map(d => ({ ...d, kind: 'Fouls' }))];
  const stats = [
    ['MIN', l.min], ['PTS', l.pts], ['REB', `${l.reb}`], ['AST', l.ast], ['STL', l.stl], ['BLK', l.blk], ['TO', l.to], ['PF', l.pf],
    ['FG', `${l.fgm}-${l.fga}`], ['3PT', `${l.tpm}-${l.tpa}`], ['FT', `${l.ftm}-${l.fta}`], ['+/-', `${l.pm > 0 ? '+' : ''}${l.pm}`],
    ['TS', pct(l.ts)], ['eFG', pct(l.efg)], ['USG', pct(l.usage)], ['AST/TO', l.astTo ?? '–'],
  ];
  if (l.pointsOff != null) stats.push(['PTS OFF TO', l.pointsOff]);
  if (l.tech) stats.push(['TECH', l.tech]);
  if (l.flagrant) stats.push(['FLAGRANT', l.flagrant]);
  return (
    <div className="detail">
      <div className="detail-bar">
        <span className="muted">No. {p.rank || ''} of {players} players · {p.line.min} minutes</span>
        <Share url={shareUrl(date, p)} text={perfText(p, date)} title={`${p.name}: ${p.score.toFixed(1)}`} />
      </div>
      {potn && (
        <section className="verdict">
          <h3>Why {potn.name.split(' ').slice(-1)[0]} won <span className="muted">· No. 1 of {players} players</span></h3>
          <ul>{potn.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
          {potn.competitors.length > 0 && <>
            <h3>Closest competitors</h3>
            <ul>{potn.competitors.map(c => <li key={c.id}><b>{c.name}</b> <span className="num">{c.score.toFixed(1)}</span> <span className="muted">(−{c.gap.toFixed(1)})</span>. {c.text}.</li>)}</ul>
          </>}
        </section>
      )}
      <div className="detail-grid">
        <section>
          <h4>Categories <span className="muted">0–100 · 50 is a typical night</span></h4>
          <Categories p={p} />
        </section>
        <section>
          <h4>Score</h4>
          <table className="math">
            <tbody>
              <tr><td>Categories, weighted</td><td className="num">{p.base?.toFixed(1)}</td></tr>
              {ded.map((d, k) => <tr key={k} className="ded"><td><span className="tag">{d.kind}</span>{d.label}</td><td className="num neg">{sign(d.value)}</td></tr>)}
              {!ded.length && <tr><td className="muted">No deductions</td><td className="num">0.0</td></tr>}
              <tr className="total"><td>POTN score</td><td className="num">{p.score.toFixed(1)}</td></tr>
            </tbody>
          </table>
          <h4>Box score</h4>
          <dl className="stats">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
          {p.confidence && <p className={`conf ${p.confidence.level}`}><span className="dot" />Data confidence: {p.confidence.level}{p.confidence.missing.length ? ` — missing ${p.confidence.missing.join('; ')}` : ''}</p>}
        </section>
      </div>
    </div>
  );
}

function Row({ p, rank, open, onOpen, potn, players, date }) {
  return (
    <li className={`perf${rank === 1 ? ' first' : ''}${open ? ' open' : ''}`}>
      <button type="button" className="row" onClick={onOpen} aria-expanded={open} aria-label={`Number ${rank}: ${p.name}, score ${p.score}. ${open ? 'Hide' : 'Show'} the breakdown`}>
        <span className="rk num">{rank}</span>
        <span className="who">
          <Face p={p} />
          <span>
            <b className="name">{p.name}</b>
            <small><Logo team={p.team} size={14} />{p.team?.abbr} {p.home ? 'vs' : '@'} {p.opp?.abbr}{STAGE_LABEL[p.stage] ? ` · ${STAGE_LABEL[p.stage]}` : ''}<span className={`res-m ${won(p) ? 'w' : 'l'}`}>{p.result}</span></small>
            <span className="line-m">{statline(p.line)}</span>
          </span>
        </span>
        <span className={`res ${won(p) ? 'w' : 'l'}`}>{p.result}</span>
        <span className="line">{statline(p.line)}{p.tags?.length ? <span className="tags">{p.tags.map(t => <i key={t} className={/Padded|Ejected|Fouled/.test(t) ? 'bad' : ''}>{t}</i>)}</span> : null}</span>
        <Spark c={p.categories} />
        <span className="score num">{p.score.toFixed(1)}</span>
        <Chevron dir="right" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <M.div className="open-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <Detail p={{ rank, ...p }} potn={potn} players={players} date={date} />
          </M.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function SeasonSelect({ seasons, value, onChange }) {
  return (
    <label className="select">
      <span className="sr-only">Season</span>
      <select value={value || ''} onChange={e => onChange(+e.target.value)}>
        {seasons.map(s => <option key={s.year} value={s.year}>{s.label}</option>)}
      </select>
    </label>
  );
}

// How the score works, in brief.
function Method({ unavailable = [], players }) {
  return (
    <details className="method">
      <summary>How the score works</summary>
      <p>Every player who appeared{players ? ` (${players} tonight)` : ''} is scored from 0 to 100. Each category is measured in points added and compared with thousands of real NBA games: 50 is a typical rotation player's night, each 7 is one standard deviation.</p>
      <table className="weights">
        <tbody>
          <tr><th>Result</th><td className="num">20%</td><td>A win, scaled by his share of it; a loss by his minutes, half when close. Opponent, road, overtime, playoffs, plus-minus, win probability added.</td></tr>
          <tr><th>Offense</th><td className="num">30%</td><td>Points, plus or minus half the points above or below an average shooter on the same shots; assists.</td></tr>
          <tr><th>Defense</th><td className="num">20%</td><td>Steals, blocks, defensive rebounds; the opponent's scoring rate with him on the floor against without him.</td></tr>
          <tr><th>Possession</th><td className="num">15%</td><td>Offensive rebounds; turnovers against what his touches predict, each costing more when the opponent scored off it and late in a close game.</td></tr>
          <tr><th>Crunch time</th><td className="num">15%</td><td>Last 5 minutes within 5: win probability added, the game-winner.</td></tr>
          <tr><th>Stat padding</th><td className="num">−12</td><td>Garbage-time stats for starters (last 2 minutes, 15-point lead); for impressive-looking box scores, volume without efficiency, usage without creation, turnovers out of proportion.</td></tr>
          <tr><th>Fouls</th><td className="num">−7</td><td>Technicals (more if the free throw went in, and late in a close game), costly fouls and foul trouble, fouling out, flagrants and ejections.</td></tr>
        </tbody>
      </table>
      <p className="muted">Each event is charged once.{unavailable.length ? ` Not in ESPN's data, so not used: ${unavailable.join(', ')}.` : ''}</p>
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
    loadNight(date).then(n => {
      if (!alive) return;
      setNight(n);
      if (date === 'latest') go(`/night/${n.date}`, { replace: true });
      // A shared link (?p=playerId) opens that performance.
      const pid = new URLSearchParams(location.search).get('p');
      const k = pid ? (n.top || []).findIndex(x => x.id === pid) : -1;
      if (k >= 0) { setOpen(k); if (k >= TOP) setMore(true); setTimeout(() => document.querySelectorAll('.rows > .perf')[k]?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); }
    }).catch(e => alive && setError(e));
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

  const top = night?.top || [];
  const shown = more ? top : top.slice(0, TOP);
  return (
    <section className="night">
      <div className="toolbar">
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={night?.season} onChange={pickSeason} />}
        <div className="datebar" role="group" aria-label="Choose a night">
          <button type="button" className="icon" disabled={!prev} onClick={() => go(`/night/${prev}`)} aria-label={prev ? `Previous game night, ${longDay(prev)}` : 'No earlier game night'}><Chevron dir="left" /></button>
          <label className="day">
            <span>{cur !== 'latest' ? longDay(cur) : 'Loading…'}</span>
            <input type="date" aria-label="Pick a date" value={cur !== 'latest' ? isoDay(cur) : ''} min={dates[0] ? isoDay(dates[0]) : undefined} max={dates.length ? isoDay(dates[dates.length - 1]) : undefined} onChange={e => pickDay(e.target.value)} />
          </label>
          <button type="button" className="icon" disabled={!next || next > today} onClick={() => go(`/night/${next}`)} aria-label={next ? `Next game night, ${longDay(next)}` : 'No later game night'}><Chevron /></button>
        </div>
        <button type="button" className="btn" onClick={() => go('/')}>Latest</button>
      </div>

      {error ? (
        <div className="empty"><h2>Couldn't load that night</h2><p>{error.message}</p><button className="btn" onClick={() => go('/')}>Latest night</button></div>
      ) : <>
        <header className="head">
          <div className="head-row">
            <h1>{cur !== 'latest' ? longDay(cur) : 'The latest night'}</h1>
            {night?.top?.length > 0 && <Share url={shareUrl(night.date)} text={nightText(night, night.date)} title={`Performance of the Night, ${longDay(night.date)}`} label="Share the night" />}
          </div>
          <p className="muted">
            {night ? `${night.games.length} game${night.games.length === 1 ? '' : 's'} · ${night.players || 0} players scored` : 'Loading…'}
            {night?.live && <span className="live"> · live, updates every minute</span>}
            {night && !night.final && !night.live && night.games.length > 0 && ' · not final yet'}
          </p>
        </header>

        {night?.games?.length > 0 && (
          <ul className="games" aria-label="Games">
            {night.games.map(g => (
              <li key={g.id} className={g.state === 'in' ? 'live' : ''}>
                {g.teams.slice().sort((a, b) => a.home - b.home).map(t => (
                  <span key={t.id} className={t.winner ? 'won' : ''}><Logo team={t} size={14} /><span>{t.abbr}</span><b className="num">{t.score ?? ''}</b></span>
                ))}
                <small>{g.detail}{g.note ? ` · ${g.note}` : ''}</small>
              </li>
            ))}
          </ul>
        )}

        {!night && <div className="skeleton" aria-busy="true">{Array.from({ length: 5 }, (_, k) => <div key={k} />)}</div>}
        {night && !top.length && (
          <div className="empty"><h2>{night.games.length ? 'Waiting for tip-off' : 'No games this night'}</h2><p>{night.games.length ? 'Performances appear once games are under way.' : 'Pick another date, or step to the nearest game night with the arrows.'}</p></div>
        )}
        {top.length > 0 && (
          <div className="table">
            <div className="thead" aria-hidden>
              <span>#</span><span>Player</span><span>Result</span><span>Line</span>
              <span className="spark-head">{CATS.map(([k, name, a]) => <i key={k} title={name}>{a}</i>)}</span>
              <span className="r">Score</span><span />
            </div>
            <ol className="rows" aria-label="Top performances">
              {shown.map((p, k) => <Row key={`${p.event}-${p.id}`} p={p} rank={k + 1} open={open === k} onOpen={() => setOpen(open === k ? null : k)} potn={k === 0 && night.potn?.id === p.id ? night.potn : null} players={night.players} date={night.date} />)}
            </ol>
            {top.length > TOP && <button type="button" className="more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Show the top 5' : `Show ${TOP + 1}–${top.length}`}</button>}
          </div>
        )}
        {night && top.length > 0 && <Method unavailable={night.unavailable} players={night.players} />}
        {night && <p className="to-board"><Link to={`/leaderboard/${night.season}`} go={go} className="btn">Season leaderboard</Link></p>}
      </>}
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
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (!year) return;
    let alive = true;
    setBoard(null); setError(null); setOpen(null); setAll(false);
    loadLeaderboard(year, stage).then(b => alive && setBoard(b)).catch(e => alive && setError(e));
    return () => { alive = false; };
  }, [year, stage]);
  const info = seasons.find(s => s.year === year);
  const most = board?.players?.[0]?.count || 1;

  return (
    <section className="board">
      <div className="toolbar">
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={year} onChange={y => go(`/leaderboard/${y}`)} />}
        <div className="seg" role="radiogroup" aria-label="Games">
          {[['all', 'All games'], ['regular', 'Regular season'], ['playoffs', 'Playoffs']].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={stage === k} className={stage === k ? 'on' : ''} onClick={() => setStage(k)}>{label}</button>
          ))}
        </div>
      </div>
      <header className="head">
        <h1>Most top-five nights{info ? `, ${info.label}` : ''}</h1>
        <p className="muted">Ranked by top-five finishes; No. 1 nights, then points (5 for first to 1 for fifth) break ties.{board ? ` ${board.nights} nights scored.` : ''}</p>
      </header>
      {error && <div className="empty"><p>{error.message}</p></div>}
      {!board && !error && <div className="skeleton" aria-busy="true">{Array.from({ length: 8 }, (_, k) => <div key={k} />)}</div>}
      {board && !board.players.length && <div className="empty"><h2>Nothing yet</h2><p>No nights have been scored for this selection yet.</p></div>}
      {board && board.players.length > 0 && (
        <div className="table">
          <div className="thead lb" aria-hidden><span>#</span><span>Player</span><span>Top 5</span><span className="r">No. 1</span><span className="r">Points</span><span className="r">Best</span><span /></div>
          <ol className="rows">
            {(all ? board.players : board.players.slice(0, 25)).map((p, k) => (
              <li key={p.id} className={open === p.id ? 'open' : ''}>
                <button type="button" className="row lb" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                  <span className="rk num">{k + 1}</span>
                  <span className="who"><Face p={{ id: p.id, name: p.name, headshot: p.headshot }} /><span><b className="name">{p.name}</b><small><Logo team={p.team} size={14} />{p.team?.abbr}</small></span></span>
                  <span className="count"><span className="hbar"><b style={{ width: `${(100 * p.count) / most}%` }} /></span><b className="num">{p.count}</b></span>
                  <span className="num r">{p.firsts}</span>
                  <span className="num r">{p.points}</span>
                  <span className="num r">{p.best.toFixed(1)}</span>
                  <Chevron />
                </button>
                {open === p.id && (
                  <ul className="nights">
                    {[...p.nights].sort((a, b) => b.date.localeCompare(a.date)).map(n => (
                      <li key={n.date}><Link to={`/night/${n.date}`} go={go}><span className={`badge${n.rank === 1 ? ' first' : ''}`}>#{n.rank}</span><span>{shortDay(n.date)}{n.opp ? ` vs ${n.opp}` : ''}</span><small>{n.line ? statline(n.line) : ''} · {n.result}</small><b className="num">{n.score.toFixed(1)}</b></Link></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {board.players.length > 25 && <button type="button" className="more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show the top 25' : `Show all ${board.players.length}`}</button>}
        </div>
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

  // The loading screen (index.html) fades once the first data is in.
  useEffect(() => {
    if (!ready) return;
    const boot = document.getElementById('boot'); if (!boot) return;
    const t = setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 400); }, Math.max(0, 700 - performance.now()));
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => { document.title = route.page === 'leaderboard' ? 'Leaderboard · Performance of the Night' : 'Performance of the Night'; }, [route.page]);

  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" go={go} className="brand" aria-label="Performance of the Night, latest night"><i className="ball" aria-hidden />Performance of the Night</Link>
        <div className="tabs">
          <Link to="/" go={go} aria-current={route.page === 'night' ? 'page' : undefined}>Nights</Link>
          <Link to={`/leaderboard${current ? `/${current}` : ''}`} go={go} aria-current={route.page === 'leaderboard' ? 'page' : undefined}>Leaderboard</Link>
        </div>
      </nav>
      <main className="main">
        {route.page === 'night' && <NightPage key="night" date={route.date} go={go} seasons={seasons} />}
        {route.page === 'leaderboard' && <LeaderboardPage season={route.season} go={go} seasons={seasons} current={current} />}
      </main>
      <footer className="foot">Box scores, play-by-play, win probability and records from ESPN's public data. Not affiliated with the NBA or ESPN.</footer>
    </div>
  );
}
