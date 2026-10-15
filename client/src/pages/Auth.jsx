import { useState } from 'react';
import { api } from '../api.js';
import { Link, Logo, Button, Field, navigate } from '../ui.jsx';
import { useUser } from '../App.jsx';

export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const { setUser } = useUser();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const next = new URLSearchParams(location.search).get('next');
  const safeNext = next && /^\/(home|g\/|game\/|join\/|account)/.test(next) ? next : '/home';

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('auth', { method: 'POST', body: { action: mode, ...f } });
      setUser(r.user); navigate(safeNext);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <div className="center-page">
      <div className="card narrow">
        <Logo />
        <h1>{signup ? 'Get in the game' : 'Welcome back'}</h1>
        <p className="muted">{signup ? 'Free, and takes about 20 seconds.' : 'Log in to see your games.'}</p>
        <form onSubmit={submit} className="stack" noValidate>
          {signup && <Field label="Your name" hint="What your group will see"><input value={f.name} onChange={set('name')} autoComplete="name" placeholder="Marcus Bell" maxLength={40} /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@email.com" /></Field>
          <Field label="Password" hint={signup ? 'At least 8 characters' : null}><input type="password" value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} /></Field>
          {err && <p className="formerr" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="block lg">{signup ? 'Create account' : 'Log in'}</Button>
        </form>
        <p className="switch">{signup
          ? <>Already have an account? <Link to={'/login' + location.search}>Log in</Link></>
          : <>New here? <Link to={'/signup' + location.search}>Create an account</Link></>}</p>
      </div>
    </div>
  );
}
