// Settings: time zone and cleanup, the graphic's brand bits, polling, the competition list, account, and the job log.
import React, { useEffect, useState } from 'react';
import { get, post, useLoad, when } from './api.js';
import { ErrorBox, Loading } from './ui.jsx';

const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['America/New_York', 'Europe/London', 'UTC']; } })();

export function Settings() {
  const { data, error, reload } = useLoad(() => get('admin', { action: 'settings' }), []);
  const [s, setS] = useState(null);
  const [comps, setComps] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (data) { setS(data.settings); setComps(data.competitions); } }, [data]);
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!s || !comps) return <Loading label="Loading settings" />;
  const set = (path, v) => setS(x => { const o = structuredClone(x); const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k]; t[ks.at(-1)] = v; return o; });
  const saveSettings = async () => { setMsg(null); try { const r = await post('admin', 'settings', { settings: s }); setS(r.settings); setMsg({ text: 'Settings saved.' }); } catch (e) { setMsg({ bad: true, text: e.message }); } };
  const saveComps = async list => { setMsg(null); try { const r = await post('admin', 'competitions', { list }); setComps(r.competitions); setMsg({ text: 'Competitions saved. The next schedule refresh uses them.' }); } catch (e) { setMsg({ bad: true, text: e.message }); } };
  const groups = [...new Set(comps.map(c => c.group))];
  return (
    <div className="page settings">
      <div className="page-head"><div><h1>Settings</h1><p className="muted">Changes apply to the next background check.</p></div></div>
      {msg && <div className={`notice ${msg.bad ? 'bad' : 'ok'}`}>{msg.text}</div>}
      <fieldset>
        <section className="card">
          <h2>Calendar and cleanup</h2>
          <label>App time zone <small>decides "today", "tomorrow" and when the automatic cleanup runs</small><select value={s.timezone} onChange={e => set('timezone', e.target.value)}>{ZONES.map(z => <option key={z}>{z}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={s.cleanup.auto} onChange={e => set('cleanup.auto', e.target.checked)} /> Delete completed match data automatically</label>
          <div className="two">
            <label>Minutes before the next day's first kickoff<input type="number" min="0" max="600" value={s.cleanup.beforeFirstKickoffMin} onChange={e => set('cleanup.beforeFirstKickoffMin', e.target.value)} /></label>
            <label>Fallback time when a day has no matches<input type="time" value={s.cleanup.fallbackTime} onChange={e => set('cleanup.fallbackTime', e.target.value)} /></label>
          </div>
          <label>Remove postponed / cancelled / abandoned matches after (hours past kickoff)<input type="number" min="1" max="240" value={s.cleanup.deletePostponedAfterHours} onChange={e => set('cleanup.deletePostponedAfterHours', e.target.value)} /></label>
        </section>
        <section className="card">
          <h2>Graphic</h2>
          <div className="two">
            <label>Accent colour<span className="color"><input type="color" value={s.graphics.accent} onChange={e => set('graphics.accent', e.target.value)} /><input value={s.graphics.accent} onChange={e => set('graphics.accent', e.target.value)} maxLength={7} /></span></label>
            <label>Handle<input value={s.graphics.handle} onChange={e => set('graphics.handle', e.target.value)} maxLength={40} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={s.graphics.showDate} onChange={e => set('graphics.showDate', e.target.checked)} /> Show the match date</label>
          <label className="check"><input type="checkbox" checked={s.graphics.useTeamColors} onChange={e => set('graphics.useTeamColors', e.target.checked)} /> Team-colour rule under each crest</label>
          <label className="check"><input type="checkbox" checked={s.graphics.playerOfGame} onChange={e => set('graphics.playerOfGame', e.target.checked)} /> Name a Player of the Game (picked from the goals: most goals, then the winning goal)</label>
          <label className="check"><input type="checkbox" checked={s.graphics.espnPhotos} onChange={e => set('graphics.espnPhotos', e.target.checked)} /> Use ESPN's match highlights still as the photo when there is one</label>
          <p className="muted small">ESPN's stills are frames from broadcast footage, owned by the broadcaster or ESPN — posting them may need permission. ESPN usually publishes them an hour or more after full time, so the app keeps looking for 3 hours. Many matches (especially internationals) never get one. You can always upload your own photo on a graphic instead.</p>
          <label>Keep graphics for (days, 0 = until deleted)<input type="number" min="0" max="365" value={s.graphics.retentionDays} onChange={e => set('graphics.retentionDays', e.target.value)} /></label>
          <p className="muted small">New graphics use these; "Regenerate" applies them to an existing one.</p>
        </section>
        <section className="card">
          <h2>Checking ESPN</h2>
          <div className="three">
            <label>Live check every (seconds)<input type="number" min="30" max="300" value={s.polling.liveEverySec} onChange={e => set('polling.liveEverySec', e.target.value)} /></label>
            <label>Schedule refresh every (minutes)<input type="number" min="30" max="720" value={s.polling.syncEveryMin} onChange={e => set('polling.syncEveryMin', e.target.value)} /></label>
            <label>Start watching before kickoff (minutes)<input type="number" min="0" max="60" value={s.polling.preKickoffMin} onChange={e => set('polling.preKickoffMin', e.target.value)} /></label>
          </div>
        </section>
        <div className="actions"><button type="button" className="primary" onClick={saveSettings}>Save settings</button></div>
        <section className="card">
          <h2>Competitions <small className="muted">{comps.filter(c => c.enabled).length} of {comps.length} watched · men's only</small></h2>
          {groups.map(gr => (
            <div key={gr} className="comp-group">
              <h3>{data.groups[gr] || gr}</h3>
              {comps.map((c, i) => c.group !== gr ? null : (
                <div key={c.code} className="comp-row">
                  <input type="checkbox" checked={c.enabled} onChange={e => setComps(l => l.map((x, k) => (k === i ? { ...x, enabled: e.target.checked } : x)))} aria-label={`Watch ${c.name}`} />
                  <input value={c.name} onChange={e => setComps(l => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label="Name" />
                  <code>{c.code}</code>
                  {c.group === 'custom' && <button type="button" className="link" onClick={() => setComps(l => l.filter((_, k) => k !== i))}>Remove</button>}
                </div>
              ))}
            </div>
          ))}
          <AddCompetition onAdd={c => setComps(l => [...l, c])} />
          <div className="actions wrap"><button type="button" className="primary" onClick={() => saveComps(comps)}>Save competitions</button><button type="button" className="ghost" onClick={() => { if (confirm('Restore the original 39 competitions?')) saveComps(data.defaultCompetitions); }}>Restore the original 39</button></div>
        </section>
      </fieldset>
      <Log />
    </div>
  );
}

function AddCompetition({ onAdd }) {
  const [code, setCode] = useState(''), [name, setName] = useState('');
  return (
    <div className="add-comp">
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="ESPN code, e.g. bel.1" aria-label="ESPN code" />
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name, e.g. Belgian Pro League" aria-label="Name" />
      <button type="button" className="ghost" disabled={!/^[a-z0-9_.]{2,60}$/.test(code.trim())} onClick={() => { onAdd({ code: code.trim(), name: name.trim() || code.trim(), group: 'custom', enabled: true }); setCode(''); setName(''); }}>Add</button>
      <p className="muted small">The code is the part of ESPN's soccer URLs after /soccer/ (women's competitions are ignored).</p>
    </div>
  );
}

function Log() {
  const { data, reload } = useLoad(() => get('admin', { action: 'log', limit: 60 }), [], { every: 60e3 });
  const { data: st } = useLoad(() => get('admin', { action: 'status' }), []);
  return (
    <section className="card">
      <h2>Activity <button type="button" className="link" onClick={() => reload()}>Refresh</button></h2>
      {st && <p className="muted small">Stored now: {st.counts.matches} matches (temporary) · {st.counts.graphics} graphics · {st.counts.logos} logos · {st.counts.processed} finished event ids (expire in 4 days)</p>}
      <ol className="log">{(data || []).map(l => <li key={l._id} className={`lv-${l.level}`}><time>{when(l.at)}</time>{l.message}</li>)}</ol>
    </section>
  );
}
