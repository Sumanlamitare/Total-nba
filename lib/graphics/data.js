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

export function dateLabel(t, tz) {
  const d = new Date(t);
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
  const day = dayOf(d, tz);
  const mon = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
  return `${wd} ${+day.slice(6, 8)} ${mon} ${day.slice(0, 4)}`.toUpperCase();
}

export function graphicData(m, { timezone = 'America/New_York' } = {}) {
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
  };
}
