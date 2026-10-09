import { STATS, SHORT, LABEL, fmtStat, decimalsFor } from '../util.js';
import { teamColor } from '../teams.js';
import { Avatar, Num, I } from './ui.jsx';
import { subline } from './Leaders.jsx';

const GAME = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fg2m', 'ftm', 'tov', 'pf', 'min', 'fan'];
const TOTAL = ['gp', ...GAME];

// One performance, full size. Tapping a stat tile re-ranks the board by that stat.
export default function CardSheet({ c, rank, stat, collected, onCollect, onPlayer, onStat, onGame }) {
  const f = STATS[stat];
  const fields = c.kind === 'game' ? GAME : TOTAL;
  return (
    <div className="card" style={{ '--tc': teamColor(c.team) }}>
      <div className="card-hero">
        <span className="card-rank">#{rank + 1}</span>
        <span className={'tag ' + c.rarity}>{c.rarity}</span>
        <Avatar id={c.espnId} name={c.n} team={c.team} size="hero" w={480} />
      </div>
      <div className="card-body">
        <h2>{c.n}</h2>
        <p className="card-sub">{subline(c)} · {c.period}{c.loaded ? ` · through ${c.loaded}` : ''}</p>
        <div className="card-big">
          <b><Num v={c.v} decimals={decimalsFor(f) && !Number.isInteger(c.v) ? 1 : 0} ms={1100} delay={150} /></b>
          <span>{c.kind === 'total' ? 'TOTAL ' : ''}{c.stat}</span>
        </div>
        {c.badges.length > 0 && <div className="badges">{c.badges.map((b, j) => <span key={b} style={{ '--j': j }}>{b}</span>)}</div>}
        <div className="grid">
          {fields.map((x, j) => {
            const pick = LABEL[x];
            return (
              <button key={x} className={'tile' + (x === f ? ' on' : '')} style={{ '--j': j }} disabled={!pick} onClick={() => pick && onStat(pick)}>
                <small>{SHORT[x]}</small><b>{fmtStat(c.line[x] ?? 0, x)}</b>
              </button>
            );
          })}
        </div>
        <div className="card-acts">
          <button className={'btn collect' + (collected ? ' on' : '')} onClick={e => onCollect(c, e)}>{I.book}<span>{collected ? 'COLLECTED' : 'COLLECT'}</span></button>
          <button className="btn ghost" onClick={() => onPlayer(c)}><span>PLAYER PAGE</span>{I.arrow}</button>
          {c.kind === 'game' && onGame && <button className="btn ghost" onClick={() => onGame(c.gameId)}><span>THIS GAME</span></button>}
        </div>
      </div>
    </div>
  );
}
