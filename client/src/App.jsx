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
        <p><b>How picks are made.</b> Each stat is projected from the player's recent and last-season games (regressed toward his normal level), turned into a probability against tonight's line, blended with the sportsbook's own price, and kept only if it beats the break-even by 3+ points (2 for game lines) with no injury or small-sample flags. Stakes are quarter-Kelly, capped at 2% of bankroll. Last 5, last meetings and hit rates are context — they don't move the score.</p>
        <p>Data: ESPN's free API (odds from the sportsbook it lists). For personal research only. Bet responsibly.</p>
      </footer>
    </div>
  );
}
