import { useEffect, useState } from 'react';
import { getPlayer } from '../api.js';
import { STATS, SHORT, LONG, LABEL, fmtStat, shortDate, seasonName } from '../util.js';
import { Avatar } from './ui.jsx';
import { ProLock, downloadCSV } from './Pro.jsx';
import Ad from './Ads.jsx';

const SPLIT_COLS = ['gp', 'min', 'pts', 'reb', 'ast', 'tpm', 'stl', 'blk', 'fan'];
const PREVIEW = ['Last 5', 'Last 10', 'Last 20', 'Home', 'Away', 'Wins', 'Losses'];

// Pro: splits for the latest season (totals), with every opponent
function Splits({ pkey, name, pro, onPro, f }) {
  const [sp, setSp] = useState(null);
  const [opp, setOpp] = useState(false);
  useEffect(() => { if (pro.pro) fetch(`/api/player?key=${encodeURIComponent(pkey)}&splits=1`).then(r => r.json()).then(setSp).catch(() => setSp({ rows: [] })); }, [pkey, pro.pro]);
  const cols = SPLIT_COLS.includes(f) ? SPLIT_COLS : [...SPLIT_COLS.slice(0, 2), f, ...SPLIT_COLS.slice(2)];
  const head = <tr><th />{cols.map(c => <th key={c} className={c === f ? 'on' : ''}>{SHORT[c]}</th>)}</tr>;
  const row = r => <tr key={r.label}><th>{r.label}</th>{cols.map(c => <td key={c} className={c === f ? 'on' : ''}>{fmtStat(r[c] ?? 0, c)}</td>)}</tr>;
  if (!pro.pro) return (
    <section className="pp-sec">
      <h4>SPLITS <small className="pro-tag">PRO</small></h4>
      <div className="splits locked"><table><thead>{head}</thead><tbody>{PREVIEW.map(l => <tr key={l}><th>{l}</th>{cols.map(c => <td key={c}>••</td>)}</tr>)}</tbody></table></div>
      <ProLock title="See every split" sub="Last 5/10/20, home vs away, wins vs losses, vs every opponent" onPro={onPro} />
    </section>
  );
  return (
    <section className="pp-sec">
      <h4>SPLITS <small>{sp?.season || ''} · TOTALS</small></h4>
      {!sp ? <div className="gl"><span className="ball" /></div> : (
        <>
          <div className="splits"><table><thead>{head}</thead><tbody>{sp.rows.map(row)}</tbody></table></div>
          <button className="csv" onClick={() => setOpp(!opp)}>{opp ? 'HIDE' : 'SHOW'} OPPONENTS ({sp.opponents?.length || 0})</button>
          {opp && <div className="splits"><table><thead>{head}</thead><tbody>{sp.opponents.map(r => row({ ...r, label: 'vs ' + r.label }))}</tbody></table></div>}
          <button className="csv" onClick={() => downloadCSV(`${name}-splits-${sp.season}`, [['Split', 'label'], ...SPLIT_COLS.map(c => [SHORT[c], c])], [...sp.rows, ...sp.opponents.map(r => ({ ...r, label: 'vs ' + r.label }))])}>DOWNLOAD CSV</button>
        </>
      )}
    </section>
  );
}

const FIELDS = Object.values(STATS);
const md = s => { const [, m, d] = s.split('-'); return `${+m}/${+d}`; };


// A player's page: career total and high, season-by-season bars, last 10 games, best games ever.
// Every season, game and high jumps to that view in the app.
export default function PlayerSheet({ pkey, stat, onClose, onDate, onSeason, pro, onPro }) {
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

      <Splits pkey={pkey} name={p.name} pro={pro} onPro={onPro} f={f} />
      <Ad pro={pro.pro} />

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
