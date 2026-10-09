import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import { STATS, LONG, SHORT, key, parse, addDays, seasonName, periodLabel } from './util.js';
import { teamColor } from './teams.js';
import useBook from './useBook.js';
import Loader from './components/Loader.jsx';
import Calendar from './components/Calendar.jsx';
import GraphicModal from './components/GraphicModal.jsx';
import ListSheet from './components/ListSheet.jsx';
import PlayerSheet from './components/PlayerSheet.jsx';
import SearchSheet from './components/SearchSheet.jsx';
import Book from './components/Book.jsx';
import CardSheet from './components/CardSheet.jsx';
import { Sheet, I } from './components/ui.jsx';
import { StatChips, Podium, Board, Games, Stories, stories } from './components/Leaders.jsx';
import Records from './components/Records.jsx';
import Privacy from './components/Privacy.jsx';
import Ad from './components/Ads.jsx';
import { usePro, ProPage, ProLock, downloadCSV, CSV_COLS } from './components/Pro.jsx';
import { parsePath, pathFor, playerPath, STAT_NAME } from '../../lib/routes.js';

const MODES = ['day', 'week', 'season', 'records', 'pro', 'saved', 'privacy'];
const TABS = [['day', 'DAY'], ['week', 'WEEK'], ['season', 'SEASON'], ['records', 'RECORDS'], ['pro', 'PRO']];
const STATIC = m => ['records', 'pro', 'saved', 'privacy'].includes(m); // views without a period to load
const TITLE = { records: 'All-time records', pro: 'TotalNBA Pro', saved: 'Saved cards', privacy: 'Privacy policy' };
const BURST = { common: '#cfd3da', rare: '#4DA3FF', epic: '#B07CFF', legendary: '#FFC43D' };

// Crash trace: if the tab dies mid-step, the next visit says which step (and the iOS version)
const trace = step => { try { localStorage.setItem('tn_trace', JSON.stringify({ step, at: Date.now() })); } catch { /* storage off */ } };
const lastCrash = (() => {
  try {
    const t = JSON.parse(localStorage.getItem('tn_trace') || 'null');
    if (!t || t.step === 'ok') return '';
    const ios = (navigator.userAgent.match(/OS (\d+[_\d]*) like Mac/) || [])[1];
    return `Last visit stopped while ${t.step}${ios ? ' · iOS ' + ios.replace(/_/g, '.') : ''}`;
  } catch { return ''; }
})();

function Burst({ b }) {
  if (!b) return null;
  return (
    <div className="burst" style={{ left: b.x, top: b.y, '--c': BURST[b.rarity] }} key={b.id} aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--a': `${i * 20}deg`, '--d': `${46 + (i % 3) * 20}px` }} />)}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skel" aria-label="Loading">
      <div className="sk-pod">{[0, 1, 2].map(i => <span key={i} style={{ '--i': i }} />)}</div>
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="sk-row" style={{ '--i': i }} />)}
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState({ seasons: [], dates: [], has: new Set() });
  const [booted, setBooted] = useState(false);
  const [st, setSt] = useState(null);         // { mode, stat, si, date }
  const [v, setV] = useState(null);           // the loaded view (raw rows for the period on screen)
  const [ver, setVer] = useState(0);
  const [dir, setDir] = useState('up');       // which way the next view slides in
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [game, setGame] = useState(null);
  const [otd, setOtd] = useState(null);
  const [ov, setOv] = useState(null);         // which sheet is open
  const [sel, setSel] = useState(null);       // { c, rank } for the card sheet
  const [playerKey, setPlayerKey] = useState(null);
  const [graphic, setGraphic] = useState(null);
  const [toast, setToast] = useState(null);
  const [burst, setBurst] = useState(null);
  const book = useBook();
  const pro = usePro();
  const fromPop = useRef(false);
  const playerName = useRef('');
  const req = useRef(0);
  const [mini, setMini] = useState(false); // header folds its top row once you scroll
  useEffect(() => {
    const on = () => setMini(scrollY > 60);
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);

  // load a selection; views slide in from the side you're heading to
  const go = (nx, d = 'up') => {
    setSt(nx); setDir(d); setGame(null);
    if (scrollY > 0) scrollTo({ top: 0 });
    if (STATIC(nx.mode)) { setVer(x => x + 1); setLoading(false); return; }
    setLoading(true); setErr('');
    const id = ++req.current;
    trace('loading ' + nx.mode.toUpperCase());
    api.fetchView(nx, meta).then(view => {
      if (id !== req.current) return;
      trace(`showing ${nx.mode.toUpperCase()} (${view.raw.length} players)`);
      setV(view); setVer(x => x + 1); setLoading(false);
      if (view.raw.length && nx.mode === 'day' && !meta.has.has(key(nx.date))) setMeta(m => ({ ...m, has: new Set([...m.has, key(nx.date)]) }));
      setTimeout(() => trace('ok'), 4000);
    }).catch(e => { if (id === req.current) { setErr('Could not load data (' + e.message + ')'); setV(null); setLoading(false); } });
  };

  // a parsed address -> selection (newest game day when no date is given)
  const fromRoute = (r, m) => {
    const latest = m.dates.length ? parse(m.dates.at(-1)) : new Date();
    const si = r.season ? Math.max(0, m.seasons.indexOf(r.season)) : 0;
    return { mode: r.mode === 'player' ? 'day' : r.mode, stat: r.stat || 'POINTS', si, date: r.date ? parse(r.date) : latest };
  };
  // keep the address bar and tab title in step with what's on screen (back/forward works)
  useEffect(() => {
    if (!st || !meta.seasons) return;
    const path = ov === 'player' && playerKey && playerName.current ? playerPath(playerName.current, playerKey)
      : pathFor({ mode: st.mode, date: key(st.date), season: meta.seasons[st.si], stat: st.stat });
    const home = location.pathname === '/' && st.mode === 'day' && key(st.date) === meta.dates.at(-1) && st.stat === 'POINTS';
    if (!home && path !== location.pathname) {
      if (fromPop.current) history.replaceState(null, '', path); else history.pushState(null, '', path);
    }
    fromPop.current = false;
    const sn = STAT_NAME[st.stat];
    document.title = (ov === 'player' && playerName.current ? `${playerName.current} stats`
      : st.mode === 'day' ? `${sn} leaders · ${periodLabel({ ...st }, meta.seasons)}`
        : st.mode === 'week' ? `${sn} · week of ${periodLabel({ ...st, week: true }, meta.seasons, true)}`
          : st.mode === 'season' ? `${seasonName(meta.seasons[st.si])} ${sn} leaders`
            : st.mode === 'records' ? `Most ${sn.toLowerCase()} in a game since 1993` : TITLE[st.mode]) + ' · TotalNBA';
  }, [st, ov, playerKey]);
  useEffect(() => {
    const pop = () => {
      const r = parsePath(location.pathname);
      if (!r || !meta.dates) return;
      fromPop.current = true;
      if (r.mode === 'player') { setPlayerKey(r.player); setOv('player'); return; }
      setOv(null);
      go(fromRoute(r, meta), 'up');
    };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  });

  // boot: the page in the address bar (newest game day for the home page)
  useEffect(() => {
    const t0 = Date.now();
    api.getMeta().catch(e => { setErr('Server unreachable (' + e.message + ')'); return { dates: [], seasons: [] }; }).then(m => {
      m.has = new Set(m.dates);
      setMeta(m);
      const r = parsePath(location.pathname) || { mode: 'day', stat: 'POINTS' };
      const s = fromRoute(r, m);
      if (r.mode === 'player') { setPlayerKey(r.player); setOv('player'); }
      fromPop.current = true; setSt(s);
      const done = () => { setLoading(false); setTimeout(() => setBooted(true), Math.max(0, 1600 - (Date.now() - t0))); };
      if (STATIC(s.mode)) { setVer(1); done(); return; }
      api.fetchView(s, m).then(view => { setV(view); setVer(1); }).catch(e => setErr('Could not load data (' + e.message + ')')).finally(done);
    });
  }, []);

  const f = st ? STATS[st.stat] : 'pts';
  const all = useMemo(() => (v && st ? api.cardsFor(v, st.stat) : []), [v, st?.stat]);
  const cards = useMemo(() => (game ? all.filter(c => c.gameId === game) : all), [all, game]);
  const leaders = useMemo(() => {
    if (!v?.raw?.length) return {};
    const src = game ? v.raw.filter(l => l.gameId === game) : v.raw;
    return Object.fromEntries(Object.entries(STATS).map(([k, x]) => [k, src.reduce((a, l) => ((l[x] ?? 0) > (a?.[x] ?? -1) ? l : a), null)]));
  }, [v, game]);
  const tales = useMemo(() => (v?.kind === 'game' && !game ? stories(v.raw, v.games) : []), [v, game]);
  const glow = cards[0] ? teamColor(cards[0].team) : '#FF6B1A';

  // on this day: best line on this calendar date in another season
  useEffect(() => {
    if (!st || st.mode !== 'day' || !v) { setOtd(null); return; }
    let alive = true;
    api.onThisDay(st.date, f).then(l => alive && setOtd(l?.[0] || null)).catch(() => {});
    return () => { alive = false; };
  }, [v, f]);

  useEffect(() => {
    const keys = e => {
      if (e.key === 'Escape') setOv(null);
      if (!st || e.target.tagName === 'INPUT') return;
      if (e.key === '/') { e.preventDefault(); setOv('search'); }
      if (!ov && e.key === 'ArrowLeft') step(-1);
      if (!ov && e.key === 'ArrowRight') step(1);
    };
    addEventListener('keydown', keys);
    return () => removeEventListener('keydown', keys);
  });

  if (!st) return <Loader gone={false} />;

  const mode = m => { if (m === st.mode) { scrollTo({ top: 0, behavior: 'smooth' }); return; } go({ ...st, mode: m }, MODES.indexOf(m) > MODES.indexOf(st.mode) ? 'right' : 'left'); };
  const step = d => {
    if (STATIC(st.mode)) return;
    if (st.mode === 'season') { const n = Math.min(meta.seasons.length - 1, Math.max(0, st.si - d)); if (n !== st.si) go({ ...st, si: n }, d > 0 ? 'right' : 'left'); return; }
    go({ ...st, date: addDays(st.date, (st.mode === 'week' ? 7 : 1) * d) }, d > 0 ? 'right' : 'left');
  };
  const setStat = k => { if (k !== st.stat) setSt({ ...st, stat: k }); };
  const toDate = d => { setOv(null); go({ ...st, mode: 'day', date: parse(d) }, 'up'); scrollTo({ top: 0 }); };
  const toSeason = label => { const si = meta.seasons.indexOf(label); if (si < 0) return; setOv(null); go({ ...st, mode: 'season', si }, 'up'); scrollTo({ top: 0 }); };
  const open = (c, rank) => { setSel({ c, rank }); setOv('card'); };
  const openPlayer = c => { if (!c.key) return; playerName.current = c.n || c.name || ''; setPlayerKey(c.key); setOv('player'); };
  const pickGame = g => { setGame(g); setOv(null); };
  const collect = (c, e) => {
    const snap = { k: c.k, n: c.n, key: c.key, espnId: c.espnId, team: c.team, img: c.img, v: c.v, f: c.f, stat: c.stat, kind: c.kind,
      rarity: c.rarity, period: c.period, date: c.date, scope: c.scope, label: c.label, week: c.week };
    const added = book.toggle(snap);
    if (added) {
      const r = e.currentTarget.getBoundingClientRect();
      setBurst({ id: Date.now(), x: r.left + r.width / 2, y: r.top + r.height / 2, rarity: c.rarity });
      setTimeout(() => setBurst(null), 950);
    }
    setToast({ id: Date.now(), text: added ? `${c.rarity.toUpperCase()} CARD COLLECTED` : 'REMOVED FROM YOUR BOOK', rarity: c.rarity });
    setTimeout(() => setToast(t => (t && Date.now() - t.id > 1800 ? null : t)), 2000);
  };
  const openFromBook = c => {
    if (c.kind === 'game' && c.date) toDate(c.date);
    else if (c.scope === 'season' && c.label) toSeason(c.label);
    else if (c.scope === 'week' && c.week) go({ ...st, mode: 'week', date: parse(c.week), stat: c.stat }, 'up');
  };
  const story = s => {
    if (s.game) { setGame(s.game); return; }
    if (s.stat) setStat(s.stat);
    const c = api.cardsFor(v, s.stat || st.stat).find(x => x.key === s.line.key);
    if (c) setTimeout(() => open(c, api.cardsFor(v, s.stat || st.stat).indexOf(c)), 60);
  };
  const isBook = STATIC(st.mode);
  const toPro = () => { setOv(null); go({ ...st, mode: 'pro' }, 'up'); };
  const exportCSV = () => downloadCSV(`totalnba-${st.mode}-${STAT_NAME[st.stat]}-${st.mode === 'season' ? meta.seasons[st.si] : key(st.date)}`, CSV_COLS, cards.map(c => c.line));
  const label = periodLabel({ ...st, season: st.mode === 'season', week: st.mode === 'week' }, meta.seasons, true);
  const empty = st.mode === 'season' ? 'No season data yet' : st.mode === 'week' ? 'No games this week' : 'No games on this day';
  const gameName = game && v?.games?.find(g => g._id === game);

  return (
    <>
      <div className="glow" key={glow} style={{ '--g': glow }} aria-hidden="true" />
      <Loader gone={booted} />
      <div id="app" className={booted ? 'on' : ''}>
        <div className={'sticky' + (mini ? ' min' : '')}>
          <header className="top">
            <button className="brand" onClick={() => mode('day')} aria-label="TotalNBA home">TOTAL<b>NBA</b></button>
            <nav className="seg" style={{ '--k': MODES.indexOf(st.mode) }} role="tablist">
              <i />
              {TABS.map(([m, t]) => (
                <button key={m} role="tab" aria-selected={st.mode === m} className={st.mode === m ? 'a' : ''} onClick={() => mode(m)}>
                  {t}
                </button>
              ))}
            </nav>
            <div className="acts">
              <button className="icon" aria-label="Search players (/)" onClick={() => setOv('search')}>{I.search}</button>
              <button className={'icon' + (st.mode === 'saved' ? ' on' : '')} aria-label={`Saved cards (${book.cards.length})`} onClick={() => mode('saved')}>{I.book}{book.cards.length ? <sup className="cnt">{book.cards.length}</sup> : null}</button>
              {!isBook && <button className="icon hot" aria-label={`Create Top 10 graphic for ${LONG[st.stat]}`} onClick={() => { setGraphic({ id: Date.now(), ctx: { ...st } }); setOv('graphic'); }}>{I.image}</button>}
            </div>
          </header>
          {!isBook && (
            <div className="controls">
              <div className="period">
                <button className="icon" aria-label="Previous" onClick={() => step(-1)}>{I.left}</button>
                <button className="plabel" onClick={() => setOv(st.mode === 'season' ? 'season' : 'cal')}>
                  <small>{st.mode === 'season' ? 'SEASON' : st.mode === 'week' ? 'WEEK' : 'GAME DAY'}</small>
                  <span key={label}>{label}</span>
                </button>
                <button className="icon" aria-label="Next" onClick={() => step(1)}>{I.right}</button>
              </div>
              <StatChips stat={st.stat} leaders={leaders} onStat={setStat} />
            </div>
          )}
        </div>

        <main key={ver + (isBook ? '-b' : '')} className={'view from-' + dir}>
          {st.mode === 'records' ? <Records stat={st.stat} onStat={setStat} onDate={toDate} onPlayer={openPlayer} pro={pro} onPro={toPro} />
            : st.mode === 'pro' ? <ProPage pro={pro} />
              : st.mode === 'privacy' ? <Privacy />
                : isBook ? <Book book={book} onOpen={openFromBook} />
            : loading ? <Skeleton />
              : (
                <>
                  {st.mode === 'day' && <Games games={v?.games || []} game={game} onGame={g => setGame(g)} otd={otd} onOtd={() => otd && toDate(otd.date)} f={f} />}
                  <div className="headline">
                    <h1><span key={st.stat}>{LONG[st.stat]}</span></h1>
                    <p>
                      {gameName ? `${gameName.away} at ${gameName.home} · ` : ''}
                      {cards.length} player{cards.length === 1 ? '' : 's'}
                      {st.mode === 'season' ? ' · regular-season totals' : st.mode === 'week' ? ' · weekly totals' : ''}
                      {v?.extra?.loaded ? ` · through ${v.extra.loaded}` : ''}
                      {game && <button className="clear" onClick={() => setGame(null)}>ALL GAMES ✕</button>}
                      {cards.length > 0 && <button className="clear csvb" onClick={pro.pro ? exportCSV : toPro}>{pro.pro ? 'CSV ↓' : 'CSV · PRO'}</button>}
                    </p>
                  </div>
                  {cards.length ? (
                    <>
                      <Podium key={st.stat + game} cards={cards.slice(0, 3)} stat={st.stat} onOpen={open} />
                      {tales.length > 0 && <Stories items={tales} onStory={story} />}
                      <Ad pro={pro.pro} className="in-feed" />
                      <Board cards={cards} stat={st.stat} onOpen={open} flipKey={ver + '|' + game} book={book} />
                    </>
                  ) : <div className="empty"><span className="ball big" /><b>{empty}</b><p>Try the arrows or pick another date.</p></div>}
                  {cards.length > 20 && <Ad pro={pro.pro} />}
                  {err || lastCrash ? <p className="foot">{err || lastCrash}</p> : null}
                </>
              )}
          {err && !loading && !isBook && !v && <div className="empty"><b>{err}</b></div>}
        </main>

        <footer className="site-foot">
          <div className="sf-brand">TOTAL<b>NBA</b><small>Every NBA player, every night, since 1993–94.</small></div>
          <nav>
            <a href="/records" onClick={e => { e.preventDefault(); mode('records'); }}>All-time records</a>
            <a href="/pro" onClick={e => { e.preventDefault(); mode('pro'); }}>TotalNBA Pro</a>
            <a href="/saved" onClick={e => { e.preventDefault(); mode('saved'); }}>Saved cards</a>
            <a href="/privacy" onClick={e => { e.preventDefault(); mode('privacy'); }}>Privacy</a>
          </nav>
          <small>Box scores from ESPN’s public NBA data{v?.pulled ? ' · just pulled live' : ''}. Not affiliated with the NBA or ESPN.</small>
        </footer>

        <nav className="tabbar" role="tablist">
          {TABS.map(([m, t]) => (
            <button key={m} role="tab" aria-selected={st.mode === m} className={st.mode === m ? 'a' : ''} onClick={() => mode(m)}>
              <span className="ti">{I[m]}</span>
              <small>{t}</small>
            </button>
          ))}
        </nav>
      </div>

      <Sheet open={ov === 'card' && !!sel} onClose={() => setOv(null)} className="s-card" label="Player card">
        {sel && <CardSheet c={sel.c} rank={sel.rank} stat={st.stat} collected={book.has(sel.c.k)} onCollect={collect} onPlayer={openPlayer}
          onStat={k => { setStat(k); setSel(s => ({ ...s, c: { ...s.c, v: s.c.line[STATS[k]] ?? 0, f: STATS[k], stat: k } })); }}
          onGame={st.mode === 'day' ? pickGame : null} />}
      </Sheet>
      <Sheet open={ov === 'player' && !!playerKey} onClose={() => setOv(null)} className="s-player" label="Player page">
        {playerKey && <PlayerSheet key={playerKey} pkey={playerKey} stat={st.stat === 'FANTASY' ? 'POINTS' : st.stat} onClose={() => setOv(null)} onDate={toDate} onSeason={toSeason} pro={pro} onPro={toPro} />}
      </Sheet>
      <Sheet open={ov === 'search'} onClose={() => setOv(null)} className="s-search" label="Search players">
        <SearchSheet onPick={(k, name) => { playerName.current = name || ''; setPlayerKey(k); setOv('player'); }} />
      </Sheet>
      <Sheet open={ov === 'cal'} onClose={() => setOv(null)} className="s-small" label="Pick a date">
        <Calendar key={key(st.date)} date={st.date} has={meta.has} onPick={d => { setOv(null); if (key(d) !== key(st.date)) go({ ...st, date: d }, d > st.date ? 'right' : 'left'); }} />
      </Sheet>
      <Sheet open={ov === 'season'} onClose={() => setOv(null)} className="s-small" label="Pick a season">
        <ListSheet title="CHOOSE A SEASON" current={st.si} onPick={i => { setOv(null); if (i !== st.si) go({ ...st, si: i }, i < st.si ? 'right' : 'left'); }}
          items={meta.seasons.map((x, i) => ({ key: i, label: seasonName(x), sub: i === 0 ? 'LATEST' : null }))} />
      </Sheet>
      <Sheet open={ov === 'graphic' && !!graphic} onClose={() => setOv(null)} className="s-graphic" label="Top 10 graphic">
        {graphic && <GraphicModal key={graphic.id} ctx={graphic.ctx} meta={meta} onClose={() => setOv(null)} />}
      </Sheet>

      <Burst b={burst} />
      {toast && <div className={'toast ' + toast.rarity} key={toast.id} role="status">★ {toast.text}</div>}
    </>
  );
}
