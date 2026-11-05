// The app shell: top bar (brand, live game indicators, search, notifications, profile), left navigation, the page, and
// the right rail (top performances, live alerts, storylines).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, useLoad, useStream, useStreamStatus, useMe, loadMe, setMe, useRoute, go, can } from './api.js';
import { Link, Logo, Avatar, TeamLogo, CatChip } from './components.jsx';
import { FeedPage, EntryPage, GamePage, IntelPage, RecordsPage, RecordListPage, PerformancesPage, TeamsPage, TeamPage, PlayersPage, PlayerPage, SettingsPage, SignInPage } from './pages.jsx';
import { StudioPage, EditorPage } from './studio.jsx';

const NAV = [
  ['/', 'Live Feed', 'feed'], ['/intel', 'Game Intelligence', 'intel'], ['/records', 'Records & Milestones', 'records'], ['/performances', 'Top Performances', 'perf'],
  ['/teams', 'Teams', 'teams'], ['/players', 'Players', 'players'], ['/studio', 'Graphics Studio', 'studio'], ['/settings', 'Settings', 'settings'],
];
// Phone: the five most-used sections in a bottom tab bar (the rest are in Settings and search).
const TABS = [['/', 'Feed', 'feed'], ['/intel', 'Intel', 'intel'], ['/records', 'Records', 'records'], ['/performances', 'Top', 'perf'], ['/settings', 'More', 'settings']];
const ICON = {
  feed: <path d="M4 6h16M4 12h16M4 18h10" />, intel: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>, records: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4" /></>,
  perf: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />, teams: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.4 1.3-4.4 4-4.9" /></>,
  players: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>, studio: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="15.5" cy="8.5" r="1.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
};
const Icon = ({ name }) => <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{ICON[name]}</svg>;

function Ticker() {
  const { data, reload } = useLoad(() => get('feed', { action: 'ticker' }), []);
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);
  const games = data || [];
  if (!games.length) return <div className="ticker empty-ticker">{data ? 'No games today' : ''}</div>;
  const order = [...games].sort((a, b) => (b.live - a.live) || (a.status === 'final') - (b.status === 'final'));
  return (
    <div className="ticker" role="list" aria-label="Today's games">
      {order.map(g => (
        <Link key={g.id} to={`/games/${g.id}`} className={`tick ${g.live ? 'is-live' : ''}`} role="listitem">
          <span className="tick-teams">{g.teams.map((t, i) => <span key={i} className={t.winner ? 'won' : ''}><b>{t.abbr}</b>{g.status !== 'scheduled' && <em>{t.score}</em>}</span>)}</span>
          <span className="tick-clock">{g.live ? <><i className="dot" />{g.detail}</> : g.status === 'scheduled' ? new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : g.status === 'final' ? 'Final' : g.detail}</span>
        </Link>
      ))}
    </div>
  );
}

function Search() {
  const [term, setTerm] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (term.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => get('nba', { action: 'search', term }).then(setRes).catch(() => setRes(null)), 200);
    return () => clearTimeout(t);
  }, [term]);
  const pick = to => { setOpen(false); setTerm(''); go(to); };
  return (
    <div className="search" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input type="search" placeholder="Search players, teams, stories" value={term} onChange={e => setTerm(e.target.value)} aria-label="Search" />
      {open && res && (
        <div className="search-pop">
          {res.players.slice(0, 6).map(p => <button key={p.id} onMouseDown={() => pick(`/players/${p.id}`)}><Avatar src={p.headshot} name={p.name} size={28} /><span>{p.name}</span><small>{p.team || ''}</small></button>)}
          {res.teams.map(t => <button key={t.id} onMouseDown={() => pick(`/teams/${t.id}`)}><TeamLogo src={t.logo} abbr={t.abbr} size={24} /><span>{t.name}</span></button>)}
          {res.events.map(e => <button key={e._id} onMouseDown={() => pick(`/e/${encodeURIComponent(e._id)}`)}><CatChip cat={e.category} /><span>{e.headline}</span><small>{e.players?.[0]?.name || ''}</small></button>)}
          {res.records.map(r => <button key={r._id} onMouseDown={() => pick(`/records/${encodeURIComponent(r._id)}`)}><span className="chip c-orange">Record</span><span>{r.title}</span><small>{r.entries?.[0]?.name}</small></button>)}
          {!res.players.length && !res.teams.length && !res.events.length && !res.records.length && <p className="muted pad">Nothing found.</p>}
        </div>
      )}
    </div>
  );
}

// Notifications: critical entries, and entries about the user's favorites, that arrived while the app was open.
function Bell() {
  const { user } = useMe();
  const [items, setItems] = useState([]);
  const [seen, setSeen] = useState(() => { try { return +localStorage.getItem('atn-seen') || 0; } catch { return 0; } });
  const [open, setOpen] = useState(false);
  const favs = user?.prefs || {};
  useStream(e => {
    const fav = favs.teams?.some(t => e.teams?.includes(t)) || favs.players?.some(p => e.players?.some(x => x.id === p));
    if (e.level !== 'critical' && !fav) return;
    setItems(list => [e, ...list.filter(x => x._id !== e._id)].slice(0, 30));
    if (favs.notify?.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) new Notification(e.headline, { body: e.body, icon: '/favicon.svg', tag: e._id });
  });
  const unread = items.filter(i => i.seq > seen).length;
  const toggle = () => { setOpen(o => !o); if (!open && items[0]) { setSeen(items[0].seq); try { localStorage.setItem('atn-seen', items[0].seq); } catch { /* */ } } };
  return (
    <div className="bell">
      <button type="button" className="icon-btn" onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`} aria-expanded={open}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <div className="pop">
          <h4>Alerts</h4>
          {items.length ? items.map(e => <Link key={e._id} to={`/e/${encodeURIComponent(e._id)}`} className="pop-item" onClick={() => setOpen(false)}><CatChip cat={e.category} /><b>{e.headline}</b><span className="muted">{e.players?.[0]?.name || e.team?.name || ''}</span></Link>)
            : <p className="muted pad">Critical moments{user ? ' and stories about your favorites' : ''} show up here while the app is open.</p>}
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  if (!user) return <Link to="/signin" className="btn small">Sign in</Link>;
  return (
    <div className="profile">
      <button type="button" className="icon-btn me" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Account"><span className="me-initial">{user.name?.[0]?.toUpperCase() || '?'}</span></button>
      {open && (
        <div className="pop" onClick={() => setOpen(false)}>
          <p className="pad"><b>{user.name}</b><br /><span className="muted small">{user.email} · {user.role}</span></p>
          <Link to="/settings" className="pop-item">Preferences</Link>
          {can(user, 'editor') && <Link to="/studio" className="pop-item">Graphics Studio</Link>}
          <button type="button" className="pop-item" onClick={async () => { await post('admin', 'logout'); setMe(null); go('/'); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function Rail() {
  const { data, reload } = useLoad(() => get('feed', { action: 'rail' }), []);
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);
  useStream(e => { if (e.level === 'critical' || e.status === 'developing') reload(); });
  if (!data) return <aside className="rail" aria-label="Highlights" />;
  return (
    <aside className="rail" aria-label="Highlights">
      <section className="panel">
        <h4><Link to="/performances">Top Performances</Link></h4>
        {data.performances.length ? data.performances.map(p => (
          <Link key={p.id} to={`/players/${p.pid}`} className="rail-perf">
            <Avatar src={p.headshot} name={p.name} color={p.team?.color} size={40} />
            <span><b>{p.name}</b>{p.potn && <span className="chip c-gold tiny">POTN</span>}<br /><span className="muted small">{p.line}</span></span>
            <span className="muted small">{p.team?.abbr}</span>
          </Link>
        )) : <p className="muted small">The night's best performances appear once games are under way.</p>}
      </section>
      <section className="panel">
        <h4><Link to="/intel">Game Intelligence</Link></h4>
        {data.live.length === 0 && data.alerts.length === 0 && <p className="muted small">No live alerts right now.</p>}
        {data.live.map(g => <Link key={g.id} to={`/games/${g.id}`} className="rail-alert"><span className="chip live"><i className="dot" />{g.situation.label}</span><span>{g.situation.score}</span><span className="muted small">{g.detail}</span></Link>)}
        {data.alerts.map(e => <Link key={e._id} to={`/e/${encodeURIComponent(e._id)}`} className="rail-alert"><CatChip cat={e.category} /><span>{e.headline}</span><span className="muted small">{e.game?.moment || ''}</span></Link>)}
      </section>
      <section className="panel">
        <h4>Trending storylines</h4>
        {data.storylines.length ? data.storylines.map(s => (
          <Link key={s.key} to={s.link} className="rail-story">
            {s.img ? <Avatar src={s.img} name={s.name} size={32} square={s.key.startsWith('t:')} /> : null}
            <span><b>{s.name}</b><br /><span className="muted small">{s.headlines.join(' · ')}</span></span>
          </Link>
        )) : <p className="muted small">Storylines build up as the night goes on.</p>}
      </section>
    </aside>
  );
}

function Shell({ children, wide }) {
  const route = useRoute();
  const status = useStreamStatus();
  const path = route.split('?')[0];
  const active = to => (to === '/' ? path === '/' : path.startsWith(to));
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Around the NBA, home"><Logo /><span className="brand-name">AROUND <em>THE</em> NBA</span></Link>
        <Ticker />
        <Search />
        <span className={`conn conn-${status}`} title={status === 'live' ? 'Connected: new events arrive on their own' : 'Reconnecting…'}><i className="dot" /></span>
        <Bell />
        <Profile />
      </header>
      <div className={`layout ${wide ? 'wide' : ''}`}>
        <nav className="sidenav" aria-label="Sections">
          {NAV.map(([to, label, icon]) => <Link key={to} to={to} className={`nav-item ${active(to) ? 'on' : ''}`} aria-current={active(to) ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></Link>)}
          <p className="nav-foot muted small">Data: ESPN, verified against NBA.com. Not affiliated with the NBA.</p>
        </nav>
        <main className="main">{children}</main>
        {!wide && <Rail />}
      </div>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([to, label, icon]) => <Link key={to} to={to} className={active(to) ? 'on' : ''} aria-current={active(to) ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></Link>)}
      </nav>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  useEffect(() => { loadMe(); }, []);
  const path = route.split('?')[0];
  const m = (re) => path.match(re);
  let page, wide = false, title = 'Live Feed';
  if (path === '/') page = <FeedPage />;
  else if (m(/^\/e\/(.+)$/)) { page = <EntryPage id={decodeURIComponent(m(/^\/e\/(.+)$/)[1])} />; title = 'Event'; }
  else if (m(/^\/games\/(\d+)$/)) { page = <GamePage id={m(/^\/games\/(\d+)$/)[1]} />; title = 'Game'; }
  else if (path === '/intel') { page = <IntelPage />; title = 'Game Intelligence'; }
  else if (path === '/records') { page = <RecordsPage />; title = 'Records & Milestones'; }
  else if (m(/^\/records\/(.+)$/)) { page = <RecordListPage id={decodeURIComponent(m(/^\/records\/(.+)$/)[1])} />; title = 'Record'; }
  else if (path === '/performances') { page = <PerformancesPage />; title = 'Top Performances'; }
  else if (path === '/teams') { page = <TeamsPage />; title = 'Teams'; }
  else if (m(/^\/teams\/(\d+)$/)) { page = <TeamPage id={m(/^\/teams\/(\d+)$/)[1]} />; title = 'Team'; }
  else if (path === '/players') { page = <PlayersPage />; title = 'Players'; }
  else if (m(/^\/players\/(\d+)$/)) { page = <PlayerPage id={m(/^\/players\/(\d+)$/)[1]} />; title = 'Player'; }
  else if (path === '/studio') { page = <StudioPage />; wide = true; title = 'Graphics Studio'; }
  else if (m(/^\/studio\/(.+)$/)) { page = <EditorPage id={m(/^\/studio\/(.+)$/)[1]} />; wide = true; title = 'Editor'; }
  else if (path === '/settings') { page = <SettingsPage />; title = 'Settings'; }
  else if (path === '/signin') { page = <SignInPage />; title = 'Sign in'; }
  else page = <div className="empty"><h3>Not found</h3><p><Link to="/">Back to the live feed</Link></p></div>;
  useEffect(() => { document.title = `${title} · Around the NBA`; }, [title]);
  return <Shell wide={wide}>{page}</Shell>;
}
