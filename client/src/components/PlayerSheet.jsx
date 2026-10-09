import { useEffect, useState } from 'react';
import { getPlayer } from '../api.js';
import { STATS, SHORT, LONG, LABEL, fmtStat, shortDate, seasonName } from '../util.js';
import { Avatar } from './ui.jsx';

const FIELDS = Object.values(STATS);
const md = s => { const [, m, d] = s.split('-'); return `${+m}/${+d}`; };


// A player's page: career total and high, season-by-season bars, last 10 games, best games ever.
// Every season, game and high jumps to that view in the app.
export default function PlayerSheet({ pkey, stat, onClose, onDate, onSeason }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState(STATS[stat] || 'pts');
  useEffect(() => { getPlayer(pkey).then(setP).catch(e => setErr(e.message)); }, [pkey]);

  if (err) return <div className="psheet" onClick={e => e.stopPropagation()}><p className="pp-err">Couldn’t load this player ({err})</p></div>;
  if (!p) return <div className="psheet" onClick={e => e.stopPropagation()}><div className="gl"><div className="ball" />LOADING PLAYER</div></div>;

  const seasons = p.seasons.filter(s => s.gp > 0);
  const max = Math.max(1, ...seasons.map(s => s[f] || 0));
  const best = seasons.reduce((a, s) => ((s[f] || 0) > (a?.[f] || 0) ? s : a), null);
  const high = p.highs[f];
  const recentMax = Math.max(1, ...p.recent.map(g => g[f] || 0));
  const span = `${seasonName(seasons[0]?.season || '')}${seasons.length > 1 ? ' → ' + seasonName(seasons.at(-1).season) : ''}`;

  return (
    <div className="psheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${p.name} player page`}>
      <div className="pp-hd">
        <Avatar id={p.espnId} name={p.name} team={p.team} size="l" w={300} />
        <div className="pp-id">
          <small>PLAYER FILE</small>
          <h2>{p.name}</h2>
          <p>{p.team} · {span} · {p.career.gp.toLocaleString()} GAMES</p>
        </div>
        <button className="ib" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      <div className="pp-tabs" role="tablist">
        {FIELDS.map(x => <button key={x} role="tab" aria-selected={x === f} className={x === f ? 'a' : ''} onClick={() => setF(x)}>{SHORT[x]}</button>)}
      </div>

      <div className="pp-tiles">
        <div className="tile"><small>CAREER {SHORT[f]}</small><b>{fmtStat(p.career[f] || 0, f)}</b><span>all games stored</span></div>
        <button className="tile hi" disabled={!high} onClick={() => high && onDate(high.date)}>
          <small>CAREER HIGH</small><b>{high ? fmtStat(high[f] || 0, f) : '—'}</b>
          <span>{high ? `vs ${high.opp} · ${shortDate(high.date)}` : ''}</span>
        </button>
        <button className="tile" disabled={!best} onClick={() => best && onSeason(best.season)}>
          <small>BEST SEASON</small><b>{best ? seasonName(best.season) : '—'}</b>
          <span>{best ? `${fmtStat(best[f] || 0, f)} ${SHORT[f]} · ${best.team}` : ''}</span>
        </button>
      </div>

      <section className="pp-sec">
        <h4>{LONG[LABEL[f]].toUpperCase()} BY SEASON <small>REGULAR SEASON TOTALS</small></h4>
        <div className="bars">
          {seasons.map((s, i) => {
            const v = s[f] || 0, top = s === best;
            return (
              <button key={s.season} className={'sbar' + (top ? ' top' : '')} style={{ '--w': `${(v / max) * 100}%`, '--i': i }} onClick={() => onSeason(s.season)}
                title={`${seasonName(s.season)} · ${s.team}: ${fmtStat(v, f)} ${SHORT[f]} in ${s.gp} games`}>
                <span className="y">{seasonName(s.season)}</span>
                <span className="t"><i /></span>
                <span className="v">{fmtStat(v, f)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pp-sec">
        <h4>LAST {p.recent.length} GAMES <small>{SHORT[f]} PER GAME</small></h4>
        <div className="cols" style={{ '--n': p.recent.length }}>
          {p.recent.map((g, i) => {
            const v = g[f] || 0, label = v === recentMax || i === p.recent.length - 1;
            return (
              <button key={g.date + i} className={'col' + (v === recentMax ? ' top' : '')} onClick={() => onDate(g.date)}
                title={`${shortDate(g.date)} vs ${g.opp}: ${fmtStat(v, f)} ${SHORT[f]}`} style={{ '--h': `${Math.max(3, (v / recentMax) * 100)}%`, '--i': i }}>
                <span className="cv">{label ? fmtStat(v, f) : ''}</span>
                <span className="ct"><i /></span>
                <span className="cd">{md(g.date)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pp-sec">
        <h4>GREATEST HITS <small>BEST GAMES BY FANTASY POINTS</small></h4>
        <div className="hits">
          {p.best.map((g, i) => (
            <button key={g.date + i} className="hit" style={{ '--i': i }} onClick={() => onDate(g.date)}>
              <span className="hn">{String(i + 1).padStart(2, '0')}</span>
              <span className="hm"><b>{shortDate(g.date)}</b><small>{g.team} vs {g.opp}</small></span>
              <span className="hl">{g.pts} PTS · {g.reb} REB · {g.ast} AST{g.stl >= 3 ? ` · ${g.stl} STL` : ''}{g.blk >= 3 ? ` · ${g.blk} BLK` : ''}</span>
              <span className="hf">{fmtStat(g.fan, 'fan')}<small>FPTS</small></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
