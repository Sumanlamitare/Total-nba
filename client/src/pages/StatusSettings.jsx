import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, Field, Spinner, Pill, Link, useToast } from '../ui.jsx';
import { useUser } from '../App.jsx';

export default function StatusSettings() {
  const toast = useToast();
  const { user, setUser } = useUser();
  const [f, setF] = useState({ slug: user.slug, pageTitle: user.pageTitle });
  const [checks, setChecks] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api('checks').then(d => setChecks(d.checks), e => setErr(e.message)); }, []);

  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('account', { method: 'PATCH', body: f }); setUser(r.user); toast('Status page saved'); }
    catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  async function toggle(c) {
    setChecks(cs => cs.map(x => (x.id === c.id ? { ...x, public: !c.public } : x)));
    try { await api(`checks?id=${c.id}`, { method: 'PATCH', body: { public: !c.public } }); }
    catch (e) { toast(e.message, 'bad'); setChecks(cs => cs.map(x => (x.id === c.id ? c : x))); }
  }
  const url = user.slug ? `${location.origin}/s/${user.slug}` : null;

  return (
    <div className="page">
      <div className="pagehead"><div><h1>Status page</h1><p className="muted">A public page showing the checks you choose — for customers, your team, or just you.</p></div>
        {url && <a className="btn ghost" href={url} target="_blank" rel="noreferrer">View page ↗</a>}</div>
      <section className="card">
        <form onSubmit={save} className="grid2">
          <Field label="Address" hint={`${location.host}/s/${f.slug || 'your-name'}`}>
            <div className="prefix"><span>/s/</span><input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="acme" maxLength={40} /></div>
          </Field>
          <Field label="Page title"><input value={f.pageTitle} onChange={e => setF({ ...f, pageTitle: e.target.value })} placeholder="Acme job status" maxLength={80} /></Field>
          {err && <p className="formerr span2">{err}</p>}
          <div className="row end span2"><Button type="submit" loading={busy}>Save</Button></div>
        </form>
      </section>
      <section className="card">
        <h2>Checks on the page</h2>
        {!checks ? <Spinner /> : checks.length === 0 ? <p className="muted">Create a check first, then choose whether it appears here.</p> : (
          <ul className="publist">
            {checks.map(c => (
              <li key={c.id}>
                <label className="toggle"><input type="checkbox" checked={c.public} onChange={() => toggle(c)} /><span><b>{c.name}</b></span></label>
                <Pill state={c.state} />
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Only names, states and uptime are shown. Ping URLs and notes stay private.</p>
        {!user.slug && <p className="small">Choose an address above to publish the page. <Link to="/docs#status">More about status pages</Link></p>}
      </section>
    </div>
  );
}
