// Beat the Dynasty. Draft a starting five from random franchise + decade spins, then take on a champion in a
// best-of-seven. Beat the ladder of dynasties to reach the '17 Warriors.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion as M, AnimatePresence } from 'motion/react';
import { loadGame, store } from './api.js';
import { SLOTS, daily as dailyOf, decadeLabel, rateSeries, simulate, todayKey } from './game.js';
import { teamGlow } from './colors.js';
import { Face } from './bits.jsx';
import Draft from './Draft.jsx';
import { Tape, Series, Result } from './Series.jsx';
import { setSound, soundOn, sfx } from './sound.js';

const decadeOfSeason = s => Math.floor((s - 1) / 10) * 10;
const BEATEN_KEY = 'btd.beaten';
const DAILY_KEY = 'btd.daily';

// Shape the API payload for play: every era keyed, every player knowing his franchise and decade, each dynasty's
// five as a lineup.
export function prepare(d) {
  const teamById = new Map(d.teams.map(t => [t.id, t]));
  const eras = d.eras.filter(e => teamById.has(e.team)).map(e => ({
    ...e, key: `${e.team}-${e.decade}`,
    players: e.players.map(p => ({ ...p, team: e.team, decade: e.decade })),
  }));
  const dynasties = d.dynasties.map(x => {
    const team = teamById.get(x.team);
    const lineup = Object.fromEntries(x.five.map(p => [p.slot, { ...p, team: x.team, decade: decadeOfSeason(x.season), season: x.season }]));
    return { ...x, lineup, teamInfo: team, glow: teamGlow(team), short: team?.short || x.abbr };
  });
  return { ...d, teamById, eras, dynasties, playerEras: eras.reduce((n, e) => n + e.players.length, 0) };
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [beaten, setBeaten] = useState(() => new Set(store.get(BEATEN_KEY) || []));
  const [run, setRun] = useState(null); // { dynasty, seed, daily, lineup, rated, series, screen }
  const [sound, setSoundState] = useState(soundOn());

  useEffect(() => {
    loadGame().then(d => setData(prepare(d))).catch(e => setError(e));
  }, []);

  // The loading page (index.html): fill the scoreboard and ticker from the real data, then close the arena.
  useEffect(() => {
    const boot = document.getElementById('boot');
    if (!boot || !data) return;
    const n = document.getElementById('boot-n'), msg = document.getElementById('boot-msg'), runEl = document.getElementById('boot-run');
    if (msg) msg.textContent = 'rated and ready';
    if (runEl) {
      const stars = data.eras.map(e => e.players[0]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 16).map(p => `${p.n} ${p.ovr}`);
      const names = data.dynasties.map(x => x.label).concat(stars);
      runEl.replaceChildren(...names.flatMap((t, k) => { const a = document.createElement('span'); a.textContent = t; const d = document.createElement('i'); d.textContent = '●'; return k ? [d, a] : [a]; }));
    }
    if (n) {
      const total = data.playerEras, t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 900); n.textContent = Math.round(total * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US'); if (k < 1 && boot.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    boot.classList.add('ready');
  }, [data]);
  useEffect(() => {
    if (!data && !error) return;
    const boot = document.getElementById('boot'); if (!boot) return;
    const t = setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 900); }, Math.max(1100, 2200 - performance.now()));
    return () => clearTimeout(t);
  }, [data, error]);

  // Each screen starts at the top of the page.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [run?.screen]);

  const eraOf = useCallback(p => {
    const t = data?.teamById.get(p.team);
    return p.season ? `${t?.abbr || ''} '${String(p.season).slice(2)}` : `${t?.abbr || ''} ${decadeLabel(p.decade)}`;
  }, [data]);

  const start = (dynasty, opts = {}) => {
    sfx('lock');
    setRun({ dynasty, seed: opts.seed || `${dynasty.key}:${Date.now()}`, daily: opts.daily || null, screen: 'draft' });
  };
  const drafted = lineup => setRun(r => ({ ...r, lineup, rated: rateSeries(lineup, r.dynasty.lineup), screen: 'tape' }));
  const names = run && { mine: 'Your Five', theirs: run.dynasty.short, theirsFull: run.dynasty.label };
  const colors = run && { theirs: run.dynasty.glow };
  const tip = () => {
    const gap = run.rated.mine.rating - run.rated.theirs.rating;
    const ids = SLOTS.map(s => run.lineup[s].i).join('.');
    const series = simulate({ mine: run.lineup, theirs: run.dynasty.lineup, gap, names, seed: `${run.seed}:${ids}` });
    sfx('buzzer');
    setRun(r => ({ ...r, series, screen: 'series' }));
  };
  const finish = () => {
    const { series, dynasty, daily } = run;
    if (series.won && !daily) {
      const next = new Set(beaten); next.add(dynasty.key);
      setBeaten(next); store.set(BEATEN_KEY, [...next]);
    }
    if (daily) store.set(DAILY_KEY, { day: daily, key: dynasty.key, won: series.won, w: series.w, l: series.l });
    setRun(r => ({ ...r, screen: 'result' }));
  };

  const toggleSound = () => { setSound(!sound); setSoundState(!sound); if (!sound) sfx('pick'); };

  if (error) return <main className="fault"><h1>The arena is dark</h1><p>{error.status === 503 ? 'The rosters are still being built. Try again in a few minutes.' : error.message}</p><button className="btn primary" onClick={() => location.reload()}>Try again</button></main>;
  if (!data) return null;

  const ladderIndex = run ? data.dynasties.findIndex(x => x.key === run.dynasty.key) : -1;
  const next = ladderIndex >= 0 && !run?.daily ? data.dynasties[ladderIndex + 1] || null : null;

  return (
    <div className="app">
      <nav className="nav">
        <button type="button" className="brand" onClick={() => setRun(null)} aria-label="Beat the Dynasty, home">
          <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="46" fill="#e8701f" /><g fill="none" stroke="#2a1306" strokeWidth="5" strokeLinecap="round"><path d="M50 4v92M4 50h92" /><path d="M18 17c14 12 14 54 0 66" /><path d="M82 17c-14 12-14 54 0 66" /></g></svg>
          <span>Beat the <em>Dynasty</em></span>
        </button>
        <div className="nav-right">
          {run && <span className="nav-note">vs {run.dynasty.label}</span>}
          <button type="button" className="icon-btn" onClick={toggleSound} aria-pressed={sound} aria-label="Sound" title={sound ? 'Sound on' : 'Sound off'}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{sound ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>
          </button>
        </div>
      </nav>
      <main className="stage">
        <AnimatePresence mode="wait">
          <M.div key={run ? `${run.seed}-${run.screen}` : 'home'} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28 }}>
            {!run && <Home data={data} beaten={beaten} onPlay={start} />}
            {run?.screen === 'draft' && <Draft data={data} dynasty={run.dynasty} seed={run.seed} eraOf={eraOf} onDone={drafted} onQuit={() => setRun(null)} />}
            {run?.screen === 'tape' && <Tape mine={run.lineup} theirs={run.dynasty.lineup} rated={run.rated} names={names} colors={colors} eraOf={eraOf} onTip={tip} />}
            {run?.screen === 'series' && <Series series={run.series} names={names} colors={colors} onEnd={finish} />}
            {run?.screen === 'result' && <Result lineup={run.lineup} dynasty={run.dynasty} series={run.series} rating={run.rated} names={names} colors={colors} eraOf={eraOf} daily={run.daily}
              next={next} onAgain={() => start(run.dynasty, run.daily ? { seed: run.seed, daily: run.daily } : {})} onNext={() => next && start(next)} onHome={() => setRun(null)} />}
          </M.div>
        </AnimatePresence>
      </main>
      <footer className="foot">Ratings come from each player's real regular-season and playoff numbers and awards with that franchise in that decade. Dynasties are rated on their championship season, with the reputation each starter had built by then.</footer>
    </div>
  );
}

function Home({ data, beaten, onPlay }) {
  const today = todayKey();
  const d = useMemo(() => dailyOf(data.dynasties, today), [data, today]);
  const played = store.get(DAILY_KEY);
  const playedToday = played?.day === today ? played : null;
  const unlocked = k => k === 0 || beaten.has(data.dynasties[k - 1].key);
  const count = data.dynasties.filter(x => beaten.has(x.key)).length;
  const [peek, setPeek] = useState(null);

  return (
    <section className="home">
      <div className="hero">
        <p className="eyebrow">Five spins · five picks · one series</p>
        <h1>Beat the <span>Dynasty</span></h1>
        <p className="lede">Spin a franchise and a decade, sign one of the players it deals, and do it five times: one per position, no take-backs. Then take your five into a best-of-seven against one of the greatest teams ever.</p>
      </div>

      <div className="daily" style={{ '--glow': d.dynasty.glow }}>
        <div>
          <p className="eyebrow">Daily challenge · {today}</p>
          <h2>Today: the {d.dynasty.label}</h2>
          <p>Everyone gets the same spins. {playedToday ? <b>You {playedToday.won ? 'won' : 'lost'} {playedToday.won ? `${playedToday.w}-${playedToday.l}` : `${playedToday.l}-${playedToday.w}`} today.</b> : 'One shot at bragging rights.'}</p>
        </div>
        <button type="button" className="btn primary big" onClick={() => onPlay(d.dynasty, { seed: d.seed, daily: today })}>{playedToday ? 'Play it again' : 'Play the daily'}</button>
      </div>

      <div className="ladder-head">
        <h2>The ladder</h2>
        <p>{count} of {data.dynasties.length} dynasties beaten. Win a series to unlock the next banner.</p>
      </div>
      <ol className="banners">
        {data.dynasties.map((x, k) => {
          const open = unlocked(k), won = beaten.has(x.key);
          const avg = SLOTS.reduce((s, sl) => s + x.lineup[sl].ovr, 0) / 5;
          return (
            <M.li key={x.key} initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * k, type: 'spring', stiffness: 160, damping: 16 }}>
              <button type="button" className={`banner${open ? '' : ' locked'}${won ? ' won' : ''}${x.boss ? ' boss' : ''}`} style={{ '--team': x.glow }}
                onClick={() => (open ? onPlay(x) : setPeek(peek === x.key ? null : x.key))} aria-label={`${x.label}${won ? ', beaten' : open ? '' : ', locked'}`}>
                <span className="banner-rung">{x.boss ? 'Final boss' : `Rung ${k + 1}`}</span>
                <span className="banner-year">{x.season - 1}–{String(x.season).slice(2)}</span>
                <span className="banner-name">{x.short}</span>
                <span className="banner-faces">{SLOTS.map(s => <Face key={s} p={x.lineup[s]} size={30} ring={x.glow} />)}</span>
                <span className="banner-avg">Starters avg <b>{avg.toFixed(1)}</b></span>
                <span className="banner-state">{won ? '✓ Beaten' : open ? 'Play' : '🔒 Locked'}</span>
              </button>
              {peek === x.key && !open && <p className="peek">Beat the {data.dynasties[k - 1].label} first.</p>}
            </M.li>
          );
        })}
      </ol>

      <div className="rules">
        <h2>How it plays</h2>
        <ol>
          <li><b>Draft.</b> Each spin lands on a franchise and a decade and deals four of its players. Sign one for an open position.</li>
          <li><b>Rate.</b> Every player-era is rated 60–99 from his real numbers in that stretch, with playoff games counting double, plus up to +7 for reputation: the MVPs, All-NBA teams and rings he won there.</li>
          <li><b>Fit.</b> +2 for a ball-handler, two shooters and a rim protector; −3 for three centers or no point guard; +1 for three from the same decade.</li>
          <li><b>Pedigree.</b> +0.5 for every champion in the lineup; teammates from the same era click (+1); a dynasty's real five played together all year (+2).</li>
          <li><b>Matchups.</b> Each position battle you win adds half a point.</li>
          <li><b>Series.</b> The rating gap sets the odds: even is 50%, +5 about 65%, −10 about 22%. The dynasty has home court; Game 7 is wilder.</li>
        </ol>
      </div>
    </section>
  );
}
