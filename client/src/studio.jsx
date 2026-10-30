// The diagram studio: the diagram (the page's main attraction), its facts, and the editor. Statistics are evaluated
// in the browser with the same engine the server uses, so every change redraws at once; changing colors, positions or
// the view never changes who qualifies.
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, OPS, bits } from '../../lib/engine.js';
import { statMap, criterionLabel, kindLabel, catalog, formatValue, UNAVAILABLE } from '../../lib/stats/catalog.js';
import { buildDiagram } from '../../lib/venn/index.js';
import { DEFAULT_STYLE, PALETTE, FONTS, colorOf } from '../../lib/venn/render.js';
import { getDataset, getSeasons, getConfigs, saveConfig, ago, shortDay, isoDay, longDay } from './api.js';
import { ShareButton } from './share.jsx';

export const newId = () => Math.random().toString(36).slice(2, 9);
export const withIds = cs => (cs || []).map(c => ({ id: c.id ?? newId(), stat: c.stat, op: c.op, value: c.value }));
export const labeled = (mode, cs) => { const m = statMap(mode); return cs.filter(c => m.has(c.stat)).map(c => ({ ...c, label: criterionLabel(m.get(c.stat), c.op, +c.value) })); };

// Rebuild an engine result from a stored diagram's players (each with his mask).
export function resultFromStored(doc) {
  const n = doc.config.criteria.length, ps = doc.result.players;
  const regions = Array.from({ length: (1 << n) - 1 }, (_, i) => ({ mask: i + 1, players: ps.filter(p => p.mask === i + 1) }));
  return { players: ps, regions, setSizes: doc.result.setSizes, total: doc.result.total, smallSample: doc.result.smallSample, maxGames: doc.result.maxGames };
}

// Undo/redo over a value; changes within 500 ms (a slider drag) are one step.
export function useHistory(initial) {
  const [state, setState] = useState({ past: [], now: initial, future: [] });
  const last = useRef(0);
  const set = useCallback(fn => setState(s => {
    const next = typeof fn === 'function' ? fn(s.now) : fn;
    if (next === s.now) return s;
    const merge = Date.now() - last.current < 500 && s.past.length;
    last.current = Date.now();
    return { past: merge ? s.past : [...s.past, s.now].slice(-100), now: next, future: [] };
  }), []);
  const undo = useCallback(() => setState(s => (s.past.length ? { past: s.past.slice(0, -1), now: s.past[s.past.length - 1], future: [s.now, ...s.future] } : s)), []);
  const redo = useCallback(() => setState(s => (s.future.length ? { past: [...s.past, s.now], now: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback(v => setState({ past: [], now: v, future: [] }), []);
  return { value: state.now, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

// The diagram itself, drawn from the shared renderer; clicking a headshot opens the player.
export function Diagram({ result, criteria, style, onPlayer, compact = false }) {
  const d = useMemo(() => buildDiagram(result, criteria, style, { width: 1000 }), [result, criteria, style]);
  const ref = useRef(null);
  const missing = d.layout?.missing?.length;
  return (
    <div className={`diagram${compact ? ' compact' : ''}`} style={{ background: style.bg }}>
      {criteria.length === 0 && <div className="diagram-empty"><h3>Add a criterion</h3><p>Pick any statistic and a threshold to start the diagram.</p></div>}
      {criteria.length > 0 && result.total === 0 && <div className="diagram-note">No player meets any of these criteria.</div>}
      {missing ? <div className="diagram-note warn">The circle positions removed a region that has players in it. Reset the positions in Style.</div> : null}
      {criteria.length > 0 && (
        <svg ref={ref} className="diagram-svg" viewBox={`0 0 ${d.width} ${d.height}`} role="img" aria-label={`${d.view === 'venn' ? 'Venn diagram' : 'Intersection chart'} of ${result.total} players`}
          onClick={e => { const g = e.target.closest?.('[data-pid]'); if (g && onPlayer) onPlayer(g.getAttribute('data-pid')); }}
          dangerouslySetInnerHTML={{ __html: d.body }} />
      )}
    </div>
  );
}

// The player card: his values for each criterion, and his line.
export function PlayerPanel({ player, criteria, mode, onClose, onExclude }) {
  if (!player) return null;
  const stats = statMap(mode);
  const keyStats = mode === 'daily' ? ['min', 'pts', 'reb', 'ast', 'stl', 'blk', 'to', 'fg_pct', 'tp_pct', 'ft_pct', 'ts_pct', 'pm'] : ['gp', 'min_pg', 'pts_pg', 'reb_pg', 'ast_pg', 'stl_pg', 'blk_pg', 'fg_pct', 'tp_pct', 'ft_pct', 'ts_pct', 'per'];
  return (
    createPortal(<div className="modal-back" onClick={onClose}>
      <div className="modal player" onClick={e => e.stopPropagation()} role="dialog" aria-label={player.name}>
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        <div className="player-head">
          <span className="ph" style={{ borderColor: player.team?.color || '#333' }}><img src={player.headshot} alt="" /></span>
          <div><h3>{player.name}</h3><p className="muted">{player.team?.abbr}{player.opp ? ` vs ${player.opp.abbr}` : ''}</p></div>
        </div>
        <h4>Criteria</h4>
        <ul className="crit-values">
          {criteria.map((c, i) => {
            const met = (player.mask >> i) & 1, short = player.shortOf?.includes(i);
            return <li key={c.id ?? i}><span className="dot" style={{ background: colorOf({ colors: PALETTE }, i) }} /><span>{c.label}</span><b>{formatValue(stats.get(c.stat), player.values?.[i] ?? player.v?.[c.stat])}</b><em className={met ? 'yes' : short ? 'short' : 'no'}>{met ? 'Meets' : short ? 'Sample too small' : 'No'}</em></li>;
          })}
        </ul>
        {player.v && <>
          <h4>Line</h4>
          <dl className="stats">{keyStats.filter(k => stats.has(k) && player.v[k] != null).map(k => <div key={k}><dt>{stats.get(k).abbr}</dt><dd>{formatValue(stats.get(k), player.v[k])}</dd></div>)}</dl>
        </>}
        {onExclude && <button type="button" className="btn ghost" onClick={() => { onExclude(player.id); onClose(); }}>Exclude from this diagram</button>}
      </div>
    </div>, document.body)
  );
}

// Searchable statistic picker, grouped, with each statistic's kind and source; ones the data can't support are shown
// disabled with the reason.
export function StatPicker({ mode, available, onPick, onClose }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => catalog(mode), [mode]);
  const avail = useMemo(() => new Set(available || all.map(s => s.key)), [available, all]);
  const groups = ['Traditional', 'Advanced', 'Additional'];
  const match = s => !q || `${s.label} ${s.abbr} ${s.key} ${kindLabel(s.kind)}`.toLowerCase().includes(q.toLowerCase());
  const SRC = { box: 'Box score', computed: 'Computed', provider: 'ESPN season' };
  return (
    createPortal(<div className="modal-back" onClick={onClose}>
      <div className="modal picker" onClick={e => e.stopPropagation()} role="dialog" aria-label="Choose a statistic">
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        <h3>Choose a statistic <span className="muted">{mode === 'daily' ? 'single game' : 'season'}</span></h3>
        <input autoFocus className="search" placeholder="Search: rebounds, FT%, usage, per 36…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="picker-list">
          {groups.map(g => {
            const list = all.filter(s => s.group === g && match(s));
            if (!list.length) return null;
            return (
              <section key={g}>
                <h4>{g} statistics</h4>
                {list.map(s => {
                  const ok = avail.has(s.key);
                  return (
                    <button type="button" key={s.key} className="stat-row" disabled={!ok} onClick={() => onPick(s.key)} title={s.note || ''}>
                      <span className="sl">{s.label}<small>{s.abbr}</small></span>
                      <span className="badges"><i className={`k-${s.kind}`}>{kindLabel(s.kind)}</i><i className="src">{SRC[s.source]}</i></span>
                      {!ok && <em>{s.source === 'provider' ? (s.wholeSeasonOnly ? 'ESPN serves this for whole seasons only, and not with real values here' : 'Not in this data') : 'Not in this data'}</em>}
                    </button>
                  );
                })}
              </section>
            );
          })}
          {!q && <section className="unavailable"><h4>Not available from the data provider</h4><p className="muted">{UNAVAILABLE.join(', ')}. ESPN doesn't serve these, and they're never estimated here.</p></section>}
        </div>
      </div>
    </div>, document.body)
  );
}

// The criteria list: statistic, comparison, threshold; reorder, edit, remove.
export function CriteriaEditor({ mode, criteria, available, onChange, max = 12 }) {
  const [picking, setPicking] = useState(null); // index or 'new'
  const stats = statMap(mode);
  const set = (i, patch) => onChange(criteria.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i, d) => { const a = criteria.slice(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const pick = key => {
    const s = stats.get(key), dflt = s.kind === 'percentage' ? 50 : s.kind === 'flag' ? 1 : s.kind === 'rate' ? 20 : s.kind === 'total' && mode === 'season' ? 500 : 10;
    if (picking === 'new') onChange([...criteria, { id: newId(), stat: key, op: '>=', value: dflt }]);
    else set(picking, { stat: key });
    setPicking(null);
  };
  return (
    <div className="crit-editor">
      <ol>
        {criteria.map((c, i) => {
          const s = stats.get(c.stat);
          return (
            <li key={c.id} style={{ '--c': PALETTE[i % PALETTE.length] }}>
              <span className="num">{i + 1}</span>
              <button type="button" className="stat-btn" onClick={() => setPicking(i)}>{s?.label || c.stat}<small>{s ? kindLabel(s.kind) : ''}</small></button>
              <span className="crit-row2">
              {s?.kind === 'flag' ? (
                <select value={c.value >= 1 ? 'yes' : 'no'} onChange={e => set(i, e.target.value === 'yes' ? { op: '>=', value: 1 } : { op: '<', value: 1 })} aria-label="Yes or no"><option value="yes">Yes</option><option value="no">No</option></select>
              ) : <>
                <select value={c.op} onChange={e => set(i, { op: e.target.value })} aria-label="Comparison">{Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input type="number" step="any" inputMode="decimal" value={c.value} onChange={e => set(i, { value: e.target.value === '' ? '' : +e.target.value })} aria-label="Threshold" />
                {s?.suffix && <span className="suf">{s.suffix}</span>}
              </>}
              <span className="row-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === criteria.length - 1} aria-label="Move down">↓</button>
                <button type="button" onClick={() => onChange(criteria.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
              </span>
              </span>
            </li>
          );
        })}
      </ol>
      {criteria.length < max && <button type="button" className="btn add" onClick={() => setPicking('new')}>+ Add a criterion</button>}
      {picking != null && <StatPicker mode={mode} available={available} onPick={pick} onClose={() => setPicking(null)} />}
    </div>
  );
}

// Period controls: a night, or a season (regular season, playoffs, both; a date range; "as of" a date).
export function PeriodEditor({ config, onChange }) {
  const [seasons, setSeasons] = useState([]);
  useEffect(() => { getSeasons().then(s => setSeasons(s.seasons)).catch(() => {}); }, []);
  const s = seasons.find(x => x.year === +config.season);
  const toIso = v => (v ? isoDay(v) : ''), fromIso = v => (v ? v.replace(/-/g, '') : null);
  return (
    <div className="period">
      <div className="seg" role="radiogroup" aria-label="Period">
        {[['daily', 'Single night'], ['season', 'Season']].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={config.mode === k} className={config.mode === k ? 'on' : ''}
            onClick={() => k !== config.mode && onChange(k === 'daily' ? { mode: 'daily', date: config.to || (seasons[0]?.dates || []).filter(x => x <= seasons.at?.(0)?.end).pop() || config.date, criteria: [] } : { mode: 'season', season: seasons[0]?.year, stype: 'regular', criteria: [] })}>{l}</button>
        ))}
      </div>
      {config.mode === 'daily' ? (
        <label className="field">Night<input type="date" value={toIso(config.date)} onChange={e => e.target.value && onChange({ ...config, date: fromIso(e.target.value) })} /></label>
      ) : <>
        <label className="field">Season<select value={config.season || ''} onChange={e => onChange({ ...config, season: +e.target.value, from: null, to: null })}>{seasons.map(x => <option key={x.year} value={x.year}>{x.label}</option>)}</select></label>
        <label className="field">Games<select value={config.stype || 'regular'} onChange={e => onChange({ ...config, stype: e.target.value })}><option value="regular">Regular season</option><option value="playoffs">Playoffs (and play-in)</option><option value="all">Both</option></select></label>
        <div className="field-row">
          <label className="field">From<input type="date" value={toIso(config.from)} min={s ? toIso(s.start) : undefined} max={s ? toIso(s.end) : undefined} onChange={e => onChange({ ...config, from: fromIso(e.target.value) })} /></label>
          <label className="field">Through<input type="date" value={toIso(config.to)} min={s ? toIso(s.start) : undefined} max={s ? toIso(s.end) : undefined} onChange={e => onChange({ ...config, to: fromIso(e.target.value) })} /></label>
        </div>
        <p className="hint">Leave the dates empty for the season to date. A "through" date shows the season as it stood that day. ESPN's own figures (PER…) only exist for the season to date.</p>
      </>}
    </div>
  );
}

// Style controls: view, colors, background, transparency, circle positions and sizes, headshots, labels, fonts.
export function StyleEditor({ style, n, onChange }) {
  const set = patch => onChange({ ...style, ...patch });
  const adj = (i, patch) => { const a = Array.from({ length: n }, (_, k) => ({ ...(style.adjust?.[k] || {}) })); a[i] = { ...a[i], ...patch }; set({ adjust: a }); };
  return (
    <div className="style-editor">
      <div className="seg" role="radiogroup" aria-label="View">
        {[['auto', 'Automatic'], ['venn', 'Venn'], ['upset', 'Intersections']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={style.view === k} className={style.view === k ? 'on' : ''} disabled={k === 'venn' && n > 5} onClick={() => set({ view: k })}>{l}</button>)}
      </div>
      {n > 5 && <p className="hint">Venn diagrams stop at five criteria; with more, the intersection view shows every combination exactly.</p>}
      <div className="colors">
        {Array.from({ length: Math.max(n, 1) }, (_, i) => (
          <label key={i} className="color"><input type="color" value={style.colors?.[i] || PALETTE[i % PALETTE.length]} onChange={e => { const c = (style.colors || PALETTE).slice(); c[i] = e.target.value; set({ colors: c }); }} /><span>{i + 1}</span></label>
        ))}
        <label className="color bg"><input type="color" value={style.bg} onChange={e => set({ bg: e.target.value })} /><span>Background</span></label>
      </div>
      <label className="field range">Circle fill <input type="range" min="0" max="0.5" step="0.01" value={style.fillOpacity} onChange={e => set({ fillOpacity: +e.target.value })} /><output>{Math.round(style.fillOpacity * 100)}%</output></label>
      <label className="field range">Outline <input type="range" min="0" max="8" step="0.5" value={style.strokeWidth} onChange={e => set({ strokeWidth: +e.target.value })} /><output>{style.strokeWidth}</output></label>
      <label className="field range">Headshots <input type="range" min="0.5" max="1.8" step="0.05" value={style.headshot} onChange={e => set({ headshot: +e.target.value })} /><output>{Math.round(style.headshot * 100)}%</output></label>
      <div className="toggles">
        <label><input type="checkbox" checked={style.names} onChange={e => set({ names: e.target.checked })} /> Player names</label>
        <label><input type="checkbox" checked={style.counts} onChange={e => set({ counts: e.target.checked })} /> Region counts</label>
      </div>
      <label className="field">Typeface<select value={style.font} onChange={e => set({ font: e.target.value })}>{Object.keys(FONTS).map(f => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}</select></label>
      {n >= 1 && n <= 5 && (
        <details className="positions">
          <summary>Circle positions and sizes</summary>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="pos-row" style={{ '--c': style.colors?.[i] || PALETTE[i] }}>
              <span className="num">{i + 1}</span>
              <label>X<input type="range" min="-0.4" max="0.4" step="0.01" value={style.adjust?.[i]?.dx || 0} onChange={e => adj(i, { dx: +e.target.value })} /></label>
              <label>Y<input type="range" min="-0.4" max="0.4" step="0.01" value={style.adjust?.[i]?.dy || 0} onChange={e => adj(i, { dy: +e.target.value })} /></label>
              <label>Size<input type="range" min="0.7" max="1.4" step="0.01" value={style.adjust?.[i]?.scale || 1} onChange={e => adj(i, { scale: +e.target.value })} /></label>
            </div>
          ))}
          <button type="button" className="btn ghost small" onClick={() => set({ adjust: [] })}>Reset positions</button>
        </details>
      )}
    </div>
  );
}

// Team and player filters.
export function FilterEditor({ rows, config, onChange }) {
  const teams = useMemo(() => [...new Map((rows || []).filter(r => r.team?.id).map(r => [r.team.id, r.team])).values()].sort((a, b) => String(a.abbr).localeCompare(b.abbr)), [rows]);
  const [q, setQ] = useState('');
  const names = new Map((rows || []).map(r => [String(r.id), r.name]));
  const toggle = (k, id) => { const s = new Set((config[k] || []).map(String)); s.has(id) ? s.delete(id) : s.add(id); onChange({ ...config, [k]: [...s] }); };
  const hits = q.length > 1 ? (rows || []).filter(r => r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div className="filters">
      <h4>Teams <span className="muted">{config.teams?.length ? `${config.teams.length} selected` : 'all'}</span></h4>
      <div className="chips">{teams.map(t => <button key={t.id} type="button" className={`chip${config.teams?.map(String).includes(String(t.id)) ? ' on' : ''}`} style={{ '--tc': t.color || '#555' }} onClick={() => toggle('teams', String(t.id))}>{t.abbr}</button>)}</div>
      <h4>Players</h4>
      <input className="search" placeholder="Find a player to show only, or exclude" value={q} onChange={e => setQ(e.target.value)} />
      {hits.map(r => <div key={r.id} className="hit"><span>{r.name} <small className="muted">{r.team?.abbr}</small></span><button type="button" className="btn small ghost" onClick={() => toggle('players', String(r.id))}>{config.players?.includes(String(r.id)) ? 'Unpin' : 'Only these'}</button><button type="button" className="btn small ghost" onClick={() => toggle('exclude', String(r.id))}>{config.exclude?.includes(String(r.id)) ? 'Include' : 'Exclude'}</button></div>)}
      {config.players?.length > 0 && <p className="hint">Showing only: {config.players.map(id => names.get(id) || id).join(', ')} <button type="button" className="link" onClick={() => onChange({ ...config, players: [] })}>clear</button></p>}
      {config.exclude?.length > 0 && <p className="hint">Excluded: {config.exclude.map(id => names.get(id) || id).join(', ')} <button type="button" className="link" onClick={() => onChange({ ...config, exclude: [] })}>clear</button></p>}
    </div>
  );
}

// Region list: every combination with players, with its count.
function Regions({ result, criteria, style }) {
  const rows = result.regions.filter(r => r.players.length).sort((a, b) => bits(b.mask).length - bits(a.mask).length || b.players.length - a.players.length);
  return (
    <ul className="regions">
      {rows.map(r => (
        <li key={r.mask}>
          <span className="dots">{criteria.map((_, i) => <i key={i} style={{ background: (r.mask >> i) & 1 ? colorOf(style, i) : 'transparent', borderColor: colorOf(style, i) }} />)}</span>
          <span className="rl">{bits(r.mask).length === criteria.length ? 'All criteria' : bits(r.mask).map(i => criteria[i].label).join(' + ')}{bits(r.mask).length === 1 ? ' only' : ''}</span>
          <b>{r.players.length}</b>
        </li>
      ))}
    </ul>
  );
}

// The studio. initial: { config, style }; stored: a stored diagram shown as-is until edited; meta: facts to show.
export function Studio({ initial, stored = null, startEditing = false, title, subtitle, facts, actions, onConfig }) {
  const h = useHistory(initial);
  const { config, style } = h.value;
  const [editing, setEditing] = useState(startEditing);
  const [tab, setTab] = useState('criteria');
  const [ds, setDs] = useState(null);
  const [dsError, setDsError] = useState(null);
  const [player, setPlayer] = useState(null);
  const [saved, setSaved] = useState('');
  const edited = h.value !== initial;
  const scopeKey = config.mode === 'daily' ? `d${config.date}` : `s${config.season}${config.stype}${config.from}${config.to}`;
  const needData = editing || edited || !stored;
  useEffect(() => {
    if (!needData) return;
    let alive = true; setDsError(null);
    getDataset(config).then(x => alive && setDs(x)).catch(e => alive && setDsError(e));
    return () => { alive = false; };
  }, [scopeKey, needData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onConfig?.(h.value); }, [h.value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keyboard undo/redo while editing.
  useEffect(() => {
    if (!editing) return;
    const on = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); e.shiftKey ? h.redo() : h.undo(); } };
    addEventListener('keydown', on); return () => removeEventListener('keydown', on);
  }, [editing, h]);

  const criteria = useMemo(() => labeled(config.mode, withIds(config.criteria).filter(c => c.value !== '')), [config]);
  const live = !stored || edited || editing;
  const result = useMemo(() => {
    if (!live && stored) return resultFromStored(stored);
    if (!ds || ds.config?.mode !== config.mode) return null;
    return evaluate(ds.rows, criteria, { mode: config.mode, minimums: ds.minimums, teams: config.teams, exclude: config.exclude, players: config.players });
  }, [live, stored, ds, criteria, config]);
  const setConfig = c => h.set(v => ({ ...v, config: typeof c === 'function' ? c(v.config) : c }));
  const setStyle = s => h.set(v => ({ ...v, style: s }));
  const byId = useMemo(() => new Map((ds?.rows || []).map(r => [String(r.id), r])), [ds]);
  const openPlayer = id => { const p = result?.players.find(x => String(x.id) === String(id)); if (p) setPlayer({ ...byId.get(String(id)), ...p }); };
  const meta = live ? ds?.meta : stored?.meta;

  return (
    <div className={`studio${editing ? ' editing' : ''}`}>
      <div className="stage">
        <header className="stage-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <div className="stage-actions">
            {actions}
            <button type="button" className={`btn${editing ? ' on' : ''}`} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Modify'}</button>
            {result && <ShareButton result={result} criteria={criteria} style={style} config={config} title={title} subtitle={subtitle} storedId={!edited ? stored?._id : null} />}
          </div>
        </header>
        {facts && <div className="facts">{facts(result, meta)}</div>}
        {dsError && live && <div className="diagram-note warn">{dsError.message}</div>}
        {result ? <Diagram result={result} criteria={criteria} style={style} onPlayer={openPlayer} /> : !dsError && <div className="diagram loading" style={{ background: style.bg }}><span className="spinner" />Loading the statistics…</div>}
        {result && (
          <div className="legend-row">
            {criteria.map((c, i) => <span key={c.id} className="pill" style={{ '--c': colorOf(style, i) }}>{c.label}<b>{result.setSizes[i]}</b></span>)}
            {result.smallSample > 0 && <span className="muted small">{result.smallSample} players left out for too small a sample (see Settings)</span>}
          </div>
        )}
      </div>
      <aside className="panel">
        {!editing ? (
          <>
            <h3>Regions <span className="muted">{result ? `${result.total} players` : ''}</span></h3>
            {result ? <Regions result={result} criteria={criteria} style={style} /> : <p className="muted">…</p>}
            <p className="hint">Tap a headshot for the player's numbers. "Modify" changes the criteria, period, filters and look.</p>
          </>
        ) : (
          <>
            <div className="panel-tools">
              <button type="button" className="btn small ghost" onClick={h.undo} disabled={!h.canUndo} aria-label="Undo">↶ Undo</button>
              <button type="button" className="btn small ghost" onClick={h.redo} disabled={!h.canRedo} aria-label="Redo">↷ Redo</button>
              <button type="button" className="btn small ghost" onClick={() => h.set(initial)} disabled={!edited}>Reset</button>
            </div>
            <div className="tabs" role="tablist">
              {[['criteria', 'Criteria'], ['period', 'Period'], ['filters', 'Filters'], ['style', 'Style'], ['save', 'Save']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            {tab === 'criteria' && <CriteriaEditor mode={config.mode} criteria={withIds(config.criteria)} available={ds?.available} onChange={cs => setConfig({ ...config, criteria: cs })} />}
            {tab === 'period' && <PeriodEditor config={config} onChange={c => setConfig({ ...config, ...c, criteria: c.mode !== config.mode ? [] : config.criteria })} />}
            {tab === 'filters' && <FilterEditor rows={ds?.rows} config={config} onChange={setConfig} />}
            {tab === 'style' && <StyleEditor style={style} n={criteria.length} onChange={setStyle} />}
            {tab === 'save' && <SavePanel config={config} style={style} onSaved={setSaved} saved={saved} />}
          </>
        )}
      </aside>
      {player && <PlayerPanel player={player} criteria={criteria} mode={config.mode} onClose={() => setPlayer(null)} onExclude={id => { setEditing(true); setConfig({ ...config, exclude: [...new Set([...(config.exclude || []), String(id)])] }); }} />}
    </div>
  );
}

function SavePanel({ config, style, onSaved, saved }) {
  const [name, setName] = useState('');
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { getConfigs().then(r => setList(r.configs)).catch(() => setList([])); }, [saved]);
  return (
    <div className="save">
      <p className="hint">Save these criteria, period, filters and look to reuse them. Saved configurations are open in Custom.</p>
      <div className="field-row"><input placeholder="Name, e.g. Point-forward nights" value={name} onChange={e => setName(e.target.value)} /><button type="button" className="btn" disabled={!name.trim() || !config.criteria?.length} onClick={() => saveConfig({ name, config: { ...config, criteria: withIds(config.criteria) }, style }).then(r => { onSaved(r.id); setName(''); setErr(''); }).catch(e => setErr(e.message))}>Save</button></div>
      {err && <p className="warn">{err}</p>}
      {saved && <p className="ok">Saved.</p>}
      {list?.length > 0 && <><h4>Saved</h4><ul className="saved">{list.slice(0, 12).map(c => <li key={c.id}><span>{c.name}</span><small className="muted">{c.config.mode === 'daily' ? 'Night' : 'Season'} · {c.config.criteria.length} criteria</small></li>)}</ul></>}
    </div>
  );
}

export const describePeriod = cfg => (cfg.mode === 'daily' ? longDay(cfg.date) : `${cfg.season ? `${cfg.season - 1}-${String(cfg.season % 100).padStart(2, '0')}` : ''} ${cfg.stype === 'playoffs' ? 'Playoffs' : cfg.stype === 'all' ? 'Season + Playoffs' : 'Regular Season'}${cfg.from || cfg.to ? ` · ${cfg.from ? shortDay(cfg.from) : 'start'} – ${cfg.to ? shortDay(cfg.to) : 'today'}` : ''}`);
export { DEFAULT_STYLE, ago };
