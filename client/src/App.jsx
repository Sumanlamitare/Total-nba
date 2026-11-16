import React from 'react';
import { useRoute, go, useLoad, get, ago } from './api.js';
import { Dashboard } from './dashboard.jsx';
import { Completed } from './completed.jsx';
import { Graphics, GraphicPage } from './graphics.jsx';
import { Settings } from './settings.jsx';

export const Link = ({ to, children, className, ...rest }) => (
  <a href={to} className={className} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>
);

export const Mark = ({ size = 34 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="mark">
    <rect width="64" height="64" rx="14" fill="#15171c" />
    <circle cx="32" cy="32" r="20" fill="none" stroke="var(--accent)" strokeWidth="5" />
    <text x="32" y="40" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="900" fontSize="22" fill="#fff">90</text>
  </svg>
);

const NAV = [['/', 'Matches'], ['/completed', 'Completed'], ['/graphics', 'Graphics'], ['/settings', 'Settings']];

function Shell({ children, path }) {
  const { data } = useLoad(() => get('admin', { action: 'status' }), [], { every: 60e3 });
  const workerSeen = data?.jobs?.worker;
  const fresh = workerSeen && Date.now() - new Date(workerSeen) < 5 * 60e3;
  const active = to => (to === '/' ? path === '/' : path.startsWith(to));
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand" aria-label="Football Past 90, matches"><Mark /><span className="brand-text"><b>FOOTBALL PAST 90</b><small>Full-time graphics · @footballpast90</small></span></Link>
        <nav className="tabs" aria-label="Sections">
          {NAV.map(([to, label]) => <Link key={to} to={to} className={active(to) ? 'on' : ''} aria-current={active(to) ? 'page' : undefined}>{label}</Link>)}
        </nav>
        <span className={`beat ${fresh ? 'ok' : ''}`} title={workerSeen ? `Background worker last seen ${ago(workerSeen)}` : 'Background worker not seen yet: the app checks matches itself while it is open'}><i />{fresh ? 'Monitoring' : 'Worker idle'}</span>
      </header>
      <main className="main">{children}</main>
      <nav className="bottom-tabs" aria-label="Sections">
        {NAV.map(([to, label]) => <Link key={to} to={to} className={active(to) ? 'on' : ''}>{label}</Link>)}
      </nav>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const path = route.split('?')[0];
  let page;
  const g = path.match(/^\/graphics\/(\d+)$/);
  if (path === '/') page = <Dashboard />;
  else if (path === '/completed') page = <Completed />;
  else if (g) page = <GraphicPage id={g[1]} />;
  else if (path === '/graphics') page = <Graphics />;
  else if (path === '/settings') page = <Settings />;
  else page = <div className="empty"><h2>Not found</h2><Link to="/">Back to matches</Link></div>;
  return <Shell path={path}>{page}</Shell>;
}
