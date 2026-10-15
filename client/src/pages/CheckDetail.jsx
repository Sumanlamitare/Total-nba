import { useCallback, useEffect, useState } from 'react';
import { api, pingUrl, badgeUrl } from '../api.js';
import { Link, Pill, Button, Field, CopyField, Code, Spinner, Modal, every, human, ago, when, dur, useNow, navigate, useToast } from '../ui.jsx';
import { SnippetTabs } from './Docs.jsx';
import { Duration, PERIODS, GRACES } from './Checks.jsx';

const KIND = { success: ['Success', 'ok'], start: ['Started', 'info'], fail: ['Failed', 'bad'], log: ['Log', 'muted'] };

export default function CheckDetail({ id }) {
  const toast = useToast();
  const [d, setD] = useState(null), [err, setErr] = useState('');
  const [busy, setBusy] = useState(''), [confirm, setConfirm] = useState(null);
  const now = useNow(5000);
  const load = useCallback(() => api(`checks?id=${id}`).then(setD, e => setErr(e.message)), [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  async function act(action, msg) {
    setBusy(action);
    try {
      const r = await api(`checks?id=${id}&action=${action}`, { method: 'POST', body: {} });
      if (action === 'test') {
        const bad = r.results.filter(x => !x.ok);
        toast(bad.length ? `${bad.length} of ${r.results.length} channels failed: ${bad[0].error}` : `Test sent to ${r.results.length} channel${r.results.length > 1 ? 's' : ''}`, bad.length ? 'bad' : 'ok');
      } else { toast(msg); await load(); }
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(''); setConfirm(null);
  }
  async function remove() {
    setBusy('delete');
    try { await api(`checks?id=${id}`, { method: 'DELETE' }); toast('Check deleted'); navigate('/app'); }
    catch (e) { toast(e.message, 'bad'); setBusy(''); }
  }

  if (err) return <div className="page"><p className="formerr">{err}</p><Link to="/app">← All checks</Link></div>;
  if (!d) return <Spinner />;
  const c = d.check, url = pingUrl(c.key);
  const deadline = c.lastPing && c.state !== 'paused' && c.state !== 'down' ? new Date(+new Date(c.lastPing) + (c.period + c.grace) * 1000) : null;

  return (
    <div className="page detail">
      <Link to="/app" className="back">← All checks</Link>
      <div className="pagehead">
        <div>
          <h1>{c.name} <Pill state={c.state} big /></h1>
          <p className="muted">Runs {every(c.period)} · alerts after {human(c.period + c.grace)} without a ping{c.tags.map(t => <span key={t} className="tag">#{t}</span>)}</p>
        </div>
        <div className="row">
          {c.paused
            ? <Button kind="ghost" loading={busy === 'resume'} onClick={() => act('resume', 'Monitoring resumed')}>Resume</Button>
            : <Button kind="ghost" loading={busy === 'pause'} onClick={() => act('pause', 'Paused — no alerts until resumed or pinged')}>Pause</Button>}
          <Button kind="ghost" loading={busy === 'test'} onClick={() => act('test')}>Send test alert</Button>
        </div>
      </div>

      {c.state === 'new' ? (
        <section className="card onboard">
          <div className="pulse" aria-hidden="true" />
          <h2>Waiting for the first ping…</h2>
          <p>Call this URL at the end of your job. This page updates on its own when the ping arrives.</p>
          <CopyField value={url} />
          <SnippetTabs url={url} />
          <p className="muted small">Try it now from a terminal: <code>curl {url}</code></p>
        </section>
      ) : (
        <>
          <section className="stats">
            <div><small>Last ping</small><b>{ago(c.lastPing, now)}</b><span>{when(c.lastPing)}</span></div>
            <div><small>Alert if no ping by</small><b>{deadline ? (deadline > now ? ago(deadline, now) : 'any moment') : '—'}</b><span>{deadline ? when(deadline) : c.state === 'paused' ? 'Paused' : c.state === 'down' ? 'Already down' : ''}</span></div>
            <div><small>Last run time</small><b>{dur(c.lastDuration)}</b><span>{c.lastDuration == null ? 'Ping /start to measure' : 'start → finish'}</span></div>
            <div><small>Uptime, 30 days</small><b>{c.uptime30 == null ? '—' : (c.uptime30 * 100).toFixed(c.uptime30 > 0.999 ? 1 : 2) + '%'}</b><span>{c.nPings} pings total</span></div>
          </section>
          <section className="card">
            <h2>Ping URL</h2>
            <CopyField value={url} />
            <details className="more"><summary>Examples: cron, bash, Python, Node, GitHub Actions…</summary><SnippetTabs url={url} /></details>
          </section>
        </>
      )}

      <div className="cols">
        <section className="card">
          <h2>Recent pings</h2>
          {d.pings.length === 0 ? <p className="muted">No pings yet.</p> : (
            <div className="tablewrap"><table className="pings">
              <thead><tr><th>When</th><th>Event</th><th>Run time</th><th>From</th></tr></thead>
              <tbody>{d.pings.slice(0, 50).map((p, i) => (
                <tr key={i}>
                  <td title={new Date(p.at).toISOString()}>{when(p.at)}</td>
                  <td><span className={'ev ' + KIND[p.kind][1]}>{KIND[p.kind][0]}</span>{p.body && <details className="pbody"><summary>output</summary><pre>{p.body}</pre></details>}</td>
                  <td>{dur(p.dur)}</td>
                  <td className="ua" title={p.ua}>{p.ua ? p.ua.split(' ')[0] : '—'}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </section>
        <section className="card">
          <h2>History</h2>
          {d.flips.length === 0 ? <p className="muted">No status changes yet.</p> : (
            <ul className="flips">{d.flips.slice(0, 15).map((f, i) => <li key={i}><Pill state={f.to} /><span>{when(f.at)}</span></li>)}</ul>
          )}
          {d.alerts.length > 0 && <>
            <h3>Alerts sent</h3>
            <ul className="flips">{d.alerts.slice(0, 10).map((a, i) => <li key={i}><span>{a.event === 'down' ? '🔴 Down' : '🟢 Up'} → {a.sent} channel{a.sent === 1 ? '' : 's'}{a.failed ? `, ${a.failed} failed` : ''}</span><span>{when(a.at)}</span></li>)}</ul>
          </>}
          {d.alerts.length === 0 && <p className="muted small">Alerts go to every channel under <Link to="/app/alerts">Alerts</Link>.</p>}
        </section>
      </div>

      <Settings c={c} onSaved={load} />

      <section className="card">
        <h2>Badge</h2>
        <p className="muted">A live status image for READMEs and wikis. It shows the name and state only.</p>
        <div className="badgeprev"><img src={badgeUrl(c.badge)} alt={`${c.name} status badge`} height="20" /></div>
        <Code lang="md">{`![${c.name}](${badgeUrl(c.badge)})`}</Code>
      </section>

      <section className="card danger">
        <h2>Danger zone</h2>
        <div className="dangerrow"><div><b>New ping URL</b><p className="muted small">If the URL leaked. The old one stops working immediately — update your jobs.</p></div><Button kind="ghost" onClick={() => setConfirm('rotate')}>Change URL</Button></div>
        <div className="dangerrow"><div><b>Delete this check</b><p className="muted small">Its history goes with it. Pings to its URL will return 404.</p></div><Button kind="danger" onClick={() => setConfirm('delete')}>Delete</Button></div>
      </section>

      {confirm && (
        <Modal title={confirm === 'delete' ? `Delete “${c.name}”?` : 'Change the ping URL?'} onClose={() => setConfirm(null)} width={440}>
          <p>{confirm === 'delete' ? 'This removes the check and all of its history. It cannot be undone.' : 'Your jobs will need the new URL. Until they have it, their pings will fail and the check will go down.'}</p>
          <div className="row end">
            <Button kind="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm === 'delete'
              ? <Button kind="danger" loading={busy === 'delete'} onClick={remove}>Delete check</Button>
              : <Button loading={busy === 'rotate'} onClick={() => act('rotate', 'New ping URL created')}>Change URL</Button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Settings({ c, onSaved }) {
  const toast = useToast();
  const init = { name: c.name, desc: c.desc, tags: c.tags.join(', '), period: c.period, grace: c.grace, public: c.public };
  const [f, setF] = useState(init), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api(`checks?id=${c.id}`, { method: 'PATCH', body: f }); toast('Saved'); await onSaved(); }
    catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  return (
    <section className="card">
      <h2>Settings</h2>
      <form onSubmit={save} className="grid2">
        <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
        <Field label="Tags" hint="Comma separated"><input value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} /></Field>
        <Field label="Runs every"><Duration value={f.period} presets={PERIODS} onChange={p => setF({ ...f, period: p })} /></Field>
        <Field label="Grace time"><Duration value={f.grace} presets={GRACES} onChange={g => setF({ ...f, grace: g })} /></Field>
        <Field label="Notes (optional)" hint="What to do when it fails, who owns it…"><textarea rows="2" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} maxLength={500} /></Field>
        <label className="toggle"><input type="checkbox" checked={f.public} onChange={e => setF({ ...f, public: e.target.checked })} /><span><b>Show on my public status page</b><small>Name and state only. Set the page up under <Link to="/app/status-page">Status page</Link>.</small></span></label>
        {err && <p className="formerr span2">{err}</p>}
        <div className="row end span2"><Button type="submit" loading={busy} disabled={!dirty}>Save changes</Button></div>
      </form>
    </section>
  );
}
