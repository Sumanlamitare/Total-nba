import { useEffect, useState } from 'react';
import Slate from './Slate.jsx';
import Game from './Game.jsx';

// Addresses: /nfl, /nba/2026-10-24, /game/nfl/401872981
function parse(path) {
  const [a, b, c] = path.split('/').filter(Boolean);
  if (a === 'game' && b && c) return { view: 'game', sport: b, id: c };
  if (a === 'nba' || a === 'nfl') return { view: 'slate', sport: a, date: /^\d{4}-\d{2}-\d{2}$/.test(b || '') ? b : null };
  return { view: 'slate', sport: localStorage.getItem('edge_sport') || 'nfl', date: null };
}

export default function App() {
  const [route, setRoute] = useState(() => parse(location.pathname));
  useEffect(() => {
    const pop = () => setRoute(parse(location.pathname));
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  const go = path => { history.pushState(null, '', path); setRoute(parse(path)); scrollTo(0, 0); };
  const sport = route.sport;
  useEffect(() => { try { localStorage.setItem('edge_sport', sport); } catch { /* */ } }, [sport]);

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => go('/' + sport)}>EDGE<span>{sport.toUpperCase()}</span></button>
        <nav className="seg" role="tablist">
          {['nfl', 'nba'].map(s => (
            <button key={s} role="tab" aria-selected={sport === s} className={sport === s ? 'a' : ''} onClick={() => go('/' + s)}>{s.toUpperCase()}</button>
          ))}
        </nav>
      </header>
      <main>
        {route.view === 'game'
          ? <Game key={route.id} sport={sport} id={route.id} go={go} />
          : <Slate key={sport + (route.date || '')} sport={sport} date={route.date} go={go} />}
      </main>
      <footer className="foot">
        <p><b>How it works.</b> We estimate each player's numbers from his recent games and last season, compare that to the sportsbook's line, and only call it a pick when we're clearly more confident than the odds are. <b>Strong / Good / Lean</b> says by how much. Bet sizes are a share of the money you've set aside for betting, never more than 2%. Recent form and head-to-head are there for context.</p>
        <p>Data: ESPN's free API (odds from the sportsbook it lists). For personal research only. Bet responsibly.</p>
      </footer>
    </div>
  );
}
