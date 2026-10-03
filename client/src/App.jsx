import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { STATS, key, parse, addDays, dstr, seasonName, periodLabel } from './util.js';
import useReactions from './useReactions.js';
import Loader from './components/Loader.jsx';
import Slide, { Empty } from './components/Slide.jsx';
import Calendar from './components/Calendar.jsx';
import { Icon } from './components/Icons.jsx';

export default function App() {
  const [meta, setMeta] = useState({ seasons: [], dates: [], has: new Set() });
  const [stage, setStage] = useState(0);
  const [st, setSt] = useState(null);       // selection in the header
  const [view, setView] = useState(null);   // selection the slides currently show
  const [data, setData] = useState([]);
  const [ver, setVer] = useState(0);
  const [pos, setPos] = useState(0);
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const pan = useRef(null), posR = useRef(0), lenR = useRef(1), lastOv = useRef(null);
  const rx = useReactions();
  lenR.current = Math.max(1, data.length);

  const [status, setStatus] = useState(null); // result of the last load: live pull / quota info
  const load = async (s, m) => {
    setErr('');
    try { const r = await api.build(s, m, rx.votes); setStatus(r); return r.rows; }
    catch (e) { setErr('Could not load data (' + e.message + ')'); setStatus(null); return []; }
  };

  // boot: load meta, show the latest game day
  useEffect(() => {
    const t0 = Date.now();
    (async () => {
      const [m] = await Promise.all([api.getMeta().catch(e => { setErr('Server unreachable (' + e.message + ')'); return { dates: [], seasons: [] }; }), api.loadPhotos()]);
      m.has = new Set(m.dates);
      setMeta(m);
      // open on the latest game day; while history is still loading with no days yet, open on season leaders
      const s = { season: false, week: false, stat: 'POINTS', si: 0, date: m.dates.length ? parse(m.dates.at(-1)) : new Date() };
      const rows = await load(s, m);
      setSt(s); setView(s); setData(rows);
      setTimeout(() => setStage(1), Math.max(0, 3500 - (Date.now() - t0)));
      setTimeout(() => setStage(2), Math.max(0, 4400 - (Date.now() - t0)));
    })();
  }, []);

  // scene change: current gallery lifts away, the new one rises in
  const change = patch => {
    const nx = { ...st, ...patch }, el = pan.current;
    setSt(nx);
    el.style.transition = 'opacity .45s,transform .45s,filter .45s';
    el.style.opacity = 0; el.style.transform = 'translateY(-26px)'; el.style.filter = 'blur(6px)';
    setLoading(true);
    Promise.all([load(nx, meta), new Promise(r => setTimeout(r, 480))]).then(([rows]) => {
      setLoading(false); setView(nx); setData(rows); setVer(v => v + 1);
      // remember newly pulled dates so the calendar lights them up
      if (rows.length && !nx.season && !nx.week && !meta.has.has(key(nx.date))) setMeta(m => ({ ...m, has: new Set([...m.has, key(nx.date)]) }));
      api.getMeta().then(m2 => setMeta(m => ({ ...m, quota: m2.quota }))).catch(() => {});
    });
  };
  useEffect(() => {
    if (!ver) return;
    const el = pan.current;
    el.scrollLeft = 0; posR.current = 0; setPos(0);
    el.style.transition = 'none'; el.style.transform = 'translateY(26px)'; void el.offsetWidth;
    el.style.transition = 'opacity .8s,transform .9s cubic-bezier(.2,.7,.2,1),filter .8s';
    el.style.opacity = 1; el.style.transform = 'none'; el.style.filter = 'none';
  }, [ver]);

  // gallery: neighbours scale/dim by distance from centre
  const fx = useCallback(() => {
    const el = pan.current;
    if (!el) return;
    const c = el.getBoundingClientRect();
    let best = 0, bd = 9;
    [...el.children].forEach((e, i) => {
      const r = e.getBoundingClientRect(), d = Math.min(1, Math.abs(r.left + r.width / 2 - c.left - c.width / 2) / r.width);
      e.style.transform = `scale(${1 - 0.06 * d})`; e.style.opacity = 1 - 0.6 * d;
      if (d < bd) { bd = d; best = i; }
    });
    posR.current = best; setPos(best);
  }, []);
  useEffect(() => { if (stage >= 2) fx(); }, [stage, ver]);
  const go = i => { const el = pan.current; if (i < 0 || i >= lenR.current || !el.children[i]) return; el.children[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const wheel = e => { if (e.target.closest?.('.cl')) return; if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollBy({ left: e.deltaY * 1.3 }); } };
    const keys = e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowRight') go(posR.current + 1); if (e.key === 'ArrowLeft') go(posR.current - 1); };
    el.addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', keys);
    return () => { el.removeEventListener('wheel', wheel); removeEventListener('keydown', keys); };
  }, [!st]);

  if (!st) return <Loader gone={false} />;

  // daily arrows step one day; a date that isn't stored yet is pulled live
  const step = d => {
    if (st.season) { const n = Math.min(meta.seasons.length - 1, Math.max(0, st.si - d)); if (n !== st.si) change({ si: n }); return; }
    if (st.week) { change({ date: addDays(st.date, 7 * d) }); return; }
    change({ date: addDays(st.date, d) });
  };
  if (ov) lastOv.current = ov;
  const shown = ov || lastOv.current;
  const pick = (k, v) => { setOv(null); if (k === 'date' ? key(v) !== key(st.date) : v !== st[k]) change({ [k]: v }); };
  const list = (items, cur, k) => items.map((x, i) => (
    <button key={x} className={i === cur ? 'a' : ''} onClick={e => { e.stopPropagation(); pick(k, k === 'si' ? i : x); }}>{k === 'si' ? seasonName(x) : x}</button>
  ));
  let overlay = null;
  if (shown === 'stat') overlay = list(Object.keys(STATS), Object.keys(STATS).indexOf(st.stat), 'stat');
  else if (shown === 'season') overlay = list(meta.seasons, st.si, 'si');
  else if (shown === 'cal') overlay = <Calendar key={key(st.date)} date={st.date} has={meta.has} onPick={d => pick('date', d)} />;
  const emptyMsg = status?.quotaReached ? 'DAILY API LIMIT REACHED — THIS LOADS AFTER MIDNIGHT UTC'
    : view.week ? 'NONE THIS WEEK' : view.season ? 'NO SEASON DATA' : 'NONE ON ' + dstr(view.date).toUpperCase();

  return (
    <>
      <Loader gone={stage >= 1} />
      <div id="app" className={stage >= 1 ? 'on' : ''}>
        <header>
          <div className="tg" style={{ '--k': st.week ? 2 : st.season ? 1 : 0 }}>
            <b />
            <button className={!st.season && !st.week ? 'a' : ''} onClick={() => change({ season: false, week: false })}>DAILY</button>
            <button className={st.season ? 'a' : ''} onClick={() => change({ season: true, week: false })}>SEASON</button>
            <button className={st.week ? 'a' : ''} onClick={() => change({ season: false, week: true })}>WEEK</button>
          </div>
          {st.week
            ? <div id="stat" className="wk">PERFORMANCE OF THE WEEK<small>RANKED BY YOUR LIKES</small></div>
            : <button id="stat" onClick={() => setOv('stat')}>{st.stat} ⌄</button>}
          <div className="per">
            <button onClick={() => step(-1)}><Icon d="M15 5l-7 7 7 7" /></button>
            <span style={{ cursor: 'pointer' }} onClick={() => setOv(st.season ? 'season' : 'cal')}>{periodLabel(st, meta.seasons)}</span>
            <button onClick={() => step(1)}><Icon d="M9 5l7 7-7 7" /></button>
          </div>
        </header>
        <div id="wrap">
          <div id="panel" ref={pan} className={stage >= 1 ? 'on' : ''} onScroll={fx}>
            {stage >= 2 && (data.length
              ? data.map((r, i) => <Slide key={ver + '-' + i} r={r} i={i} season={view.season} rx={rx} />)
              : <Empty key={ver} msg={emptyMsg} />)}
          </div>
        </div>
        <footer>
          <button onClick={() => go(pos - 1)}><Icon d="M19 12H5m6-6l-6 6 6 6" /></button>
          <span>{Array.from({ length: Math.max(1, data.length) }, (_, i) => <span key={i} className={'dot' + (i === pos ? ' a' : '')} onClick={() => go(i)} />)}</span>
          <button onClick={() => go(pos + 1)}><Icon d="M5 12h14m-6-6l6 6-6 6" /></button>
        </footer>
      </div>
      <div id="ov" className={ov ? 'on' : ''} onClick={() => setOv(null)}>{overlay}</div>
      <div id="note">{err || (loading ? 'Loading… pulling from Big Balls if this date isn’t saved yet'
        : 'TotalNBA · Big Balls Data' + (status?.pulled ? ` · just pulled (${status.pulled} requests)` : '') + (meta.quota ? ` · API ${meta.quota.used}/${meta.quota.cap} today` : ''))}</div>
    </>
  );
}
