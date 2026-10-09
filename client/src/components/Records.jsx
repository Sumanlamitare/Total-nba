import { useEffect, useState } from 'react';
import { SHORT, fmtStat, shortDate } from '../util.js';
import { STAT_SLUG, FIELD, STAT_NAME } from '../../../lib/routes.js';
import { teamColor } from '../teams.js';
import { Avatar, Num } from './ui.jsx';
import { ProLock, downloadCSV, CSV_COLS } from './Pro.jsx';
import Ad from './Ads.jsx';

const get = q => fetch('/api/records?' + q).then(r => r.json());

// All-time single-game records since 1993–94, the 40-point club and triple-double kings
export default function Records({ stat, onStat, onDate, onPlayer, pro, onPro }) {
  const f = FIELD[stat] || 'pts';
  const [rows, setRows] = useState(null);
  const [cl, setCl] = useState(null);
  useEffect(() => { setRows(null); get('stat=' + f).then(r => setRows(r.rows || [])).catch(() => setRows([])); }, [f]);
  useEffect(() => { get('clubs=1').then(setCl).catch(() => {}); }, []);
  const Club = ({ title, sub, list }) => {
    const top = list?.[0]?.n || 1;
    return (
      <section className="club">
        <h3>{title}<small>{sub}</small></h3>
        {list?.slice(0, 10).map((p, i) => (
          <button key={p.key} className="club-row" style={{ '--i': i, '--tc': teamColor(p.team), '--w': p.n / top }} onClick={() => onPlayer(p)}>
            <span className="rk">{i + 1}</span>
            <Avatar id={p.espnId} name={p.name} team={p.team} size="xs" w={80} />
            <span className="club-name">{p.name}</span>
            <span className="club-bar"><i /></span>
            <b>{p.n}</b>
          </button>
        ))}
      </section>
    );
  };
  return (
    <div className="rec">
      <div className="headline">
        <small className="kicker">ALL-TIME · SINCE 1993–94</small>
        <h1><span key={stat}>MOST {STAT_NAME[stat].toUpperCase()} IN A GAME</span></h1>
        <p>The 25 biggest single games in our archive. Tap one to open that night.</p>
      </div>
      <div className="chips">
        {Object.keys(STAT_SLUG).map(k => <button key={k} className={'chip mini' + (k === stat ? ' a' : '')} onClick={() => onStat(k)}><b>{SHORT[FIELD[k]]}</b></button>)}
      </div>
      {!rows ? <div className="gl"><span className="ball" />OPENING THE VAULT</div>
        : !rows.length ? <p className="pz-err">Records are rebuilt by the nightly job — check back soon.</p>
          : (
            <ol className="rec-list" key={f}>
              {rows.map((l, i) => (
                <li key={l.gameId + l.key} style={{ '--i': Math.min(i, 14), '--tc': teamColor(l.team) }}>
                  <button className={'rec-row' + (i < 3 ? ' top' : '')} onClick={() => onDate(l.date)}>
                    <span className="rk">{i + 1}</span>
                    <Avatar id={l.espnId} name={l.name} team={l.team} size="s" w={96} />
                    <span className="who"><b>{l.name}</b><small>{l.team} vs {l.opp} · {shortDate(l.date)}</small></span>
                    <span className="val"><b>{i < 3 ? <Num v={l[f]} decimals={f === 'fan' ? 1 : 0} delay={i * 120} /> : fmtStat(l[f], f)}</b><small>{SHORT[f]}</small></span>
                  </button>
                </li>
              ))}
            </ol>
          )}
      {rows?.length > 0 && (pro.pro
        ? <button className="csv" onClick={() => downloadCSV(`totalnba-records-${STAT_SLUG[stat]}`, CSV_COLS, rows)}>DOWNLOAD CSV</button>
        : <ProLock compact title="Download this list as CSV" sub="Pro exports every leaderboard and record list" onPro={onPro} />)}
      <Ad pro={pro.pro} />
      {cl && <Club title="40-POINT CLUB" sub="MOST 40-POINT GAMES SINCE 1993" list={cl.forty} />}
      {cl && <Club title="TRIPLE-DOUBLE KINGS" sub="MOST TRIPLE-DOUBLES SINCE 1993" list={cl.triple} />}
    </div>
  );
}
