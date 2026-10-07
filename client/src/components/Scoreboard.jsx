import { SHORT, fmtStat } from '../util.js';

// The night's games as a scrollable strip. Tapping a game shows only its players; the gold chip at the
// end is the best line on this calendar day in another season (tap to jump there).
export default function Scoreboard({ games, game, onGame, otd, onOtd, f, count }) {
  if (!games.length && !otd) return null;
  return (
    <nav className="strip" aria-label="Games">
      {games.length > 1 && (
        <button className={'gchip all' + (!game ? ' a' : '')} onClick={() => onGame(null)}>
          <b>ALL</b><small>{count} PLAYERS</small>
        </button>
      )}
      {games.map((g, i) => {
        const homeWin = g.hs > g.as;
        return (
          <button key={g._id} className={'gchip' + (game === g._id ? ' a' : '')} style={{ '--i': i }} onClick={() => onGame(game === g._id ? null : g._id)}
            aria-label={`${g.away} ${g.as}, ${g.home} ${g.hs}`}>
            <span className={homeWin ? '' : 'w'}><em>{g.away}</em><b>{g.as}</b></span>
            <span className={homeWin ? 'w' : ''}><em>{g.home}</em><b>{g.hs}</b></span>
            {g.type && g.type !== 'Regular Season' && <i>{g.type === 'PlayIn' ? 'PLAY-IN' : 'PLAYOFFS'}</i>}
          </button>
        );
      })}
      {otd && (
        <button className="gchip otd" onClick={onOtd} aria-label={`On this day in ${otd.date.slice(0, 4)}: ${otd.name}`}>
          <small>ON THIS DAY · {otd.date.slice(0, 4)}</small>
          <b>{otd.name} <span>{fmtStat(otd[f] ?? 0, f)} {SHORT[f]}</span></b>
        </button>
      )}
    </nav>
  );
}
