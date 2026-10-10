import { useEffect, useState } from 'react';
import { getSlate } from './api.js';

const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const time = d => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const pct = x => (x * 100).toFixed(1) + '%';

export default function Slate({ sport, date, go }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null);
  useEffect(() => { getSlate(sport, date).then(setData, e => setErr(e.message)); }, [sport, date]);

  if (err) return <div className="msg bad">Couldn't load the slate: {err}</div>;
  if (!data) return <div className="msg">Loading {sport.toUpperCase()} games…</div>;
  const d = data.date;
  return (
    <section>
      <div className="daybar">
        <button onClick={() => go(`/${sport}/${addDays(d, -1)}`)} aria-label="Previous day">‹</button>
        <h1>{dayLabel(d)}</h1>
        <button onClick={() => go(`/${sport}/${addDays(d, 1)}`)} aria-label="Next day">›</button>
      </div>
      {!data.games.length && <div className="msg">No {sport.toUpperCase()} games on this day.</div>}
      <div className="cards">
        {data.games.map(g => (
          <button key={g.id} className="card" onClick={() => go(`/game/${sport}/${g.id}`)}>
            <div className="teams">
              {[g.away, g.home].map((t, i) => (
                <div key={i} className="trow">
                  {t.logo ? <img src={t.logo} alt="" width="28" height="28" loading="lazy" /> : <span className="logo-ph" />}
                  <b>{t.abbr}</b><span className="rec">{t.record}</span>
                  {g.status.state !== 'pre' && <span className="score">{t.score}</span>}
                </div>
              ))}
            </div>
            <div className="meta">
              <span>{g.status.state === 'pre' ? time(g.date) : g.status.detail}</span>
              {g.odds && <span className="odds">{g.odds.details}{g.odds.total ? ` · O/U ${g.odds.total}` : ''}</span>}
            </div>
            {g.picks?.n > 0 && (
              <div className="minipicks">
                <span className="tag">{g.picks.n} pick{g.picks.n > 1 ? 's' : ''}</span>
                {g.picks.list.slice(0, 3).map((p, i) => <span key={i} className="mp">{p.label} <em className="pos">EV {pct(p.ev)}</em></span>)}
              </div>
            )}
            {!g.picks && g.status.state === 'pre' && <div className="hint">Open to analyse</div>}
          </button>
        ))}
      </div>
    </section>
  );
}
