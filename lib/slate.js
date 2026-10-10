// A sport's games on a date, with the sportsbook's lines from the scoreboard
import * as E from './espn.js';
const ymd = d => d.replace(/-/g, '');
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
export const etToday = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

function events(sb) {
  return (sb?.events || []).map(e => {
    const c = e.competitions?.[0] || {};
    const t = side => { const x = c.competitors?.find(k => k.homeAway === side) || {}; return { id: x.team?.id, abbr: x.team?.abbreviation, name: x.team?.displayName,
      logo: x.team?.logo, record: x.records?.[0]?.summary || '', score: x.score }; };
    const o = c.odds?.[0];
    return { id: e.id, date: e.date, name: e.shortName, status: { state: e.status?.type?.state, detail: e.status?.type?.shortDetail }, week: e.week?.number,
      home: t('home'), away: t('away'), odds: o ? { details: o.details, total: o.overUnder, provider: o.provider?.name } : null };
  });
}

// games on `date`; with no date, the next day (from today, up to 8 days out) that has games
export async function slate(sport, date) {
  if (date) return { date, games: events(await E.scoreboard(sport, ymd(date))) };
  for (let i = 0; i < 9; i++) {
    const d = addDays(etToday(), i), games = events(await E.scoreboard(sport, ymd(d)));
    if (games.some(g => g.status.state !== 'post')) return { date: d, games };
  }
  return { date: etToday(), games: [] };
}
