// Match → the data a full-time graphic is drawn from. Scorers are grouped by player in order of their first goal:
//   "Erling Haaland 12', 45+2' (P), 78'"   ·   own goals are listed under the team they counted for: "Rani Khedira 55' (OG)"
import { dayOf } from '../tz.js';

export function scorerLines(goals, side) {
  const rows = [];
  for (const g of (goals || []).filter(x => x.side === side).sort((a, b) => a.sort - b.sort)) {
    const key = `${g.player || '?'}|${g.ownGoal ? 'og' : ''}`;
    let r = rows.find(x => x.key === key);
    if (!r) rows.push(r = { key, player: g.player || 'Unknown scorer', og: g.ownGoal, mins: [] });
    r.mins.push(`${g.minute || '?'}${g.penalty ? ' (P)' : ''}`);
  }
  return rows.map(r => `${r.player} ${r.mins.join(', ')}${r.og ? ' (OG)' : ''}`);
}

// Player of the Game, from the goals (ESPN publishes no man-of-the-match for soccer): most goals; then the scorer of
// the winning goal (the one that put the winners ahead for good); then the winning side. Own goals don't count. A draw
// where nobody scored twice has no clear pick: none.
export function playerOfGame(m) {
  const goals = (m.goals || []).filter(g => g.player && !g.ownGoal && g.side);
  if (!goals.length) return null;
  const sh = m.score?.home ?? 0, sa = m.score?.away ?? 0;
  let winner = sh > sa ? 'home' : sa > sh ? 'away' : null;
  if (!winner && m.shootout?.home != null && m.shootout.home !== m.shootout.away) winner = m.shootout.home > m.shootout.away ? 'home' : 'away';
  // The winning goal: the winners' goal number (loser's final tally + 1), counting all goals (own goals included).
  let decider = null;
  if (winner && sh !== sa) {
    const need = (winner === 'home' ? sa : sh) + 1;
    let n = 0;
    for (const g of [...(m.goals || [])].sort((a, b) => a.sort - b.sort)) if (g.side === winner && ++n === need) { decider = g.ownGoal ? null : g.player; break; }
  }
  const by = new Map();
  for (const g of goals) {
    const k = `${g.side}|${g.player}`;
    if (!by.has(k)) by.set(k, { name: g.player, side: g.side, goals: 0, first: g.sort });
    by.get(k).goals++;
  }
  const ranked = [...by.values()].sort((a, b) => b.goals - a.goals || (b.name === decider) - (a.name === decider) || (b.side === winner) - (a.side === winner) || a.first - b.first);
  const top = ranked[0];
  if (!winner && top.goals < 2 && ranked.filter(r => r.goals === top.goals).length > 1) return null;
  if (!winner && top.goals < 2 && sh === sa && !m.shootout) return null;
  const why = top.goals >= 3 ? 'Hat-trick' : top.goals === 2 ? 'Two goals' : top.name === decider ? (sh + sa === 1 ? 'The only goal' : 'The winning goal') : 'Goal';
  return { name: top.name, side: top.side, goals: top.goals, why };
}

export function dateLabel(t, tz) {
  const d = new Date(t);
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
  const day = dayOf(d, tz);
  const mon = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
  return `${wd} ${+day.slice(6, 8)} ${mon} ${day.slice(0, 4)}`.toUpperCase();
}

export function graphicData(m, { timezone = 'America/New_York', graphics = {} } = {}) {
  const pen = m.espnStatus?.name === 'STATUS_FINAL_PEN' || (m.shootout && m.shootout.home != null);
  const aet = m.espnStatus?.name === 'STATUS_FINAL_AET';
  return {
    competition: { name: m.compName || m.comp, logo: m.compLogo || null },
    home: { name: m.home?.name, short: m.home?.short, logo: m.home?.logo || null, color: m.home?.color || null },
    away: { name: m.away?.name, short: m.away?.short, logo: m.away?.logo || null, color: m.away?.color || null },
    score: { home: m.score?.home, away: m.score?.away },
    shootout: pen && m.shootout?.home != null && m.shootout?.away != null ? { home: m.shootout.home, away: m.shootout.away } : null,
    note: aet ? 'After extra time' : null,
    statusLabel: 'Full time',
    scorers: { home: scorerLines(m.goals, 'home'), away: scorerLines(m.goals, 'away') },
    date: dateLabel(m.kickoff, timezone),
    potm: graphics.playerOfGame === false ? null : playerOfGame(m),
    photo: null,
  };
}
