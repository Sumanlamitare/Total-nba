import { useState } from 'react';
import { api } from '../api.js';
import { Button, Field, Modal, Avatar, navigate, useToast } from '../ui.jsx';
import { useUser } from '../App.jsx';

export default function Account() {
  const toast = useToast(), { user, setUser } = useUser();
  const [name, setName] = useState(user.name), [savingName, setSN] = useState(false);
  const [pw, setPw] = useState({ current: '', password: '' }), [pwErr, setPwErr] = useState(''), [savingPw, setSP] = useState(false);
  const [del, setDel] = useState(false), [delPw, setDelPw] = useState(''), [delErr, setDelErr] = useState(''), [deleting, setDeleting] = useState(false);

  async function saveName(e) {
    e.preventDefault(); setSN(true);
    try { const r = await api('auth', { method: 'PATCH', body: { name } }); setUser(r.user); toast('Name updated everywhere'); } catch (e2) { toast(e2.message, 'bad'); }
    setSN(false);
  }
  async function changePw(e) {
    e.preventDefault(); setSP(true); setPwErr('');
    try { await api('auth', { method: 'POST', body: { action: 'password', ...pw } }); setPw({ current: '', password: '' }); toast('Password changed. Other devices were signed out.'); }
    catch (e2) { setPwErr(e2.message); }
    setSP(false);
  }
  async function logout() {
    await api('auth', { method: 'POST', body: { action: 'logout' } }).catch(() => {});
    setUser(null); navigate('/');
  }
  async function deleteAccount(e) {
    e.preventDefault(); setDeleting(true); setDelErr('');
    try { await api('auth', { method: 'DELETE', body: { password: delPw } }); setUser(null); navigate('/'); }
    catch (e2) { setDelErr(e2.message); setDeleting(false); }
  }

  return (
    <div className="page">
      <div className="grouphead"><Avatar name={user.name} size={56} /><div><h1>{user.name}</h1><p className="muted">{user.email}</p></div></div>
      <form onSubmit={saveName} className="card stack">
        <h3>Your name</h3>
        <Field label="Name" hint="Shown to your groups"><input value={name} onChange={e => setName(e.target.value)} maxLength={40} /></Field>
        <div className="row end"><Button type="submit" loading={savingName} disabled={!name.trim() || name === user.name}>Save</Button></div>
      </form>
      <form onSubmit={changePw} className="card stack">
        <h3>Password</h3>
        <div className="grid2">
          <Field label="Current password"><input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" /></Field>
        </div>
        {pwErr && <p className="formerr">{pwErr}</p>}
        <div className="row end"><Button type="submit" loading={savingPw} disabled={!pw.current || !pw.password}>Change password</Button></div>
      </form>
      <div className="row"><Button kind="ghost" onClick={logout}>Log out</Button><Button kind="ghost" className="dangertext" onClick={() => setDel(true)}>Delete account</Button></div>
      {del && (
        <Modal title="Delete your account?" onClose={() => setDel(false)} width={440}>
          <form onSubmit={deleteAccount} className="stack">
            <p>You'll leave all your groups and your answers will be removed. Groups you own alone are deleted too.</p>
            <Field label="Password"><input type="password" value={delPw} onChange={e => setDelPw(e.target.value)} autoComplete="current-password" /></Field>
            {delErr && <p className="formerr">{delErr}</p>}
            <div className="row end"><Button kind="ghost" type="button" onClick={() => setDel(false)}>Cancel</Button><Button kind="danger" type="submit" loading={deleting} disabled={!delPw}>Delete account</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
