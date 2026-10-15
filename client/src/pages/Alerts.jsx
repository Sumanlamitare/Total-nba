import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, Field, Spinner, Empty, Modal, ago, useToast } from '../ui.jsx';

const ICON = { slack: '#', discord: '◆', ntfy: '📱', webhook: '{ }' };
const PLACE = {
  slack: 'https://hooks.slack.com/services/T000/B000/XXXX',
  discord: 'https://discord.com/api/webhooks/1234/abcd',
  ntfy: 'nightjar-ada-7f3k2q',
  webhook: 'https://example.com/hooks/nightjar',
};
const randomTopic = () => 'nightjar-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

function AddChannel({ kinds, onClose, onAdded }) {
  const toast = useToast();
  const [kind, setKind] = useState('slack');
  const [f, setF] = useState({ name: '', target: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setF(x => ({ ...x, target: kind === 'ntfy' ? randomTopic() : '' })); setErr(''); }, [kind]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('channels', { method: 'POST', body: { kind, ...f } }); toast(`${kinds[kind].name} connected`); onAdded(); onClose(); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <Modal title="Add an alert channel" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="kindpick" role="radiogroup">
          {Object.entries(kinds).map(([k, v]) => (
            <button type="button" role="radio" aria-checked={kind === k} key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><span>{ICON[k]}</span>{v.name}</button>
          ))}
        </div>
        <p className="muted small">{kinds[kind].help}</p>
        {kind === 'ntfy' && <ol className="howto">
          <li>Install <b>ntfy</b> (free) from the App Store or Google Play.</li>
          <li>Tap <b>+</b> and subscribe to the topic below — exactly as written.</li>
          <li>Save here, then press <b>Send test</b>.</li>
        </ol>}
        <Field label={kind === 'ntfy' ? 'Topic' : 'URL'}><input value={f.target} onChange={e => setF({ ...f, target: e.target.value })} placeholder={PLACE[kind]} spellCheck="false" autoCapitalize="off" /></Field>
        <Field label="Label (optional)"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={kind === 'slack' ? '#ops' : kind === 'ntfy' ? 'My phone' : ''} maxLength={60} /></Field>
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button kind="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Connect</Button></div>
      </form>
    </Modal>
  );
}

export default function Alerts() {
  const toast = useToast();
  const [d, setD] = useState(null), [adding, setAdding] = useState(false), [busy, setBusy] = useState('');
  const load = () => api('channels').then(setD, e => toast(e.message, 'bad'));
  useEffect(() => { load(); }, []);
  async function test(ch) {
    setBusy(ch.id);
    try { const r = await api(`channels?id=${ch.id}&action=test`, { method: 'POST', body: {} }); toast(r.ok ? 'Test alert sent — check it arrived' : `Failed: ${r.error}`, r.ok ? 'ok' : 'bad'); load(); }
    catch (e) { toast(e.message, 'bad'); }
    setBusy('');
  }
  async function remove(ch) {
    if (!confirm(`Remove ${ch.name}? It will stop receiving alerts.`)) return;
    try { await api(`channels?id=${ch.id}`, { method: 'DELETE' }); toast('Channel removed'); load(); } catch (e) { toast(e.message, 'bad'); }
  }
  if (!d) return <Spinner />;
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Alerts</h1><p className="muted">Every check alerts every channel here — once when it goes down, once when it recovers.</p></div>
        <Button onClick={() => setAdding(true)}>+ Add channel</Button>
      </div>
      {d.channels.length === 0 ? (
        <Empty title="No alert channels yet" action={<Button onClick={() => setAdding(true)}>Add your first channel</Button>}>
          Without a channel, checks still go down on the dashboard — but nobody gets told. Slack, Discord, phone push and webhooks are all free.
        </Empty>
      ) : (
        <div className="channels-list">
          {d.channels.map(ch => (
            <div key={ch.id} className="chan">
              <span className="chicon">{ICON[ch.kind]}</span>
              <div className="chmain">
                <b>{ch.name}</b>
                <small>{d.kinds[ch.kind]?.name} · <code>{ch.target}</code></small>
                <small className={ch.lastOk === false ? 'bad' : 'muted'}>{ch.lastAt ? (ch.lastOk ? `Last delivered ${ago(ch.lastAt)}` : `Last attempt failed ${ago(ch.lastAt)}: ${ch.lastError}`) : 'Not used yet'}</small>
              </div>
              <div className="row">
                <Button kind="ghost" className="sm" loading={busy === ch.id} onClick={() => test(ch)}>Send test</Button>
                <Button kind="ghost" className="sm" onClick={() => remove(ch)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <AddChannel kinds={d.kinds} onClose={() => setAdding(false)} onAdded={load} />}
    </div>
  );
}
