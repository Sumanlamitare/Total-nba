import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { STATS, LONG, key, parse, addDays, dstr, seasonName, periodLabel } from './util.js';
import useBook from './useBook.js';
import Loader from './components/Loader.jsx';
import Slide, { Empty } from './components/Slide.jsx';
import Calendar from './components/Calendar.jsx';
import { Icon, Search } from './components/Icons.jsx';
import GraphicModal from './components/GraphicModal.jsx';
import ListSheet from './components/ListSheet.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import PlayerSheet from './components/PlayerSheet.jsx';
import SearchSheet from './components/SearchSheet.jsx';
import Book from './components/Book.jsx';

// Only the cards around the current one are rendered in full; the rest are empty placeholders that keep
// the scroll width. Hundreds of full cards (photos, foil, animations) crash mobile Safari.
const NEAR = 3;
const BURST = { common: '#cfc6b5', rare: '#7cc4ff', epic: '#c08bff', legendary: '#e3c48c' };

// a little firework where you tapped Collect
function Burst({ b }) {
  if (!b) return null;
  return (
    <div className="burst" style={{ left: b.x, top: b.y, '--c': BURST[b.rarity] }} key={b.id} aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--a': `${i * 22.5}deg`, '--d': `${40 + (i % 3) * 18}px` }} />)}
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState({ seasons: [], dates: [], has: new Set() });
  const [stage, setStage] = useState(0);
  const [st, setSt] = useState(null);       // selection in the header
  const [view, setView] = useState(null);   // selection the cards currently show
  const [data, setData] = useState([]);
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null);   // scoreboard filter (game id) in the day view
  const [otd, setOtd] = useState(null);     // "on this day" line
  const [ver, setVer] = useState(0);
  const [pos, setPos] = useState(0);
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [graphic, setGraphic] = useState(null); // { id, ctx } — the selection captured when Create Graphic was tapped
  const [playerKey, setPlayerKey] = useState(null);
  const [toast, setToast] = useState(null);
  const [burst, setBurst] = useState(null);
  const pan = useRef(null), posR = useRef(0), lenR = useRef(1), lastOv = useRef(null);
  const book = useBook();
  const rows = game ? data.filter(c => c.gameId === game) : data;
  lenR.current = Math.max(1, rows.length);

  const [status, setStatus] = useState(null); // result of the last load (was it pulled live?)
  const load = async (s, m) => {
    setErr('');
    if (s.book) return { rows: [] };
    try { const r = await api.build(s, m); setStatus(r); return r; }
    catch (e) { setErr('Could not load data (' + e.message + ')'); setStatus(null); return { rows: [] }; }
  };
  const show = (nx, r) => {
    setView(nx); setData(r.rows); setGames(r.games || []); setGame(null); setOtd(null); setVer(v => v + 1);
  };

  // boot: load meta, show the latest game day
  useEffect(() => {
    const t0 = Date.now();
    (async () => {
      const m = await api.getMeta().catch(e => { setErr('Server unreachable (' + e.message + ')'); return { dates: [], seasons: [] }; });
      m.has = new Set(m.dates);
      setMeta(m);
      const s = { season: false, week: false, book: false, stat: 'POINTS', si: 0, date: m.dates.length ? parse(m.dates.at(-1)) : new Date() };
      const r = await load(s, m);
      setSt(s); setView(s); setData(r.rows); setGames(r.games || []);
      setTimeout(() => setStage(1), Math.max(0, 3200 - (Date.now() - t0)));
      setTimeout(() => setStage(2), Math.max(0, 4000 - (Date.now() - t0)));
    })();
  }, []);

  // on this day: best line on the same calendar date in another season (day view only)
  useEffect(() => {
    if (!view || view.season || view.week || view.book) return;
    let alive = true;
    api.onThisDay(view.date, STATS[view.stat]).then(l => alive && setOtd(l?.[0] || null)).catch(() => {});
    return () => { alive = false; };
  }, [view]);

  // scene change: current gallery lifts away, the new one rises in
  const change = patch => {
    const nx = { ...st, ...patch }, el = pan.current;
    setSt(nx);
    if (el) { el.style.transition = 'opacity .45s,transform .45s,filter .45s'; el.style.opacity = 0; el.style.transform = 'translateY(-26px)'; el.style.filter = 'blur(6px)'; }
    setLoading(!nx.book);
    Promise.all([load(nx, meta), new Promise(r => setTimeout(r, 480))]).then(([r]) => {
      setLoading(false); show(nx, r);
      if (r.rows.length && !nx.season && !nx.week && !nx.book && !meta.has.has(key(nx.date))) setMeta(m => ({ ...m, has: new Set([...m.has, key(nx.date)]) }));
    });
  };
  useEffect(() => {
    if (!ver) return;
    const el = pan.current;
    if (!el) return;
    el.scrollLeft = 0; posR.current = 0; setPos(0); styled.current = new Set();
    el.style.transition = 'none'; el.style.transform = 'translateY(26px)'; void el.offsetWidth;
    el.style.transition = 'opacity .8s,transform .9s cubic-bezier(.2,.7,.2,1),filter .8s';
    el.style.opacity = 1; el.style.transform = 'none'; el.style.filter = 'none';
    requestAnimationFrame(() => fx());
  }, [ver]);

  // gallery: neighbours scale/dim by distance from centre. With hundreds of cards, only the few
  // around the current one are measured and styled.
  const styled = useRef(new Set());
  const goT = useRef(null); // target of the last arrow tap, so quick taps aren't lost mid-scroll
  const fx = useCallback(() => {
    const el = pan.current;
    if (!el || !el.children.length) return;
    const first = el.children[0], step = (el.children[1]?.offsetLeft ?? first.offsetLeft + first.offsetWidth) - first.offsetLeft || 1;
    const best = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollLeft / step)));
    const c = el.getBoundingClientRect(), near = new Set();
    for (let i = Math.max(0, best - 2); i <= Math.min(el.children.length - 1, best + 2); i++) {
      const e = el.children[i], r = e.getBoundingClientRect();
      const d = Math.min(1, Math.abs(r.left + r.width / 2 - c.left - c.width / 2) / r.width);
      e.style.transform = `scale(${1 - 0.06 * d})`; e.style.opacity = 1 - 0.6 * d;
      near.add(e);
    }
    for (const e of styled.current) if (!near.has(e)) { e.style.transform = 'scale(.94)'; e.style.opacity = .4; }
    styled.current = near;
    if (goT.current && Date.now() < goT.current.until) return; // a tap's smooth scroll is still on its way
    posR.current = best; setPos(best);
  }, []);
  useEffect(() => { if (stage >= 2) fx(); }, [stage, ver]);
  const go = i => {
    const el = pan.current;
    if (!el || i < 0 || i >= lenR.current || !el.children[i]) return;
    goT.current = { i, until: Date.now() + 700 };
    posR.current = i; setPos(i);
    el.children[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const wheel = e => { if (e.target.closest?.('.cl')) return; if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollBy({ left: e.deltaY * 1.3 }); } };
    const keys = e => {
      if (e.key === 'Escape') setOv(null);
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') go(posR.current + 1);
      if (e.key === 'ArrowLeft') go(posR.current - 1);
      if (e.key === '/') { e.preventDefault(); setOv('search'); }
    };
    el.addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', keys);
    return () => { el.removeEventListener('wheel', wheel); removeEventListener('keydown', keys); };
  }, [!st, st?.book]);

  if (!st) return <Loader gone={false} />;

  // daily arrows step one day; a date that isn't stored yet is pulled live
  const step = d => {
    if (st.season) { const n = Math.min(meta.seasons.length - 1, Math.max(0, st.si - d)); if (n !== st.si) change({ si: n }); return; }
    if (st.week) { change({ date: addDays(st.date, 7 * d) }); return; }
    change({ date: addDays(st.date, d) });
  };
  if (ov) lastOv.current = ov;
  const shown = ov || lastOv.current;
  const pick = (k, v) => {
    setOv(null);
    if (k === 'date' ? key(v) === key(st.date) : v === st[k]) return;
    change({ [k]: v });
  };
  const mode = m => change({ season: m === 'season', week: m === 'week', book: m === 'book' });
  const toDate = d => { setOv(null); change({ season: false, week: false, book: false, date: parse(d) }); };
  const toSeason = label => { const si = meta.seasons.indexOf(label); if (si < 0) return; setOv(null); change({ season: true, week: false, book: false, si }); };
  const openPlayer = c => { if (!c.key) return; setPlayerKey(c.key); setOv('player'); };
  const pickGame = g => { setGame(g); setVer(v => v + 1); };

  const collect = (c, e) => {
    const snap = { k: c.k, n: c.n, key: c.key, img: c.img, v: c.v, f: c.f, stat: c.stat, kind: c.kind, rarity: c.rarity,
      period: c.period, date: c.date, scope: c.scope, label: c.label, week: c.week };
    const added = book.toggle(snap);
    if (added) {
      const r = e.currentTarget.getBoundingClientRect();
      setBurst({ id: Date.now(), x: r.left + r.width / 2, y: r.top + r.height / 2, rarity: c.rarity });
      setTimeout(() => setBurst(null), 900);
    }
    setToast({ id: Date.now(), text: added ? `${c.rarity.toUpperCase()} CARD COLLECTED` : 'REMOVED FROM YOUR BOOK', rarity: c.rarity });
    setTimeout(() => setToast(t => (t && Date.now() - t.id > 1800 ? null : t)), 2000);
  };
  const openFromBook = c => {
    if (c.kind === 'game' && c.date) toDate(c.date);
    else if (c.scope === 'season' && c.label) toSeason(c.label);
    else if (c.scope === 'week' && c.week) change({ season: false, week: true, book: false, date: parse(c.week), stat: c.stat });
  };

  let overlay = null;
  if (shown === 'stat') overlay = (
    <ListSheet title="CHOOSE A STAT" current={st.stat} onPick={v => pick('stat', v)}
      items={Object.keys(STATS).map(k => ({ key: k, label: k, sub: LONG[k] !== k[0] + k.slice(1).toLowerCase() ? LONG[k] : null }))} />
  );
  else if (shown === 'season') overlay = (
    <ListSheet title="CHOOSE A SEASON" current={st.si} onPick={i => pick('si', i)}
      items={meta.seasons.map((x, i) => ({ key: i, label: seasonName(x), sub: i === 0 ? 'LATEST' : null }))} />
  );
  else if (shown === 'cal') overlay = <Calendar key={key(st.date)} date={st.date} has={meta.has} onPick={d => pick('date', d)} />;
  else if (shown === 'graphic' && graphic) overlay = <GraphicModal key={graphic.id} ctx={graphic.ctx} meta={meta} onClose={() => setOv(null)} />;
  else if (shown === 'player' && playerKey) overlay = <PlayerSheet key={playerKey} pkey={playerKey} stat={st.stat} onClose={() => setOv(null)} onDate={toDate} onSeason={toSeason} />;
  else if (shown === 'search') overlay = <SearchSheet key={ov === 'search' ? 'open' : 'closed'} onPick={k => { setPlayerKey(k); setOv('player'); }} />;
  // Create Graphic always uses the selection on screen: mode, stat, date / season
  const createGraphic = () => { setGraphic({ id: Date.now(), ctx: { ...st } }); setOv('graphic'); };
  const emptyMsg = view.week ? 'NO GAMES THIS WEEK' : view.season ? 'NO SEASON DATA' : 'NONE ON ' + dstr(view.date).toUpperCase();
  const tab = st.book ? 3 : st.season ? 2 : st.week ? 1 : 0;
  const dayView = !view.season && !view.week && !view.book;

  return (
    <>
      <Loader gone={stage >= 1} />
      <div id="app" className={(stage >= 1 ? 'on ' : '') + (st.book ? 'is-book' : '')}>
        <header>
          <div className="brand" aria-hidden="true">TOTAL<b>NBA</b></div>
          <div className="tg" style={{ '--k': tab }} role="tablist">
            <b />
            <button role="tab" aria-selected={tab === 0} className={tab === 0 ? 'a' : ''} onClick={() => mode('day')}>DAY</button>
            <button role="tab" aria-selected={tab === 1} className={tab === 1 ? 'a' : ''} onClick={() => mode('week')}>WEEK</button>
            <button role="tab" aria-selected={tab === 2} className={tab === 2 ? 'a' : ''} onClick={() => mode('season')}>SEASON</button>
            <button role="tab" aria-selected={tab === 3} className={tab === 3 ? 'a' : ''} onClick={() => mode('book')}>BOOK{book.cards.length ? <sup>{book.cards.length}</sup> : null}</button>
          </div>
          {!st.book && <button className="stat" onClick={() => setOv('stat')} aria-label={'Stat: ' + LONG[st.stat]}>{st.stat}<span className="chev">⌄</span></button>}
          {!st.book && (
            <div className="per">
              <button className="ib" aria-label="Previous" onClick={() => step(-1)}><Icon d="M15 5l-7 7 7 7" /></button>
              <button className="lbl" onClick={() => setOv(st.season ? 'season' : 'cal')}>
                <span className="full">{periodLabel(st, meta.seasons)}</span><span className="short">{periodLabel(st, meta.seasons, true)}</span>
              </button>
              <button className="ib" aria-label="Next" onClick={() => step(1)}><Icon d="M9 5l7 7-7 7" /></button>
            </div>
          )}
          <div className="tools">
            <button className="ib srch" aria-label="Search players (/)" onClick={() => setOv('search')}><Search /></button>
            {!st.book && (
              <button className="cg" onClick={createGraphic} aria-label={`Create Top 10 graphic for ${LONG[st.stat]}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 15l3-3 3 3 4-5" /></svg>
                <span>CREATE<span className="long"> GRAPHIC</span></span>
              </button>
            )}
          </div>
        </header>
        {dayView && !st.book && <Scoreboard games={games} game={game} onGame={pickGame} otd={otd} onOtd={() => otd && toDate(otd.date)} f={STATS[view.stat]} count={data.length} />}
        <div id="wrap">
          {st.book
            ? <Book book={book} onOpen={openFromBook} />
            : (
              <div id="panel" ref={pan} className={stage >= 1 ? 'on' : ''} onScroll={fx}>
                {stage >= 2 && (rows.length
                  ? rows.map((c, i) => (Math.abs(i - pos) <= NEAR
                    ? <Slide key={ver + '-' + c.k} c={c} i={i} book={book} onPlayer={openPlayer} onCollect={collect} />
                    : <div key={ver + '-' + c.k} className="slide ghost" aria-hidden="true" />))
                  : <Empty key={ver} msg={emptyMsg} />)}
              </div>
            )}
        </div>
        {!st.book && (
          <footer>
            <button className="ib" aria-label="Previous player" onClick={() => go(pos - 1)}><Icon d="M19 12H5m6-6l-6 6 6 6" /></button>
            {rows.length > 12
              ? (
                <div className="scrub">
                  <span className="count"><b>{pos + 1}</b> / {rows.length}</span>
                  <input type="range" min="1" max={rows.length} value={pos + 1} aria-label="Jump to player"
                    onChange={e => { const i = +e.target.value - 1; posR.current = i; setPos(i); pan.current.children[i]?.scrollIntoView({ inline: 'center', block: 'nearest' }); }} />
                </div>
              )
              : <span className="dots">{Array.from({ length: Math.max(1, rows.length) }, (_, i) => <span key={i} className={'dot' + (i === pos ? ' a' : '')} onClick={() => go(i)} />)}</span>}
            <button className="ib" aria-label="Next player" onClick={() => go(pos + 1)}><Icon d="M5 12h14m-6-6l6 6-6 6" /></button>
          </footer>
        )}
        <div id="note">{err || (loading ? 'Loading… pulling from ESPN if this date isn’t saved yet'
          : 'TotalNBA · ESPN data' + (status?.pulled ? ' · just pulled live' : '') + ' · press / to search')}</div>
      </div>
      <div id="ov" className={ov ? 'on' : ''} onClick={() => setOv(null)}>{overlay}</div>
      <Burst b={burst} />
      {toast && <div className={'toast ' + toast.rarity} key={toast.id} role="status">★ {toast.text}</div>}
    </>
  );
}
