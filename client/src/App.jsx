// The app shell: top bar (brand, live game tiles, search, notifications, profile), left column (live status,
// navigation, today's storylines, brand), the page, and the right rail (top performances, Game Intelligence, trending).
import React, { useEffect, useState } from 'react';
import { get, post, useLoad, useStream, useStreamStatus, useMe, loadMe, setMe, useRoute, go, can } from './api.js';
import { Link, Logo, Wordmark, Avatar, TeamLogo, CatChip } from './components.jsx';
import { FeedPage, EntryPage, GamePage, IntelPage, RecordsPage, RecordListPage, PerformancesPage, TeamsPage, TeamPage, PlayersPage, PlayerPage, SettingsPage, SignInPage } from './pages.jsx';
import { StudioPage, EditorPage } from './studio.jsx';

const NAV = [
  ['/', 'Live Feed', 'feed'], ['/intel', 'Game Intelligence', 'intel'], ['/records', 'Records & Milestones', 'records'], ['/performances', 'Top Performances', 'perf'],
  ['/teams', 'Teams', 'teams'], ['/players', 'Players', 'players'], ['/studio', 'Graphics Studio', 'studio'], ['/settings', 'Settings', 'settings'],
];
// Phone: the five most-used sections in a bottom tab bar.
const TABS = [['/', 'Feed', 'feed'], ['/intel', 'Intel', 'intel'], ['/records', 'Records', 'records'], ['/performances', 'Top', 'perf'], ['/settings', 'More', 'settings']];
const ICON = {
  feed: <><circle cx="12" cy="12" r="2.2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>,
  intel: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  records: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4" /></>,
  perf: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  teams: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  players: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.4 1.3-4.4 4-4.9" /></>,
  studio: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="15.5" cy="8.5" r="1.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  flame: <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1 3 2 3.5C11 9 11 5.5 12 2z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
};
const Icon = ({ name }) => <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{ICON[name]}</svg>;
const etNow = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

function useTicker() {
  const t = useLoad(() => get('feed', { action: 'ticker' }), []);
  useEffect(() => { const i = setInterval(t.reload, 20000); return () => clearInterval(i); }, [t.reload]);
  return t.data;
}
function useRail() {
  const r = useLoad(() => get('feed', { action: 'rail' }), []);
  useEffect(() => { const i = setInterval(r.reload, 30000); return () => clearInterval(i); }, [r.reload]);
  useStream(e => { if (e.published && (e.level === 'critical' || e.status === 'developing')) r.reload(); });
  return r.data;
}

const clockOf = g => (g.live ? (g.period ? `${g.period > 4 ? (g.period === 5 ? 'OT' : `${g.period - 4}OT`) : `Q${g.period}`} ${g.clock || ''}` : g.detail) : g.status === 'scheduled' ? new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : g.status === 'final' ? 'Final' : g.detail);

function Ticker({ games }) {
  if (!games) return <div className="ticker" />;
  if (!games.length) return <div className="ticker empty-ticker">No games today</div>;
  const order = [...games].sort((a, b) => (b.live - a.live) || (a.status === 'final') - (b.status === 'final'));
  return (
    <div className="ticker" role="list" aria-label="Today's games">
      {order.map(g => (
        <Link key={g.id} to={`/games/${g.id}`} className={`tick ${g.live ? 'is-live' : ''}`} role="listitem">
          {g.teams.map((t, i) => (
            <span key={i} className={`tick-row ${t.winner ? 'won' : ''}`}><TeamLogo src={t.logo} abbr={t.abbr} size={18} quiet /><b>{t.abbr}</b>{g.status !== 'scheduled' && <em>{t.score}</em>}</span>
          ))}
          <span className={`tick-clock ${g.live ? 'live' : ''}`}>{clockOf(g)}</span>
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
      <input type="search" placeholder="Search players, teams…" value={term} onChange={e => setTerm(e.target.value)} aria-label="Search" />
      {open && res && (
        <div className="search-pop">
          {res.players.slice(0, 6).map(p => <button key={p.id} onMouseDown={() => pick(`/players/${p.id}`)}><Avatar src={p.headshot} name={p.name} size={28} /><span>{p.name}</span><small>{p.team || ''}</small></button>)}
          {res.teams.map(t => <button key={t.id} onMouseDown={() => pick(`/teams/${t.id}`)}><TeamLogo src={t.logo} abbr={t.abbr} size={24} /><span>{t.name}</span></button>)}
          {res.events.map(e => <button key={e._id} onMouseDown={() => pick(`/e/${encodeURIComponent(e._id)}`)}><CatChip cat={e.category} /><span>{e.title || e.headline}</span></button>)}
          {res.records.map(r => <button key={r._id} onMouseDown={() => pick(`/records/${encodeURIComponent(r._id)}`)}><span className="pill p-green">Record</span><span>{r.title}</span><small>{r.entries?.[0]?.name}</small></button>)}
          {!res.players.length && !res.teams.length && !res.events.length && !res.records.length && <p className="muted pad">Nothing found.</p>}
        </div>
      )}
    </div>
  );
}

// Alerts: critical moments, and stories about the user's favorites, that arrived while the app was open.
function Bell() {
  const { user } = useMe();
  const [items, setItems] = useState([]);
  const [seen, setSeen] = useState(() => { try { return +localStorage.getItem('atn-seen') || 0; } catch { return 0; } });
  const [open, setOpen] = useState(false);
  const favs = user?.prefs || {};
  useStream(e => {
    if (!e.published) { setItems(list => list.filter(x => x._id !== e._id)); return; }
    const fav = favs.teams?.some(t => e.teams?.includes(t)) || favs.players?.some(p => e.players?.some(x => x.id === p));
    if (e.level !== 'critical' && !fav) return;
    setItems(list => [e, ...list.filter(x => x._id !== e._id)].slice(0, 30));
    if (favs.notify?.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) new Notification(e.title || e.headline, { body: e.body, icon: '/favicon.svg', tag: e._id });
  });
  const unread = items.filter(i => i.seq > seen).length;
  const toggle = () => { setOpen(o => !o); if (!open && items[0]) { setSeen(items[0].seq); try { localStorage.setItem('atn-seen', items[0].seq); } catch { /* */ } } };
  return (
    <div className="bell">
      <button type="button" className="icon-btn round" onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`} aria-expanded={open}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <div className="pop">
          <h4>Alerts</h4>
          {items.length ? items.map(e => <Link key={e._id} to={`/e/${encodeURIComponent(e._id)}`} className="pop-item" onClick={() => setOpen(false)}><CatChip cat={e.category} label={e.headline} /><b>{e.title || e.headline}</b></Link>)
            : <p className="muted pad">Critical moments{user ? ' and stories about your favorites' : ''} show up here while the app is open.</p>}
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <div className="profile">
      <button type="button" className="icon-btn round me" onClick={() => (user ? setOpen(o => !o) : go('/signin'))} aria-expanded={open} aria-label={user ? 'Account' : 'Sign in'}>
        {user ? <span className="me-initial">{user.name?.[0]?.toUpperCase() || '?'}</span> : <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>}
      </button>
      {open && user && (
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

function LiveCard({ games }) {
  const live = (games || []).filter(g => g.live).length;
  const next = (games || []).filter(g => g.status === 'scheduled').sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(i); }, []);
  return (
    <div className="live-card">
      {live ? <span className="live-word"><i className="dot" />LIVE</span> : <span className="live-word idle">{next ? 'TONIGHT' : 'TODAY'}</span>}
      <span className="muted">{live ? `${live} game${live === 1 ? '' : 's'} on · ${etNow()} ET` : next ? `First tip ${new Date(next.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : `All games · ${etNow()} ET`}</span>
    </div>
  );
}

function Storylines({ rail }) {
  const list = rail?.storylines || [];
  return (
    <div className="side-panel">
      <h4><Icon name="flame" /> Today's storylines</h4>
      {list.length ? list.map(s => <Link key={s.key} to={s.link} className="story-line"><Icon name="flame" /><span>{s.name}<small>{s.headlines[0]}</small></span></Link>)
        : <p className="muted small">Storylines build up as the night goes on.</p>}
    </div>
  );
}

const INTEL_ICON = { comeback: 'flame', 'comeback-done': 'flame', close: 'target', overtime: 'target', run: 'bolt', 'solo-run': 'bolt', collapse: 'flame', clutch: 'target' };
function Rail({ rail }) {
  if (!rail) return <aside className="rail" aria-label="Highlights" />;
  const hashtags = (rail.storylines || []).map(s => ({ tag: `#${s.name.split(' ').slice(-1)[0].replace(/[^A-Za-z0-9]/g, '')}`, count: s.count, link: s.link }));
  return (
    <aside className="rail" aria-label="Highlights">
      <section className="panel">
        <div className="panel-head"><h4>Top Performances</h4><Link to="/performances" className="see-all">See all →</Link></div>
        {rail.performances.length ? rail.performances.slice(0, 4).map(p => {
          const [pts, reb, ast] = (p.line.match(/\d+/g) || []);
          return (
            <Link key={p.id} to={`/players/${p.pid}`} className="rail-perf">
              <Avatar src={p.headshot} name={p.name} color={p.team?.color} size={46} />
              <span className="rp-name"><b>{p.name.replace(/^(\w)\w*\s/, '$1. ')}</b><small style={{ color: p.team?.color && p.team.color !== '#000000' ? `color-mix(in srgb, ${p.team.color} 55%, #fff)` : undefined }}>{p.team?.abbr}{p.potn ? ' · POTN' : ''}</small></span>
              <span className="rp-num"><b>{pts}<small>PTS</small></b><small>{reb} REB · {ast} AST</small></span>
            </Link>
          );
        }) : <p className="muted small">The night's best performances appear once games are under way.</p>}
      </section>
      <section className="panel">
        <div className="panel-head"><h4>Game Intelligence</h4><Link to="/intel" className="see-all">See all →</Link></div>
        {rail.live.length === 0 && rail.alerts.length === 0 && <p className="muted small">No live alerts right now.</p>}
        {rail.live.map(g => <Link key={g.id} to={`/games/${g.id}`} className="rail-alert"><span className="ri c-red"><Icon name="target" /></span><span><b>{g.situation.label}</b><small>{g.situation.score} · {g.detail}</small></span></Link>)}
        {rail.alerts.map(e => <Link key={e._id} to={`/e/${encodeURIComponent(e._id)}`} className="rail-alert"><span className={`ri ${e.category.startsWith('comeback') ? 'c-orange' : e.category.includes('run') ? 'c-purple' : 'c-blue'}`}><Icon name={INTEL_ICON[e.category] || 'bolt'} /></span><span><b>{e.title || e.headline}</b><small>{e.game?.teams?.map(t => t.abbr).join(' vs ')} · {String(e.game?.moment || '').split('·').pop()}</small></span></Link>)}
      </section>
      <section className="panel">
        <h4>Trending</h4>
        {hashtags.length ? hashtags.map(h => <Link key={h.tag} to={h.link} className="trend"><span>{h.tag}</span><small>{h.count} {h.count === 1 ? 'story' : 'stories'}</small></Link>) : <p className="muted small">Trends build up through the night.</p>}
      </section>
    </aside>
  );
}

function Shell({ children, wide }) {
  const route = useRoute();
  const status = useStreamStatus();
  const games = useTicker();
  const rail = useRail();
  const path = route.split('?')[0];
  const active = to => (to === '/' ? path === '/' : path.startsWith(to));
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Around the NBA, home"><Logo size={38} /><Wordmark /></Link>
        <Ticker games={games} />
        <Search />
        <span className={`conn conn-${status}`} title={status === 'live' ? 'Connected: new events arrive on their own' : 'Reconnecting…'}><i className="dot" /></span>
        <Bell />
        <Profile />
      </header>
      <div className={`layout ${wide ? 'wide' : ''}`}>
        <nav className="sidenav" aria-label="Sections">
          <LiveCard games={games} />
          {NAV.map(([to, label, icon]) => <Link key={to} to={to} className={`nav-item ${active(to) ? 'on' : ''}`} aria-current={active(to) ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></Link>)}
          <Storylines rail={rail} />
          <div className="brand-card"><Logo size={30} /><Wordmark big /><p>LIVE. ANALYZE. DISCOVER.</p></div>
          <p className="nav-foot muted small">Data: ESPN, verified against NBA.com. Not affiliated with the NBA.</p>
        </nav>
        <main className="main">{children}</main>
        {!wide && <Rail rail={rail} />}
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
  const m = re => path.match(re);
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
