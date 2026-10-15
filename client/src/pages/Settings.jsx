import { useState } from 'react';
import { api } from '../api.js';
import { Button, Field, Modal, Link, navigate, useToast } from '../ui.jsx';
import { useUser } from '../App.jsx';

export default function Settings() {
  const toast = useToast();
  const { user, setUser } = useUser();
  const [name, setName] = useState(user.name), [savingName, setSN] = useState(false);
  const [pw, setPw] = useState({ current: '', password: '' }), [pwErr, setPwErr] = useState(''), [savingPw, setSP] = useState(false);
  const [del, setDel] = useState(false), [delPw, setDelPw] = useState(''), [delErr, setDelErr] = useState(''), [deleting, setDeleting] = useState(false);

  async function saveName(e) {
    e.preventDefault(); setSN(true);
    try { const r = await api('account', { method: 'PATCH', body: { name } }); setUser(r.user); toast('Saved'); } catch (e2) { toast(e2.message, 'bad'); }
    setSN(false);
  }
  async function changePw(e) {
    e.preventDefault(); setSP(true); setPwErr('');
    try { await api('auth', { method: 'POST', body: { action: 'password', ...pw } }); setPw({ current: '', password: '' }); toast('Password changed. Other devices were signed out.'); }
    catch (e2) { setPwErr(e2.message); }
    setSP(false);
  }
  async function deleteAccount(e) {
    e.preventDefault(); setDeleting(true); setDelErr('');
    try { await api('account', { method: 'DELETE', body: { password: delPw } }); setUser(null); navigate('/'); }
    catch (e2) { setDelErr(e2.message); setDeleting(false); }
  }

  return (
    <div className="page">
      <div className="pagehead"><div><h1>Settings</h1><p className="muted">{user.email}</p></div></div>

      <section className="card">
        <h2>Profile</h2>
        <form onSubmit={saveName} className="inline">
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></Field>
          <Button type="submit" loading={savingName} disabled={name === user.name}>Save</Button>
        </form>
      </section>

      <section className="card">
        <h2>Plan</h2>
        <div className="planbox">
          <div><b>Free</b> <span className="tag">beta</span><p className="muted small">20 checks · 3 alert channels · status page & badges</p></div>
          <Link to="/pricing" className="btn ghost sm">Compare plans</Link>
        </div>
        <p className="muted small">Paid plans open after the beta. Nothing you set up now will be taken away.</p>
      </section>

      <section className="card">
        <h2>Password</h2>
        <form onSubmit={changePw} className="grid2">
          <Field label="Current password"><input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" /></Field>
          {pwErr && <p className="formerr span2">{pwErr}</p>}
          <div className="row end span2"><Button type="submit" loading={savingPw} disabled={!pw.current || !pw.password}>Change password</Button></div>
        </form>
      </section>

      <section className="card danger">
        <h2>Delete account</h2>
        <div className="dangerrow"><p className="muted small">Deletes your account, every check and its history, and your alert channels. This can't be undone.</p><Button kind="danger" onClick={() => setDel(true)}>Delete account</Button></div>
      </section>

      {del && (
        <Modal title="Delete your account?" onClose={() => setDel(false)} width={440}>
          <form onSubmit={deleteAccount} className="stack">
            <p>Everything will be deleted immediately. Enter your password to confirm.</p>
            <Field label="Password"><input type="password" value={delPw} onChange={e => setDelPw(e.target.value)} autoComplete="current-password" /></Field>
            {delErr && <p className="formerr">{delErr}</p>}
            <div className="row end"><Button kind="ghost" type="button" onClick={() => setDel(false)}>Cancel</Button><Button kind="danger" type="submit" loading={deleting} disabled={!delPw}>Delete everything</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
