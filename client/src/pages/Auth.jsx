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

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('auth', { method: 'POST', body: { action: mode, ...f } });
      setUser(r.user);
      navigate(next && next.startsWith('/app') ? next : signup ? '/app?welcome=1' : '/app');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div className="authpage">
      <div className="authcard">
        <Logo />
        <h1>{signup ? 'Watch your first job in two minutes' : 'Welcome back'}</h1>
        <p className="sub">{signup ? 'Free during the beta. No card needed.' : 'Log in to your checks.'}</p>
        <form onSubmit={submit} noValidate>
          {signup && <Field label="Your name"><input value={f.name} onChange={set('name')} autoComplete="name" placeholder="Ada Lovelace" /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required placeholder="you@company.com" /></Field>
          <Field label="Password" hint={signup ? 'At least 8 characters' : null}>
            <input type="password" value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={8} />
          </Field>
          {err && <p className="formerr" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="block lg">{signup ? 'Create account' : 'Log in'}</Button>
        </form>
        <p className="switch">
          {signup ? <>Already have an account? <Link to={'/login' + location.search}>Log in</Link></> : <>New to Nightjar? <Link to={'/signup' + location.search}>Create an account</Link></>}
        </p>
      </div>
      <p className="authfoot"><Link to="/">← Back to Nightjar</Link></p>
    </div>
  );
}
