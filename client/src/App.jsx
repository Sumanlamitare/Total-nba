// Overlap: automatic NBA statistical Venn diagrams — every night once the games are final, and for the season.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getHome, getSeasons, getAutoDiagram, getDiagram, getHistory, getSettings, saveSettings, getConfigs, refreshDate, forget, getDataset, longDay, shortDay, ago, isoDay, encodeState, decodeState } from './api.js';
import { Studio, Diagram, CriteriaEditor, withIds, labeled, describePeriod } from './studio.jsx';
import { DEFAULT_STYLE } from '../../lib/venn/render.js';
import { evaluate } from '../../lib/engine.js';

// ---- Routing --------------------------------------------------------------------------------------------------------
function parseRoute() {
  const p = location.pathname, q = new URLSearchParams(location.search);
  let m;
  if ((m = p.match(/^\/daily\/(\d{8})\/?$/))) return { page: 'daily', date: m[1] };
  if (/^\/daily\/?$/.test(p)) return { page: 'daily', date: null };
  if (/^\/season\/?$/.test(p)) return { page: 'season', season: +q.get('season') || null, stype: q.get('stype') || 'regular' };
  if (/^\/history\/?$/.test(p)) return { page: 'history' };
  if (/^\/compare\/?$/.test(p)) return { page: 'compare', a: q.get('a'), b: q.get('b') };
  if (/^\/custom\/?$/.test(p)) return { page: 'custom', c: q.get('c') };
  if ((m = p.match(/^\/d\/([\w-]+)\/?$/))) return { page: 'saved', id: m[1], edit: q.has('edit') };
  if (/^\/settings\/?$/.test(p)) return { page: 'settings' };
  return { page: 'home' };
}
function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => { const on = () => setRoute(parseRoute()); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  const go = useCallback((path, { replace = false } = {}) => {
    if (path !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(parseRoute()); scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
const Link = ({ to, go, children, ...rest }) => <a href={to} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>;
// Icons for the phone's bottom tab bar (hidden on wider screens).
const ICONS = {
  home: <><circle cx="9" cy="10" r="5.5" /><circle cx="15" cy="10" r="5.5" /><circle cx="12" cy="15" r="5.5" /></>,
  daily: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  season: <path d="M4 19V11M10 19V5M16 19v-6M22 19H2" />,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  custom: <path d="M5 7h9M18 7h1M5 17h3M12 17h7M16 4.5v5M10 14.5v5" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
};
const TabIcon = ({ page }) => <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[page]}</svg>;
const Logo = () => <svg className="logo" viewBox="0 0 44 36" aria-hidden><circle cx="14" cy="14" r="11" /><circle cx="28" cy="14" r="11" /><circle cx="21" cy="24" r="11" /></svg>;

// ---- Facts above a diagram -------------------------------------------------------------------------------------------
function facts(kind, config) {
  return (result, meta) => {
    const items = [
      ['Date', config.mode === 'daily' ? shortDay(config.date) : meta?.through ? `Through ${shortDay(meta.through)}` : '—'],
      ['Period', config.mode === 'daily' ? 'Single night' : describePeriod(config)],
      ['Players', result ? result.total : '…'],
      ['Criteria', config.criteria?.length || 0],
      ['Updated', meta?.updated ? ago(meta.updated) : '—'],
    ];
    const left = (meta?.excluded || []).reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
    const leftText = Object.entries(left).map(([k, n]) => `${n} ${k}`).join(', ');
    if (config.mode === 'daily') items.push(['Games', meta ? (meta.noGames ? 'No games' : meta.complete ? `All ${meta.final} final${leftText ? ` (${leftText})` : ''}` : `${meta.final} of ${meta.games} final`) : '—']);
    return <>{items.map(([k, v]) => <div key={k} className={`fact${k === 'Games' && meta && !meta.complete && !meta.noGames ? ' pending' : ''}`}><span>{k}</span><b>{v}</b></div>)}{kind && <div className="fact kind"><span>Diagram</span><b>{kind}</b></div>}</>;
  };
}

// ---- Home: the latest automatic diagram ------------------------------------------------------------------------------
function Home({ go }) {
  const [home, setHome] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { getHome().then(setHome).catch(setErr); }, []);
  if (err) return <ErrorBox err={err} />;
  if (!home) return <Loading />;
  const today = home.days.find(x => x.date === home.today);
  const d = home.daily;
  return (
    <>
      <StatusBar day={today} />
      {d ? (
        <Studio key={d._id} initial={{ config: d.config, style: { ...DEFAULT_STYLE, ...d.style } }} stored={d} title={d.title} subtitle={`Daily diagram · ${d.config.criteria.map(c => c.label).join(' · ')}`}
          facts={facts(d.version > 1 ? `Automatic · corrected (v${d.version})` : 'Automatic', d.config)} actions={<Link className="btn ghost" to={`/daily/${d.date}`} go={go}>Other nights</Link>} />
      ) : <div className="empty"><h2>No diagram yet</h2><p>The first daily diagram appears after the next night of games is final.</p></div>}
      {home.season && (
        <section className="second">
          <h2>Season to date</h2>
          <Studio key={home.season._id} initial={{ config: home.season.config, style: { ...DEFAULT_STYLE, ...home.season.style } }} stored={home.season} title={home.season.title} subtitle={`${home.season.period} · ${home.season.config.criteria.map(c => c.label).join(' · ')}`}
            facts={facts('Automatic', home.season.config)} actions={<Link className="btn ghost" to={`/season?season=${home.season.season}&stype=${home.season.config.stype}`} go={go}>Season view</Link>} />
        </section>
      )}
    </>
  );
}

function StatusBar({ day }) {
  if (!day) return null;
  const text = day.noGames ? 'No NBA games today.' : day.complete ? `Tonight's ${day.final} games are final — the diagram is published.` : `Tonight: ${day.final} of ${day.games} games final. The diagram publishes when every game is final.`;
  return <div className={`status${day.complete || day.noGames ? '' : ' live'}`}><span className="dot" />{text}<span className="muted"> Checked {ago(day.checkedAt)}.</span></div>;
}

// ---- A night ----------------------------------------------------------------------------------------------------------
function Daily({ date, go }) {
  const [seasons, setSeasons] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => { getSeasons().then(s => setSeasons(s)).catch(() => setSeasons({ seasons: [] })); }, []);
  const dates = useMemo(() => (seasons?.seasons || []).flatMap(s => s.dates).sort(), [seasons]);
  const today = seasons?.today;
  const cur = date || dates.filter(x => x <= (today || '99999999')).pop();
  useEffect(() => { if (!date && cur) go(`/daily/${cur}`, { replace: true }); }, [date, cur, go]);
  useEffect(() => {
    if (!cur) return;
    let alive = true; setState(null);
    Promise.all([getAutoDiagram('daily', cur).catch(e => (e.status === 404 ? null : Promise.reject(e))), getSettings()])
      .then(([r, s]) => alive && setState({ doc: r?.diagram || null, versions: r?.versions || [], settings: s })).catch(e => alive && setState({ error: e }));
    return () => { alive = false; };
  }, [cur, tick]);
  const i = dates.indexOf(cur), prev = i > 0 ? dates[i - 1] : null, next = i >= 0 && i < dates.length - 1 ? dates[i + 1] : null;
  const refresh = async () => { setBusy(true); setMsg(''); try { const r = await refreshDate(cur); forget('ds:'); setMsg(r.skipped || (r.day?.complete ? 'Checked: all games final.' : `Checked: ${r.day?.final || 0} of ${r.day?.games || 0} games final.`)); setTick(t => t + 1); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  const nav = (
    <div className="datebar">
      <button type="button" className="icon" disabled={!prev} onClick={() => go(`/daily/${prev}`)} aria-label="Previous game night">‹</button>
      <label className="day"><span>{cur ? longDay(cur) : '…'}</span><input type="date" value={cur ? isoDay(cur) : ''} onChange={e => { const d = e.target.value.replace(/-/g, ''); if (d) go(`/daily/${dates.filter(x => x <= d).pop() || d}`); }} aria-label="Pick a night" /></label>
      <button type="button" className="icon" disabled={!next || next > today} onClick={() => go(`/daily/${next}`)} aria-label="Next game night">›</button>
      <button type="button" className="btn ghost small" onClick={refresh} disabled={busy}>{busy ? 'Checking…' : 'Refresh'}</button>
      {msg && <span className="muted small">{msg}</span>}
    </div>
  );
  if (!cur) return <Loading />;
  if (!state) return <>{nav}<Loading /></>;
  if (state.error) return <>{nav}<ErrorBox err={state.error} /></>;
  const { doc, settings } = state;
  if (doc) return <>{nav}<Studio key={doc._id} initial={{ config: doc.config, style: { ...DEFAULT_STYLE, ...doc.style } }} stored={doc} title={doc.title} subtitle={`Daily diagram${doc.version > 1 ? ` · corrected after a stat change (version ${doc.version})` : ''}`} facts={facts('Automatic', doc.config)} /></>;
  // No published diagram: the night isn't final (or had no games). A preview from the verified games so far.
  const config = { mode: 'daily', date: cur, criteria: settings.daily.criteria };
  return <>{nav}<div className="diagram-note">This night's diagram isn't published: it appears once every game is final and verified. Below is a preview from the finished games so far.</div>
    <Studio key={`p${cur}${tick}`} initial={{ config, style: DEFAULT_STYLE }} title={longDay(cur)} subtitle="Preview — not final" facts={facts('Preview', config)} /></>;
}

// ---- Season -----------------------------------------------------------------------------------------------------------
function Season({ season, stype, go }) {
  const [seasons, setSeasons] = useState(null);
  const [settings, setSettings] = useState(null);
  useEffect(() => { getSeasons().then(setSeasons).catch(() => setSeasons({ seasons: [] })); getSettings().then(setSettings).catch(() => setSettings({ season: { criteria: [] } })); }, []);
  if (!seasons || !settings) return <Loading />;
  const year = season || seasons.seasons[0]?.year;
  if (!year) return <div className="empty"><h2>No season data yet</h2></div>;
  const config = { mode: 'season', season: year, stype: stype || 'regular', from: null, to: null, criteria: settings.season.criteria };
  return (
    <>
      <div className="datebar">
        <select value={year} onChange={e => go(`/season?season=${e.target.value}&stype=${stype}`)} aria-label="Season">{seasons.seasons.map(s => <option key={s.year} value={s.year}>{s.label}</option>)}</select>
        <div className="seg">{[['regular', 'Regular season'], ['playoffs', 'Playoffs'], ['all', 'Both']].map(([k, l]) => <button key={k} type="button" className={stype === k ? 'on' : ''} onClick={() => go(`/season?season=${year}&stype=${k}`)}>{l}</button>)}</div>
      </div>
      <Studio key={`${year}${stype}`} initial={{ config, style: DEFAULT_STYLE }} title={describePeriod(config)} subtitle="Season to date · updates every night" facts={facts('Season', config)} />
    </>
  );
}

// ---- History and comparison ---------------------------------------------------------------------------------------------
function History({ go }) {
  const [kind, setKind] = useState('');
  const [season, setSeason] = useState('');
  const [list, setList] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [pick, setPick] = useState([]);
  useEffect(() => { getSeasons().then(s => setSeasons(s.seasons)).catch(() => {}); }, []);
  useEffect(() => { setList(null); getHistory({ ...(kind ? { kind } : {}), ...(season ? { season } : {}), limit: 120 }).then(r => setList(r.diagrams)).catch(e => setList({ error: e })); }, [kind, season]);
  const toggle = id => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2)));
  return (
    <section className="history">
      <header className="page-head"><h1>Diagram history</h1><p className="muted">Every automatic diagram (and every shared custom one), with the data it was made from. Open one to view, modify, download or share it; pick two to compare.</p></header>
      <div className="datebar">
        <div className="seg">{[['', 'All'], ['daily', 'Daily'], ['season', 'Season'], ['custom', 'Custom']].map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <select value={season} onChange={e => setSeason(e.target.value)} aria-label="Season"><option value="">All seasons</option>{seasons.map(s => <option key={s.year} value={s.year}>{s.label}</option>)}</select>
        <button type="button" className="btn" disabled={pick.length !== 2} onClick={() => go(`/compare?a=${pick[0]}&b=${pick[1]}`)}>Compare {pick.length}/2</button>
      </div>
      {!list ? <Loading /> : list.error ? <ErrorBox err={list.error} /> : !list.length ? <div className="empty"><p>Nothing here yet.</p></div> : (
        <ul className="hist">
          {list.map(x => (
            <li key={x.id} className={pick.includes(x.id) ? 'picked' : ''}>
              <Link to={`/d/${x.id}`} go={go} className="hist-main">
                <span className={`tag ${x.kind}`}>{x.kind}</span>
                <b>{x.title}</b>
                <small className="muted">{x.period}{x.version > 1 ? ` · v${x.version}` : ''}</small>
                <span className="crits">{(x.criteria || []).join(' · ')}</span>
                <span className="count">{x.total} players</span>
              </Link>
              <div className="hist-tools">
                <Link to={`/d/${x.id}?edit=1`} go={go} className="btn small ghost">Modify</Link>
                <button type="button" className={`btn small ghost${pick.includes(x.id) ? ' on' : ''}`} onClick={() => toggle(x.id)}>{pick.includes(x.id) ? 'Picked' : 'Compare'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Compare({ a, b, go }) {
  const [docs, setDocs] = useState(null);
  const [bDate, setBDate] = useState('');
  const [live, setLive] = useState(null);
  useEffect(() => { Promise.all([a, b].filter(Boolean).map(id => getDiagram(id).then(r => r.diagram))).then(setDocs).catch(e => setDocs({ error: e })); }, [a, b]);
  // "Same criteria on another night": evaluate A's configuration on a chosen date.
  useEffect(() => {
    if (!bDate || !docs?.[0]) return;
    const cfg = { ...docs[0].config, date: bDate.replace(/-/g, '') };
    getDataset(cfg).then(ds => setLive({ cfg, result: evaluate(ds.rows, labeled(cfg.mode, withIds(cfg.criteria)), { mode: cfg.mode, minimums: ds.minimums, teams: cfg.teams, exclude: cfg.exclude }) })).catch(e => setLive({ error: e }));
  }, [bDate, docs]);
  if (!docs) return <Loading />;
  if (docs.error) return <ErrorBox err={docs.error} />;
  const sides = docs.map(d => ({ title: d.title, sub: d.period, criteria: labeled(d.config.mode, withIds(d.config.criteria)), result: resultOf(d), style: { ...DEFAULT_STYLE, ...d.style } }));
  if (live?.result) sides[1] = { title: longDay(live.cfg.date), sub: 'Same criteria', criteria: labeled(live.cfg.mode, withIds(live.cfg.criteria)), result: live.result, style: sides[0].style };
  return (
    <section>
      <header className="page-head"><h1>Compare</h1>
        {docs[0]?.config.mode === 'daily' && <label className="field inline">Same criteria on another night <input type="date" value={bDate} onChange={e => setBDate(e.target.value)} /></label>}
      </header>
      <div className="compare">{sides.map((s, i) => <div key={i} className="cmp"><h3>{s.title}</h3><p className="muted">{s.sub} · {s.result.total} players · {s.criteria.map(c => c.label).join(' · ')}</p><Diagram result={s.result} criteria={s.criteria} style={s.style} compact /></div>)}</div>
      {sides.length < 2 && <p className="hint">Pick a second diagram in <Link to="/history" go={go}>History</Link>, or choose a night above.</p>}
    </section>
  );
}
function resultOf(d) {
  const n = d.config.criteria.length, ps = d.result.players;
  return { players: ps, regions: Array.from({ length: (1 << n) - 1 }, (_, i) => ({ mask: i + 1, players: ps.filter(p => p.mask === i + 1) })), setSizes: d.result.setSizes, total: d.result.total };
}

// ---- A stored diagram ----------------------------------------------------------------------------------------------------
function Saved({ id, edit, go }) {
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); getDiagram(id).then(setR).catch(e => setR({ error: e })); }, [id]);
  if (!r) return <Loading />;
  if (r.error) return <ErrorBox err={r.error} />;
  const d = r.diagram;
  const versions = r.versions.length > 1 && <div className="versions">Versions: {r.versions.map(v => <Link key={v.id} to={`/d/${v.id}`} go={go} className={v.id === d._id ? 'on' : ''}>v{v.version}{v.latest ? ' (latest)' : ''}</Link>)}</div>;
  return <>{versions}<Studio key={d._id + edit} initial={{ config: d.config, style: { ...DEFAULT_STYLE, ...d.style } }} stored={d} startEditing={edit} title={d.title} subtitle={`${d.kind === 'custom' ? 'Custom diagram' : d.kind === 'daily' ? 'Daily diagram' : 'Season diagram'} · ${d.period}${d.latest ? '' : ' · superseded by a corrected version'}`} facts={facts(d.kind, d.config)} /></>;
}

// ---- Custom ---------------------------------------------------------------------------------------------------------------
function Custom({ c, go }) {
  const [init, setInit] = useState(null);
  const [configs, setConfigs] = useState([]);
  useEffect(() => {
    getConfigs().then(r => setConfigs(r.configs)).catch(() => {});
    const fromUrl = c ? decodeState(c) : null;
    if (fromUrl?.config) { setInit(fromUrl); return; }
    getSeasons().then(s => {
      const dates = s.seasons.flatMap(x => x.dates).sort().filter(x => x <= s.today);
      setInit({ config: { mode: 'daily', date: dates.pop(), criteria: [{ stat: 'pts', op: '>=', value: 30 }, { stat: 'reb', op: '>=', value: 10 }, { stat: 'ast', op: '>=', value: 8 }, { stat: 'stl', op: '>=', value: 2 }] }, style: DEFAULT_STYLE });
    }).catch(() => setInit({ config: { mode: 'daily', date: '', criteria: [] }, style: DEFAULT_STYLE }));
  }, [c]);
  if (!init) return <Loading />;
  return (
    <>
      {configs.length > 0 && <div className="datebar"><span className="muted small">Saved:</span>{configs.slice(0, 10).map(x => <button key={x.id} type="button" className="btn small ghost" onClick={() => go(`/custom?c=${encodeState({ config: x.config, style: { ...DEFAULT_STYLE, ...x.style } })}`)}>{x.name}</button>)}</div>}
      <Studio key={c || 'new'} initial={{ config: init.config, style: { ...DEFAULT_STYLE, ...init.style } }} startEditing title="Custom diagram" subtitle={describePeriod(init.config)} facts={facts('Custom', init.config)}
        onConfig={v => { const url = `/custom?c=${encodeState(v)}`; if (url !== location.pathname + location.search) history.replaceState(null, '', url); }} />
    </>
  );
}

// ---- Settings -------------------------------------------------------------------------------------------------------------
function Settings() {
  const [s, setS] = useState(null);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { getSettings().then(x => setS({ ...x, daily: { ...x.daily, criteria: withIds(x.daily.criteria) }, season: { ...x.season, criteria: withIds(x.season.criteria) } })).catch(e => setMsg(e.message)); }, []);
  if (!s) return msg ? <ErrorBox err={{ message: msg }} /> : <Loading />;
  const num = (grp, k, label, step = 1) => <label className="field small">{label}<input type="number" step={step} value={s.minimums[grp][k]} onChange={e => setS({ ...s, minimums: { ...s.minimums, [grp]: { ...s.minimums[grp], [k]: +e.target.value } } })} /></label>;
  const save = () => saveSettings({ passcode: pass, daily: s.daily, season: s.season, minimums: s.minimums }).then(() => setMsg('Saved. Tonight\'s automatic diagram uses these.')).catch(e => setMsg(e.message));
  return (
    <section className="settings">
      <header className="page-head"><h1>Settings</h1><p className="muted">The automatic diagrams and the minimum samples behind percentages and rates. Times are Eastern (the NBA's game dates).</p></header>
      <div className="settings-grid">
        <div className="card"><h3>Default daily diagram</h3><CriteriaEditor mode="daily" criteria={s.daily.criteria} onChange={cs => setS({ ...s, daily: { ...s.daily, criteria: cs } })} /></div>
        <div className="card"><h3>Default season diagram</h3>
          <label className="field">Games<select value={s.season.stype} onChange={e => setS({ ...s, season: { ...s.season, stype: e.target.value } })}><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></select></label>
          <CriteriaEditor mode="season" criteria={s.season.criteria} onChange={cs => setS({ ...s, season: { ...s.season, criteria: cs } })} /></div>
        <div className="card"><h3>Minimum samples: one night</h3><p className="hint">A percentage only counts with enough attempts (a 1-for-1 night isn't 100% free throws).</p>
          <div className="mins">{num('daily', 'fga', 'FG attempts')}{num('daily', 'tpa', '3P attempts')}{num('daily', 'fta', 'FT attempts')}{num('daily', 'fg2a', '2P attempts')}{num('daily', 'tsa', 'TS attempts')}{num('daily', 'minutes', 'Minutes (rates)')}</div></div>
        <div className="card"><h3>Minimum samples: season</h3><p className="hint">Averages, percentages and rates need a share of the team's games; percentages also need NBA-style made shots per team game.</p>
          <div className="mins">{num('season', 'gamesPct', 'Games played %')}{num('season', 'fgmPerGame', 'FGM per team game', 0.05)}{num('season', 'tpmPerGame', '3PM per team game', 0.05)}{num('season', 'ftmPerGame', 'FTM per team game', 0.05)}{num('season', 'mpg', 'Minutes per game (rates)')}</div></div>
        <div className="card"><h3>Save</h3><p className="hint">{s.hasPasscode ? 'Enter the owner passcode to change these.' : 'Set a passcode: whoever sets it first is the owner, and it is needed for every later change.'}</p>
          <div className="field-row"><input type="password" placeholder="Passcode" value={pass} onChange={e => setPass(e.target.value)} /><button type="button" className="btn primary" onClick={save}>Save settings</button></div>
          {msg && <p className="note-line">{msg}</p>}</div>
        <div className="card"><h3>How the automation works</h3><ul className="hint list">
          <li>Every 20 minutes from noon to 6 a.m. Eastern, the day's games are checked.</li>
          <li>A game's box score is stored only once it's final and passes checks: both teams present, players' points adding up to the score, minutes adding up to the game.</li>
          <li>The night's diagram is published once every game is final; postponed, canceled and suspended games don't hold it up.</li>
          <li>The last three nights are re-checked every six hours; a stat correction makes a new version (the old one stays in History).</li>
          <li>Data: ESPN box scores; season statistics are summed from them, plus ESPN's own season figures (PER and others) where ESPN has real values.</li></ul></div>
      </div>
    </section>
  );
}

const Loading = () => <div className="loading-page"><span className="spinner" />Loading…</div>;
const ErrorBox = ({ err }) => <div className="empty"><h2>Something went wrong</h2><p>{err?.message || String(err)}</p></div>;

export default function App() {
  const [route, go] = useRoute();
  useEffect(() => {
    const boot = document.getElementById('boot');
    if (boot) { const t = setTimeout(() => { boot.classList.add('done'); setTimeout(() => boot.remove(), 400); }, 250); return () => clearTimeout(t); }
  }, []);
  const tabs = [['/', 'Today', 'home'], ['/daily', 'Daily', 'daily'], ['/season', 'Season', 'season'], ['/history', 'History', 'history'], ['/custom', 'Custom', 'custom'], ['/settings', 'Settings', 'settings']];
  useEffect(() => { document.title = `${tabs.find(t => t[2] === route.page)?.[1] || 'Diagram'} · Overlap`; }, [route.page]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" go={go} className="brand"><Logo /><span>Overlap</span></Link>
        <div className="tabs-nav">{tabs.map(([to, label, page]) => <Link key={page} to={to} go={go} aria-current={route.page === page || (page === 'history' && route.page === 'compare') ? 'page' : undefined}><TabIcon page={page} /><span>{label}</span></Link>)}</div>
      </nav>
      <main className="main">
        {route.page === 'home' && <Home go={go} />}
        {route.page === 'daily' && <Daily date={route.date} go={go} />}
        {route.page === 'season' && <Season season={route.season} stype={route.stype} go={go} />}
        {route.page === 'history' && <History go={go} />}
        {route.page === 'compare' && <Compare a={route.a} b={route.b} go={go} />}
        {route.page === 'custom' && <Custom c={route.c} go={go} />}
        {route.page === 'saved' && <Saved id={route.id} edit={route.edit} go={go} />}
        {route.page === 'settings' && <Settings />}
      </main>
      <footer className="foot">Data: ESPN box scores and season figures. Not affiliated with the NBA or ESPN.</footer>
    </div>
  );
}
