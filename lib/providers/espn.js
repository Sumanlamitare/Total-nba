// ESPN, the data provider (research: tools/probe-providers.mjs). NBA.com's stats API doesn't answer cloud hosts and its
// CDN returns 403 there; ESPN serves schedules, live status, complete box scores, league-wide season tables and
// per-player season figures, with no key. Every other module talks to this interface, so another provider can be
// added beside it:
//   scoreboard(date) -> { date, season, games: [{ id, status, stype, detail, teams }] }
//   boxscore(id)     -> { id, date, season, stype, completed, teams: [...], players: [...], problems: [] }
//   seasonFigures(season, stype, athleteId) -> { statKey: value } for the PROVIDER statistics
//   seasonInfo(year) -> { year, label, start, end, dates }
import { fetchJson, pool, SITE, CORE } from '../espn.js';
import { PROVIDER } from '../stats/catalog.js';

export const name = 'ESPN';
const num = v => { const n = Number(String(v ?? '').replace('+', '')); return Number.isFinite(n) ? n : 0; };
const ymd = iso => String(iso || '').slice(0, 10).replace(/-/g, '');
const GAME_TYPES = new Set([2, 3, 5]); // regular season, playoffs, play-in

// ESPN status -> ours. Postponed and canceled games were never played that night; suspended ones finish another day.
export function statusOf(type = {}) {
  const n = String(type.name || '').toUpperCase();
  if (/POSTPONED/.test(n)) return 'postponed';
  if (/CANCEL/.test(n) || /FORFEIT/.test(n)) return 'canceled';
  if (/SUSPENDED/.test(n)) return 'suspended';
  if (type.completed || /FINAL/.test(n)) return 'final';
  if (type.state === 'in' || /IN_PROGRESS|HALFTIME|END_PERIOD|DELAYED/.test(n)) return 'in';
  return 'scheduled';
}

const teamOf = t => ({ id: String(t?.id || ''), abbr: t?.abbreviation || '', name: t?.displayName || '', color: t?.color ? `#${t.color}` : null,
  logo: t?.logo || t?.logos?.[0]?.href || null });

export async function scoreboard(date) {
  const sb = await fetchJson(`${SITE}/scoreboard?dates=${date}&limit=100`);
  if (!sb || !Array.isArray(sb.events)) throw Object.assign(new Error(`ESPN scoreboard for ${date} came back without games`), { status: 502 });
  const games = sb.events.filter(e => GAME_TYPES.has(Number(e.season?.type))).map(e => {
    const c = e.competitions?.[0], type = e.status?.type || c?.status?.type || {};
    return {
      id: String(e.id), date, stype: Number(e.season?.type) || 2, status: statusOf(type), detail: type.shortDetail || type.detail || '', note: c?.notes?.[0]?.headline || '',
      start: e.date || null,
      teams: (c?.competitors || []).map(x => ({ ...teamOf(x.team), score: x.score != null ? num(x.score) : null, home: x.homeAway === 'home', winner: !!x.winner })),
    };
  });
  return { date, season: Number(sb.leagues?.[0]?.season?.year) || null, games };
}

// A game's box score, normalized, with every check that it is complete and final. problems: why it can't be trusted
// yet (an incomplete response is never taken for a finished game).
export async function boxscore(id) {
  const sum = await fetchJson(`${SITE}/summary?event=${id}`);
  const c = sum?.header?.competitions?.[0];
  const problems = [];
  if (!c) return { id: String(id), problems: ['no game header'], players: [], teams: [] };
  const type = c.status?.type || {};
  const completed = statusOf(type) === 'final';
  if (!completed) problems.push(`status ${type.name || 'unknown'}`);
  const teams = (c.competitors || []).map(x => ({ ...teamOf(x.team), score: num(x.score), home: x.homeAway === 'home', winner: !!x.winner, periods: x.linescores?.length || 0 }));
  const players = [];
  for (const side of sum?.boxscore?.players || []) {
    const st = side.statistics?.[0]; if (!st) continue;
    const keys = st.keys || [], names = st.names || [];
    const get = (a, key, label) => { let i = keys.indexOf(key); if (i < 0) i = names.indexOf(label); return i >= 0 ? a.stats?.[i] : undefined; };
    for (const a of st.athletes || []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const split = s => String(s ?? '0-0').split('-').map(num);
      const [fgm, fga] = split(get(a, 'fieldGoalsMade-fieldGoalsAttempted', 'FG')), [tpm, tpa] = split(get(a, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT')), [ftm, fta] = split(get(a, 'freeThrowsMade-freeThrowsAttempted', 'FT'));
      const s = { min: num(get(a, 'minutes', 'MIN')), pts: num(get(a, 'points', 'PTS')), fgm, fga, tpm, tpa, ftm, fta,
        oreb: num(get(a, 'offensiveRebounds', 'OREB')), dreb: num(get(a, 'defensiveRebounds', 'DREB')), reb: num(get(a, 'rebounds', 'REB')), ast: num(get(a, 'assists', 'AST')),
        stl: num(get(a, 'steals', 'STL')), blk: num(get(a, 'blocks', 'BLK')), to: num(get(a, 'turnovers', 'TO')), pf: num(get(a, 'fouls', 'PF')), pm: num(get(a, 'plusMinus', '+/-')) };
      if (s.min <= 0 && !s.pts && !s.fga && !s.reb && !s.ast) continue; // listed but didn't play
      players.push({ id: String(a.athlete.id), name: a.athlete.displayName, short: a.athlete.shortName || a.athlete.displayName, pos: a.athlete.position?.abbreviation || '',
        headshot: a.athlete.headshot?.href || `https://a.espncdn.com/i/headshots/nba/players/full/${a.athlete.id}.png`, team: String(side.team?.id || ''), starter: !!a.starter, s });
    }
  }
  // Checks: both teams present, each with players; each team's player points add up to its score; minutes add up to
  // about five players for the whole game.
  if (teams.length !== 2) problems.push('not two teams');
  const ot = Math.max(0, Math.max(...teams.map(t => t.periods)) - 4);
  for (const t of teams) {
    const ps = players.filter(p => p.team === t.id);
    if (ps.length < 5) problems.push(`${t.abbr}: ${ps.length} players`);
    const pts = ps.reduce((n, p) => n + p.s.pts, 0);
    if (completed && pts !== t.score) problems.push(`${t.abbr}: players' points ${pts} ≠ score ${t.score}`);
    const min = ps.reduce((n, p) => n + p.s.min, 0), full = 240 + 25 * ot;
    if (completed && Math.abs(min - full) > 10) problems.push(`${t.abbr}: ${min} player minutes for a ${full}-minute game`);
  }
  const seasonType = Number(sum?.header?.season?.type) || 2;
  return { id: String(id), date: ymd(c.date ? new Date(new Date(c.date).getTime() - 5 * 3600e3).toISOString() : ''), season: Number(sum?.header?.season?.year) || null,
    stype: seasonType, completed, ot, teams, players, problems };
}

// ESPN's own season figures for one player (only the PROVIDER statistics), or null.
export async function seasonFigures(season, stype, athleteId) {
  const j = await fetchJson(`${CORE}/seasons/${season}/types/${stype}/athletes/${athleteId}/statistics`).catch(() => null);
  const cats = j?.splits?.categories;
  if (!cats) return null;
  const all = new Map(cats.flatMap(c => (c.stats || []).map(s => [s.name, s.value])));
  const out = {};
  for (const p of PROVIDER) { const v = all.get(p.src); if (typeof v === 'number' && Number.isFinite(v)) out[p.k] = v; }
  return out;
}
export const seasonFiguresMany = (season, stype, ids, n = 8) => pool(ids, n, async id => [id, await seasonFigures(season, stype, id)]);

// A season's game dates (regular season through the Finals), from ESPN's calendar and season types.
export async function seasonInfo(year) {
  const [reg, post, sb] = await Promise.all([
    fetchJson(`${CORE}/seasons/${year}/types/2`).catch(() => null),
    fetchJson(`${CORE}/seasons/${year}/types/3`).catch(() => null),
    fetchJson(`${SITE}/scoreboard?dates=${year - 1}1201&limit=1`).catch(() => null),
  ]);
  const start = ymd(reg?.startDate), end = ymd(post?.endDate || reg?.endDate);
  const cal = (sb?.leagues?.[0]?.calendar || []).map(c => ymd(typeof c === 'string' ? c : c.startDate));
  const dates = [...new Set(cal)].filter(x => (!start || x >= start) && (!end || x <= end)).sort();
  return { year, label: `${year - 1}-${String(year % 100).padStart(2, '0')}`, start: start || dates[0], end: end || dates[dates.length - 1], playoffStart: ymd(post?.startDate) || null, dates };
}
