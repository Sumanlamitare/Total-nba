import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, dayTop, bestGames, seasonTotals } from '../lib/store.js';
import { pool } from '../lib/espn.js';

const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// GET /api/top?mode=day|week|season&date=YYYY-MM-DD|season=2025-26&stat=pts — Top 10 for the graphic,
// from the same view the user is looking at. Rows: { name, team, espnId, value, detail }
export default handler(async ({ mode, date, season, stat }) => {
  if (mode === 'season') {
    const y = +String(season || '').slice(0, 4);
    if (!y) throw bad('season must look like 2025-26');
    const T = await seasonTotals(y, stat, 10);
    return { mode, season: T.season, through: T.complete ? null : T.through,
      rows: T.leaders.map(r => ({ name: r.name, team: r.team, espnId: r.espnId, value: r.v, detail: `${r.gp} GP` })) };
  }
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  if (mode === 'week') {
    const dow = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const dates = Array.from({ length: 7 }, (_, i) => addDays(date, i - dow));
    await pool(dates, 3, d => ensureDay(d));
    const rows = await bestGames(dates, stat, 10);
    return { mode, start: dates[0], end: dates[6], rows: rows.map(l => ({ name: l.name, team: l.team, espnId: l.espnId, value: l[stat] ?? l.pts, detail: `vs ${l.opp}`, date: l.date })) };
  }
  await ensureDay(date);
  const rows = await dayTop(date, stat, 10);
  return { mode: 'day', date, rows: rows.map(l => ({ name: l.name, team: l.team, espnId: l.espnId, value: l[stat] ?? l.pts, detail: `vs ${l.opp}` })) };
});
