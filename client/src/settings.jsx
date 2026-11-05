// Settings: each person's preferences; for editors and the owner, how the engine detects and ranks events, AI writing,
// graphics, data sources, people, and the automation log.
import React, { useEffect, useState } from 'react';
import { get, post, useLoad, useMe, setMe, can, ago } from './api.js';
import { Link, ErrorBox, Loading, TeamLogo, CATS } from './components.jsx';

const TABS = [['prefs', 'My preferences', 'fan'], ['engine', 'Detection & feed', 'editor'], ['integrations', 'Data & AI', 'editor'], ['people', 'People', 'owner'], ['log', 'Automation log', 'editor']];

export function SettingsPage() {
  const { user, loaded } = useMe();
  const [tab, setTab] = useState('prefs');
  if (!loaded) return <Loading />;
  if (!user) return <div className="empty"><h3>Sign in to set your preferences</h3><p><Link to="/signin?next=/settings">Sign in or create an account</Link></p></div>;
  const tabs = TABS.filter(t => can(user, t[2]));
  return (
    <div className="settings-page">
      <div className="page-head"><h1>Settings</h1></div>
      <div className="seg">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'prefs' && <Prefs user={user} />}
      {tab === 'engine' && <Engine owner={user.role === 'owner'} />}
      {tab === 'integrations' && <Integrations owner={user.role === 'owner'} />}
      {tab === 'people' && <People />}
      {tab === 'log' && <Log />}
    </div>
  );
}

function Prefs({ user }) {
  const { data: teams } = useLoad(() => get('nba', { action: 'teams' }), []);
  const [p, setP] = useState(() => ({ teams: [], players: [], categories: [], minLevel: 'medium', notify: {}, ...(user.prefs || {}) }));
  const [saved, setSaved] = useState(null);
  const save = async next => { setP(next); const r = await post('admin', 'prefs', { prefs: next }); setMe({ ...user, prefs: r.prefs }); setSaved(new Date()); };
  const toggle = (k, v) => save({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] });
  const browser = async on => {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') return; }
    save({ ...p, notify: { ...p.notify, browser: on } });
  };
  return (
    <div className="settings-body">
      <section className="panel">
        <h3>Favorite teams</h3>
        <p className="muted small">Stories about them are highlighted, can be filtered to ("My teams & players"), and alert you.</p>
        <div className="team-pick">{(teams || []).map(t => <button key={t.id} type="button" className={`team-chip ${p.teams.includes(t.id) ? 'on' : ''}`} onClick={() => toggle('teams', t.id)}><TeamLogo src={t.logo} abbr={t.abbr} size={20} />{t.abbr}</button>)}</div>
      </section>
      <section className="panel">
        <h3>Favorite players</h3>
        <p className="muted small">{p.players.length ? `${p.players.length} followed.` : 'None yet.'} Follow players from their page (☆ Add to favorites).</p>
      </section>
      <section className="panel">
        <h3>Alerts</h3>
        <label className="check"><input type="checkbox" checked={!!p.notify?.critical} onChange={e => save({ ...p, notify: { ...p.notify, critical: e.target.checked } })} /> Critical moments (records, game winners, big comebacks)</label>
        <label className="check"><input type="checkbox" checked={!!p.notify?.favorites} onChange={e => save({ ...p, notify: { ...p.notify, favorites: e.target.checked } })} /> Anything about my favorites</label>
        <label className="check"><input type="checkbox" checked={!!p.notify?.browser} onChange={e => browser(e.target.checked)} /> Also as browser notifications while the app is open in another tab</label>
      </section>
      {saved && <p className="muted small">Saved {ago(saved)}.</p>}
      <Password />
    </div>
  );
}

function Password() {
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const submit = async e => { e.preventDefault(); try { await post('admin', 'password', f); setMe(null); setMsg('Password changed — sign in again.'); } catch (x) { setMsg(x.message); } };
  return (
    <section className="panel"><h3>Password</h3>
      <form className="form inline" onSubmit={submit}>
        <input type="password" placeholder="Current password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} autoComplete="current-password" required />
        <input type="password" placeholder="New password (10+)" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} autoComplete="new-password" minLength={10} required />
        <button className="btn">Change</button>
      </form>
      {msg && <p className="muted small">{msg}</p>}
    </section>
  );
}

// Number and toggle inputs bound to a settings path.
const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, path, v) => { const ks = path.split('.'); const out = structuredClone(o); let t = out; ks.slice(0, -1).forEach(k => { t = t[k] ||= {}; }); t[ks.at(-1)] = v; return out; };

function Engine({ owner }) {
  const { data, error, reload } = useLoad(() => get('admin', { action: 'settings' }), []);
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!s) return <Loading />;
  const num = (path, label, hint, step = 1) => <label className="field num"><span>{label}{hint && <small className="muted"> {hint}</small>}</span><input type="number" step={step} value={getPath(s, path) ?? ''} disabled={!owner} onChange={e => setS(setPath(s, path, e.target.value === '' ? '' : +e.target.value))} /></label>;
  const bool = (path, label) => <label className="check"><input type="checkbox" checked={!!getPath(s, path)} disabled={!owner} onChange={e => setS(setPath(s, path, e.target.checked))} /> {label}</label>;
  const save = async () => { try { const r = await post('admin', 'settings', { settings: s }); setS(r.settings); setMsg('Saved.'); } catch (x) { setMsg(x.message); } };
  return (
    <div className="settings-body">
      {!owner && <p className="muted">Only the owner can change these.</p>}
      <section className="panel"><h3>Feed</h3>
        {num('feed.minScore', 'Significance needed to publish', '(0–100; critical ≥ 85, high ≥ 65, medium ≥ 40)')}
        {num('feed.perGameRunCap', 'Most scoring/solo runs published per game')}
        {num('feed.boostFavorites', 'Significance bonus for watchlist teams and players')}
        <label className="field"><span>Monitor</span><select value={s.feed.scope} disabled={!owner} onChange={e => setS(setPath(s, 'feed.scope', e.target.value))}><option value="all">All NBA games</option><option value="teams">Watchlist teams only</option><option value="players">Watchlist players only</option></select></label>
        <h4>Categories in the feed</h4>
        <div className="cat-grid">{Object.keys(s.feed.categories).map(k => bool(`feed.categories.${k}`, CATS[k]?.[0] || k))}</div>
      </section>
      <section className="panel"><h3>Live game detection</h3>
        {bool('detection.live', 'Watch live games')}{bool('detection.records', 'Records')}{bool('detection.milestones', 'Milestones')}
        <div className="num-grid">
          {num('intel.run.min', 'Team run: minimum points')}{num('intel.run.minQ4', 'In the 4th quarter/OT')}{num('intel.run.minEarly', 'In the 1st half')}
          {num('intel.solo.consecutive', 'Solo run: consecutive points')}{num('intel.solo.consecutiveLate', 'In the 4th/OT')}
          {num('intel.close.clutchMargin', 'Clutch: margin within')}{num('intel.close.clutchSeconds', 'Clutch: seconds left')}
          {num('intel.comeback.minDeficit', 'Comeback: deficit of at least')}{num('intel.comeback.cut', 'Comeback: cut by at least')}
          {num('intel.blowout.lead', 'Blowout: lead of')}{num('intel.collapse.lead', 'Collapse: lead of')}{num('intel.collapse.drop', 'Collapse: given back')}
          {num('feed.streaks.win', 'Winning streak worth a story')}{num('feed.streaks.loss', 'Losing streak worth a story')}{num('feed.streaks.endedFrom', 'Snapped streak of at least')}
        </div>
      </section>
      <section className="panel"><h3>Performances</h3>
        <div className="num-grid">
          {num('detection.efficient.minPts', 'Efficient: points')}{num('detection.efficient.ts', 'Efficient: TS% at least')}
          {num('detection.rolePlayer.avgMax', 'Role player: averages at most')}{num('detection.rolePlayer.minPts', 'Role player: points tonight')}
          {num('detection.outlierZ', 'Outlier vs own season (standard deviations)', '', 0.1)}{num('detection.turnovers', 'High turnovers')}
          {num('detection.defense.stocks', 'Defense: steals + blocks')}{num('detection.clutch.pts', 'Clutch points')}
          {num('detection.disappointment.minAvg', 'Rough night: averages at least')}{num('detection.minScore', 'Performance significance to record')}
        </div>
      </section>
      <section className="panel"><h3>AI writing</h3>
        {bool('ai.writing', 'AI-written summaries for high and critical events (labelled; the data-driven text is always kept)')}
        <label className="field"><span>Reporting style</span><select value={s.ai.style} disabled={!owner} onChange={e => setS(setPath(s, 'ai.style', e.target.value))}><option value="balanced">Balanced — informative, some personality</option><option value="straight">Straight news</option><option value="lively">Lively broadcast</option></select></label>
      </section>
      <section className="panel"><h3>Graphics</h3>
        {bool('graphics.auto', 'Create graphics automatically for critical events (and high events in the chosen categories)')}
        <div className="cat-grid">{Object.keys(CATS).map(k => <label key={k} className="check"><input type="checkbox" disabled={!owner} checked={s.graphics.high.includes(k)} onChange={e => setS(setPath(s, 'graphics.high', e.target.checked ? [...s.graphics.high, k] : s.graphics.high.filter(x => x !== k)))} /> {CATS[k][0]}</label>)}</div>
      </section>
      {owner && <div className="actions-row sticky"><button className="btn" onClick={save}>Save settings</button>{msg && <span className="muted">{msg}</span>}</div>}
    </div>
  );
}

function Integrations({ owner }) {
  const { data, error, reload } = useLoad(() => get('admin', { action: 'integrations' }), []);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState(null);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const ai = data.credentials.anthropic;
  const save = async v => { try { await post('admin', 'credential', { id: 'anthropic', values: v }); setKey(''); setMsg(v ? 'Saved (encrypted).' : 'Removed.'); reload(); } catch (x) { setMsg(x.message); } };
  return (
    <div className="settings-body">
      <section className="panel"><h3>AI (Anthropic)</h3>
        <p>{ai.configured ? <span className="ok">Connected ({ai.from === 'environment' ? 'ANTHROPIC_API_KEY on the server' : 'saved here, encrypted'}).</span> : <span className="warn">Not connected — the feed uses its data-driven text only.</span>}</p>
        <p className="muted small">Needs an API key from console.anthropic.com, set as the ANTHROPIC_API_KEY environment variable in Vercel and GitHub Actions, or saved here (encrypted with a server-side key).</p>
        {owner && <form className="form inline" onSubmit={e => { e.preventDefault(); save({ apiKey: key }); }}><input type="password" placeholder="sk-ant-…" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" /><button className="btn" disabled={!key}>Save key</button>{ai.configured && ai.from !== 'environment' && <button type="button" className="btn ghost" onClick={() => save(null)}>Remove</button>}</form>}
        {msg && <p className="muted small">{msg}</p>}
      </section>
      <section className="panel"><h3>Data sources</h3>
        <table className="table"><thead><tr><th>Source</th><th>Role</th><th>Coverage & limits</th><th>This server</th></tr></thead>
          <tbody>{data.sources.map(s => <tr key={s.id} className={s.unavailable ? 'muted' : ''}><td><b>{s.name}</b>{s.key ? <><br /><small>needs {s.env}</small></> : null}</td><td>{s.role}</td><td>{s.coverage}<br /><small>{s.limits}</small></td>
            <td>{s.hosts.map(h => <div key={h.host} className="small">{h.host}: {h.lastOk ? `ok ${ago(h.lastOk)}` : 'no calls yet'}{h.lastError ? ` · last error ${ago(h.lastError.at)}` : ''}</div>)}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

function People() {
  const { data, error, reload } = useLoad(() => get('admin', { action: 'users' }), []);
  const [f, setF] = useState({ email: '', name: '', role: 'editor' });
  const [msg, setMsg] = useState(null);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const invite = async e => { e.preventDefault(); try { const r = await post('admin', 'invite', f); setMsg(`Created ${r.email}. Temporary password (shown once): ${r.temporaryPassword}`); reload(); } catch (x) { setMsg(x.message); } };
  const change = async (u, patch) => { await post('admin', 'user', { id: u._id, ...patch }); reload(); };
  return (
    <div className="settings-body">
      <section className="panel"><h3>Invite an editor</h3>
        <form className="form inline" onSubmit={invite}><input placeholder="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><input type="email" placeholder="Email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="editor">Editor</option><option value="fan">Fan</option></select><button className="btn">Add</button></form>
        {msg && <p className="small">{msg}</p>}
      </section>
      <table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>{data.map(u => <tr key={u._id} className={u.disabled ? 'muted' : ''}><td>{u.name}</td><td>{u.email}</td><td>{u.role === 'owner' ? 'owner' : <select value={u.role} onChange={e => change(u, { role: e.target.value })}><option value="editor">editor</option><option value="fan">fan</option></select>}</td>
          <td>{u.role !== 'owner' && <button className="linklike" onClick={() => change(u, { disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>}</td></tr>)}</tbody></table>
    </div>
  );
}

function Log() {
  const { data, error, reload } = useLoad(() => get('admin', { action: 'log' }), []);
  const [running, setRunning] = useState(false);
  const { data: status } = useLoad(() => get('admin', { action: 'status' }), [data]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const run = async () => { setRunning(true); try { await post('admin', 'tick'); } finally { setRunning(false); reload(); } };
  return (
    <div className="settings-body">
      <section className="panel">
        <p>Last check {data.lastTick?.at ? ago(data.lastTick.at) : 'never'}{status?.monitor ? ` · live monitor: ${status.monitor.state}${status.monitor.at ? ` (${ago(status.monitor.at)})` : ''}` : ''}.</p>
        <button className="btn" onClick={run} disabled={running}>{running ? 'Checking every game…' : 'Check every game now'}</button>
      </section>
      <ul className="log">{data.entries.map(l => <li key={l._id} className={`l-${l.level}`}><time>{new Date(l.at).toLocaleString()}</time><span>{l.message}</span></li>)}</ul>
    </div>
  );
}
