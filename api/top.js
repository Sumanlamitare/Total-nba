import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, dayLines, weekAll, seasonAll, seasonInfo } from '../lib/store.js';
import { pool } from '../lib/espn.js';
import { weekDates } from '../lib/dates.js';

// GET /api/top?mode=day|week|season&date=YYYY-MM-DD|season=2025-26&stat=pts — Top 10 for the graphic,
// from the same view the user is looking at. Rows: { name, team, espnId, value, detail }
export default handler(async ({ mode, date, season, stat }) => {
  const val = r => r[stat] ?? r.pts;
  if (mode === 'season') {
    const y = +String(season || '').slice(0, 4);
    if (!y) throw bad('season must look like 2025-26');
    const [info, rows] = await Promise.all([seasonInfo(y), seasonAll(y, stat)]);
    return { mode, season: info.season, through: info.complete ? null : info.through,
      rows: rows.slice(0, 10).map(r => ({ name: r.name, team: r.team, espnId: r.espnId, value: val(r), detail: `${r.team} · ${r.gp} GP` })) };
  }
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  if (mode === 'week') {
    const dates = weekDates(date);
    await pool(dates, 3, d => ensureDay(d));
    const rows = await weekAll(dates, stat);
    return { mode, start: dates[0], end: dates[6],
      rows: rows.slice(0, 10).map(r => ({ name: r.name, team: r.team, espnId: r.espnId, value: val(r), detail: `${r.team} · ${r.gp} GP` })) };
  }
  await ensureDay(date);
  const rows = await dayLines(date, stat);
  return { mode: 'day', date, rows: rows.slice(0, 10).map(l => ({ name: l.name, team: l.team, espnId: l.espnId, value: val(l), detail: `${l.team} vs ${l.opp}` })) };
});
