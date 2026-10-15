import { useState } from 'react';
import { api } from '../api.js';
import { Link, Logo, navigate } from '../ui.jsx';
import { useUser } from '../App.jsx';

const NAV = [
  ['/app', 'Checks', 'M4 12h4l3-7 4 14 3-7h2'],
  ['/app/alerts', 'Alerts', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4'],
  ['/app/status-page', 'Status page', 'M4 5h16v14H4zM4 9h16M8 13h3M8 16h6'],
  ['/app/settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z'],
];

export default function Shell({ path, children }) {
  const { user, setUser } = useUser();
  const [open, setOpen] = useState(false);
  const active = to => (to === '/app' ? path === '/app' || path === '/app/' || path.startsWith('/app/checks') : path.startsWith(to));
  async function logout() {
    await api('auth', { method: 'POST', body: { action: 'logout' } }).catch(() => {});
    setUser(null); navigate('/');
  }
  return (
    <div className="shell">
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="sidetop"><Logo to="/app" /><button className="menu" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><span /><span /><span /></button></div>
        <nav onClick={() => setOpen(false)}>
          {NAV.map(([to, label, d]) => (
            <Link key={to} to={to} className={active(to) ? 'on' : ''}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {label}
            </Link>
          ))}
          <Link to="/docs" className="sub">Docs ↗</Link>
        </nav>
        <div className="me">
          <div><b>{user.name || user.email.split('@')[0]}</b><small>{user.email}</small></div>
          <button className="btn ghost sm" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
