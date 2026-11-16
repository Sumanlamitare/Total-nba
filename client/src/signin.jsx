import React, { useState } from 'react';
import { post, setMe, go } from './api.js';
import { Mark } from './App.jsx';

export function SignIn({ setupNeeded }) {
  const [f, setF] = useState({ code: '', name: '', email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await post('admin', setupNeeded ? 'setup' : 'login', f); setMe(r.user); go('/'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const field = (k, label, type = 'text', auto) => <label>{label}<input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} autoComplete={auto} required /></label>;
  return (
    <div className="signin">
      <form onSubmit={submit} className="card">
        <div className="brand big"><Mark size={48} /><span className="brand-text"><b>FOOTBALL PAST 90</b><small>Full-time graphics · @footballpast90</small></span></div>
        <h1>{setupNeeded ? 'Set up' : 'Sign in'}</h1>
        {setupNeeded && <p className="muted">Create the owner account with the setup code.</p>}
        {setupNeeded && field('code', 'Setup code', 'text', 'off')}
        {setupNeeded && field('name', 'Your name', 'text', 'name')}
        {field('email', 'Email', 'email', 'username')}
        {field('password', setupNeeded ? 'Password (10+ characters)' : 'Password', 'password', setupNeeded ? 'new-password' : 'current-password')}
        {err && <p className="err">{err}</p>}
        <button className="primary wide" disabled={busy}>{busy ? 'One moment…' : setupNeeded ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>
  );
}
