// ESPN: the primary data provider (no key; public endpoints, cached by ESPN for a few seconds). Research and limits are
// documented in lib/providers/index.js. Everything is normalized here; nothing outside lib/providers reads ESPN's shapes.
import { getJson } from '../fetcher.js';
import { num, etDate, seasonOf } from '../util.js';
import { TEAM_STATS } from '../stats.js';

const env = (k, d) => process.env[k] || d;
const SITE = () => env('ESPN_SITE', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba');
const STAND = () => env('ESPN_STANDINGS', 'https://site.api.espn.com/apis/v2/sports/basketball/nba');
const WEB = () => env('ESPN_WEB', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba');
const SEARCH = () => env('ESPN_SEARCH', 'https://site.web.api.espn.com/apis/common/v3/search');
const CORE = () => env('ESPN_CORE', 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba');
const get = (url, ttl) => getJson(url, { ttl, source: 'ESPN' });
// Live reads skip a stale edge-cached copy: a cache-buster that changes every 2 seconds (same-moment reads still share).
const bust = (sep = '&') => (process.env.ATN_CACHE_BUST === '0' ? '' : `${sep}_=${Math.floor(Date.now() / 2000)}`);

export const id = 'espn';
export const headshot = pid => `https://a.espncdn.com/i/headshots/nba/players/full/${pid}.png`;
export const teamLogo = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${String(abbr).toLowerCase()}.png`;
export const gameUrl = gid => `https://www.espn.com/nba/game/_/gameId/${gid}`;
export const boxUrl = gid => `https://www.espn.com/nba/boxscore/_/gameId/${gid}`;
export const playerUrl = pid => `https://www.espn.com/nba/player/_/id/${pid}`;

const GAME_TYPES = new Set([2, 3, 5]); // regular season, playoffs, play-in
const NBA_TEAM = t => +t?.id >= 1 && +t?.id <= 30; // All-Star and exhibition opponents aren't franchises

// ESPN status → ours.
export function statusOf(type = {}) {
  const n = String(type.name || '').toUpperCase();
  if (/POSTPONED/.test(n)) return 'postponed';
  if (/CANCEL|FORFEIT/.test(n)) return 'canceled';
  if (/SUSPENDED/.test(n)) return 'suspended';
  if (type.completed || /FINAL/.test(n)) return 'final';
  if (/HALFTIME/.test(n)) return 'halftime';
  if (/DELAYED/.test(n)) return 'delayed';
  if (type.state === 'in' || /IN_PROGRESS|END_PERIOD/.test(n)) return 'in';
  return 'scheduled';
}
export const isLive = s => ['in', 'halftime', 'delayed'].includes(s);

const color = c => (c ? `#${String(c).replace('#', '')}` : null);
function team(t = {}) {
  return { id: String(t.id || ''), abbr: t.abbreviation || '', name: t.displayName || '', short: t.shortDisplayName || t.name || '', location: t.location || '',
    color: color(t.color), alt: color(t.alternateColor), logo: t.abbreviation ? teamLogo(t.abbreviation) : t.logo || null };
}

function competitorOf(x, withStats) {
  const rec = x.records || x.record || [];
  return {
    ...team(x.team), score: x.score != null && x.score !== '' ? num(x.score?.value ?? x.score) : null, home: x.homeAway === 'home', winner: !!x.winner,
    record: rec.find(r => r.type === 'total' || r.name === 'overall')?.summary || null,
    linescores: (x.linescores || []).map(l => num(l.value ?? l.displayValue)),
    ...(withStats ? {} : {}),
  };
}

// One game from a scoreboard event or a summary header.
function gameOf(e, comp) {
  const c = comp || e.competitions?.[0] || {};
  const type = e.status?.type || c.status?.type || {};
  const st = e.status || c.status || {};
  const teams = (c.competitors || []).map(x => competitorOf(x)).sort((a, b) => a.home - b.home); // away first
  const status = statusOf(type);
  const start = e.date || c.date || null;
  const sit = c.situation || {};
  const stype = Number(e.season?.type) || 2;
  const periods = Math.max(0, ...teams.map(t => t.linescores.length));
  return {
    id: String(e.id || c.id), start, date: start ? etDate(start) : null, season: Number(e.season?.year) || (start ? seasonOf(etDate(start)) : null), stype,
    status, state: type.state || (status === 'final' ? 'post' : isLive(status) ? 'in' : 'pre'),
    period: Number(st.period) || periods || 0, clock: st.displayClock ?? null, detail: type.shortDetail || type.detail || '',
    ot: Math.max(0, (Number(st.period) || periods) - 4), teams,
    possession: sit.possession ? String(sit.possession) : (c.competitors || []).find(x => x.possession)?.id || null,
    lastPlay: sit.lastPlay?.text || null,
    venue: c.venue?.fullName || null, broadcast: (c.broadcasts || []).flatMap(b => b.names || []).join(', ') || null,
    note: c.notes?.[0]?.headline || null, neutral: !!c.neutralSite,
  };
}

export async function scoreboard(date) {
  const j = await get(`${SITE()}/scoreboard${date ? `?dates=${date}&limit=100` : ''}${bust(date ? '&' : '?')}`, 3);
  if (!j || !Array.isArray(j.events)) throw Object.assign(new Error('ESPN scoreboard came back without games'), { status: 502 });
  const games = j.events.filter(e => GAME_TYPES.has(Number(e.season?.type)) && (e.competitions?.[0]?.competitors || []).every(x => NBA_TEAM(x.team))).map(e => gameOf(e));
  return { date: date || j.day?.date?.replace(/-/g, '') || etDate(), season: Number(j.leagues?.[0]?.season?.year) || null, games, fetchedAt: new Date(), source: 'ESPN scoreboard' };
}

// A box-score line from one athlete row (columns found by key, or by label for older games).
function lineOf(st, a) {
  const keys = st.keys || [], names = st.names || st.labels || [];
  const col = (key, label) => { let i = keys.indexOf(key); if (i < 0) i = names.indexOf(label); return i >= 0 ? a.stats?.[i] : undefined; };
  const pair = (key, label) => String(col(key, label) ?? '0-0').split('-').map(num);
  const [fgm, fga] = pair('fieldGoalsMade-fieldGoalsAttempted', 'FG');
  const [tpm, tpa] = pair('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT');
  const [ftm, fta] = pair('freeThrowsMade-freeThrowsAttempted', 'FT');
  const orb = num(col('offensiveRebounds', 'OREB')), drb = num(col('defensiveRebounds', 'DREB'));
  const rebRaw = col('rebounds', 'REB');
  return {
    min: num(col('minutes', 'MIN')), pts: num(col('points', 'PTS')), fgm, fga, tpm, tpa, ftm, fta, orb, drb,
    reb: rebRaw != null ? num(rebRaw) : orb + drb, ast: num(col('assists', 'AST')), stl: num(col('steals', 'STL')), blk: num(col('blocks', 'BLK')),
    tov: num(col('turnovers', 'TO')), pf: num(col('fouls', 'PF')), pm: num(col('plusMinus', '+/-')),
  };
}

// The full game center: game, team statistics, players, play-by-play, plus the checks that say whether a final box
// score can be trusted (both teams, points adding up to each score, minutes adding up to the game).
export async function game(gid, { ttl = 8 } = {}) {
  const j = await get(`${SITE()}/summary?event=${gid}${ttl <= 5 ? bust() : ''}`, ttl);
  const comp = j?.header?.competitions?.[0];
  if (!comp) return null;
  const g = gameOf({ ...j.header, id: gid, season: j.header?.season }, comp);
  const players = [], teamStats = {};
  for (const t of j.boxscore?.teams || []) {
    const tid = String(t.team?.id);
    teamStats[tid] = {};
    for (const s of t.statistics || []) {
      const [k, label] = TEAM_STATS[s.name] || [s.name, s.label || s.name];
      teamStats[tid][k] = { label, value: s.displayValue };
    }
  }
  for (const side of j.boxscore?.players || []) {
    const st = side.statistics?.[0]; if (!st) continue;
    for (const a of st.athletes || []) {
      const dnp = !!a.didNotPlay || !a.stats?.length;
      players.push({
        id: String(a.athlete?.id), name: a.athlete?.displayName, short: a.athlete?.shortName || a.athlete?.displayName, pos: a.athlete?.position?.abbreviation || '',
        jersey: a.athlete?.jersey || '', team: String(side.team?.id), starter: !!a.starter, dnp, reason: dnp ? a.reason || 'DNP' : null, ejected: !!a.ejected,
        headshot: a.athlete?.headshot?.href || headshot(a.athlete?.id),
        line: dnp ? null : lineOf(st, a),
      });
    }
  }
  const plays = (j.plays || []).map(p => ({
    id: String(p.id), seq: num(p.sequenceNumber), period: num(p.period?.number), clock: p.clock?.displayValue || '', text: p.text || '', type: p.type?.text || '',
    team: p.team?.id ? String(p.team.id) : null, scoring: !!p.scoringPlay, value: num(p.scoreValue), away: num(p.awayScore), home: num(p.homeScore),
    players: (p.participants || []).map(x => String(x.athlete?.id)).filter(Boolean), shooting: !!p.shootingPlay, wall: p.wallclock || null,
  }));
  const problems = checks(g, players);
  return { game: g, teamStats, players, plays, problems, officials: (j.gameInfo?.officials || []).map(o => o.displayName), attendance: j.gameInfo?.attendance || null,
    fetchedAt: new Date(), source: 'ESPN game summary', url: gameUrl(gid) };
}

export function checks(g, players) {
  const problems = [];
  if (g.status !== 'final') return problems;
  if (g.teams.length !== 2) problems.push('not two teams');
  const full = 240 + 25 * g.ot;
  for (const t of g.teams) {
    const ps = players.filter(p => p.team === t.id && p.line);
    if (ps.length < 5) { problems.push(`${t.abbr}: ${ps.length} players with statistics`); continue; }
    const pts = ps.reduce((n, p) => n + p.line.pts, 0);
    if (pts !== t.score) problems.push(`${t.abbr}: players' points ${pts} ≠ team score ${t.score}`);
    const min = ps.reduce((n, p) => n + p.line.min, 0);
    if (min && Math.abs(min - full) > 10) problems.push(`${t.abbr}: ${min} player minutes in a ${full}-minute game`);
    const quarters = t.linescores.reduce((a, b) => a + b, 0);
    if (t.linescores.length && quarters !== t.score) problems.push(`${t.abbr}: quarter scores add to ${quarters}, not ${t.score}`);
  }
  return problems;
}

export async function standings() {
  const j = await get(`${STAND()}/standings`, 300);
  const confs = (j?.children || []).map(c => ({
    name: c.name, abbr: c.abbreviation,
    teams: (c.standings?.entries || []).map(e => {
      const s = Object.fromEntries((e.stats || []).map(x => [x.name || x.type, x.displayValue ?? x.summary]));
      return { ...team(e.team), wins: num(s.wins), losses: num(s.losses), pct: s.winPercent, gb: s.gamesBehind, streak: s.streak, seed: num(s.playoffSeed),
        home: s.Home, road: s.Road, last10: s['Last Ten Games'], ppg: s.avgPointsFor, oppg: s.avgPointsAgainst, diff: s.differential };
    }).sort((a, b) => a.seed - b.seed || b.wins - a.wins),
  }));
  return { conferences: confs, fetchedAt: new Date(), source: 'ESPN standings' };
}

export async function teams() {
  const j = await get(`${SITE()}/teams`, 86400);
  return (j?.sports?.[0]?.leagues?.[0]?.teams || []).map(x => x.team).filter(NBA_TEAM).map(t => ({ ...team(t), logoDark: (t.logos || []).find(l => /500-dark\/[a-z]+\.png$/.test(l.href))?.href || null }));
}

export async function teamInfo(tid) {
  const j = await get(`${SITE()}/teams/${tid}`, 3600);
  const t = j?.team; if (!t) return null;
  return { ...team(t), record: t.record?.items?.find(r => r.type === 'total')?.summary || null, standing: t.standingSummary || null,
    nextEvent: t.nextEvent?.[0] ? gameOf(t.nextEvent[0]) : null };
}

const bioOf = a => ({
  id: String(a.id), name: a.displayName || a.fullName, first: a.firstName || '', last: a.lastName || '', short: a.shortName || a.displayName,
  pos: a.position?.abbreviation || '', posName: a.position?.displayName || '', jersey: a.jersey || '',
  dob: a.dateOfBirth || null, birthPlace: a.birthPlace ? [a.birthPlace.city, a.birthPlace.state, a.birthPlace.country].filter(Boolean).join(', ') : null,
  country: a.birthPlace?.country || a.citizenship || null, height: a.displayHeight || null, weight: a.displayWeight || null,
  debut: a.debutYear || null, experience: a.experience?.years ?? null, college: a.college?.name || null,
  draft: a.draft ? { year: a.draft.year, round: a.draft.round, pick: a.draft.selection } : null,
  active: a.active ?? (a.status?.type === 'active' ? true : undefined), headshot: headshot(a.id),
});

export async function roster(tid) {
  const j = await get(`${SITE()}/teams/${tid}/roster`, 3600);
  return (j?.athletes || []).flatMap(x => x.items || [x]).filter(a => a?.id).map(a => ({ ...bioOf(a), team: String(tid), active: true }));
}

// A player's biography (ESPN's core API carries birth date, birthplace, draft and debut for every era).
export async function athlete(pid) {
  const [core, web] = await Promise.all([
    get(`${CORE()}/athletes/${pid}`, 86400).catch(() => null),
    get(`${WEB()}/athletes/${pid}`, 3600).catch(() => null),
  ]);
  const a = { ...(web?.athlete || {}), ...(core || {}) };
  if (!a.id) return null;
  const bio = bioOf(a);
  const tm = web?.athlete?.team;
  return { ...bio, team: tm?.id ? String(tm.id) : null, teamName: tm?.displayName || null, active: web?.athlete?.active ?? bio.active ?? null, status: web?.athlete?.status?.name || null };
}

// Career statistics by season (regular season or playoffs) and the career totals, as ESPN publishes them.
export async function career(pid, stype = 2) {
  const j = await get(`${WEB()}/athletes/${pid}/stats${stype === 3 ? '?seasontype=3' : ''}`, 3600);
  if (!j?.categories) return null;
  const out = { seasons: {}, totals: {}, source: 'ESPN career statistics', url: `https://www.espn.com/nba/player/stats/_/id/${pid}` };
  const put = (o, names, vals) => names.forEach((n, i) => {
    const v = vals?.[i]; if (v == null) return;
    if (n.includes('-')) { const [a, b] = n.split('-'); const [x, y] = String(v).split('-'); o[a] = num(x); o[b] = num(y); } else o[n] = num(v);
  });
  for (const c of j.categories) {
    for (const s of c.statistics || []) {
      const y = s.season?.year; if (!y) continue;
      const row = out.seasons[`${y}:${s.teamId || ''}`] ||= { season: y, team: s.teamId ? String(s.teamId) : null };
      put(row, c.names, s.stats);
    }
    if (c.totals) put(out.totals, c.names, c.totals);
  }
  out.seasons = Object.values(out.seasons).sort((a, b) => a.season - b.season);
  // Career totals in our keys.
  const t = out.totals;
  out.career = { gp: t.gamesPlayed, pts: t.points, reb: t.totalRebounds, ast: t.assists, stl: t.steals, blk: t.blocks, tpm: t.threePointFieldGoalsMade, fgm: t.fieldGoalsMade, ftm: t.freeThrowsMade, tov: t.turnovers, orb: t.offensiveRebounds, drb: t.defensiveRebounds, dd: t.doubleDouble, td: t.tripleDouble };
  return out;
}

// A player's game log for a season: [{ gid, date, opp, home, result, line }].
export async function gamelog(pid, season) {
  const j = await get(`${WEB()}/athletes/${pid}/gamelog${season ? `?season=${season}` : ''}`, 600);
  if (!j?.names) return [];
  const names = j.names, evs = j.events || {};
  const rows = [];
  for (const st of j.seasonTypes || []) {
    const stype = /postseason|playoff/i.test(st.displayName) ? 3 : /preseason/i.test(st.displayName) ? 1 : /play-?in/i.test(st.displayName) ? 5 : 2;
    if (stype === 1) continue;
    for (const c of st.categories || []) for (const e of c.events || []) {
      const v = Object.fromEntries(names.map((n, i) => [n, e.stats?.[i]]));
      const [fgm, fga] = String(v['fieldGoalsMade-fieldGoalsAttempted'] || '0-0').split('-').map(num);
      const [tpm, tpa] = String(v['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] || '0-0').split('-').map(num);
      const [ftm, fta] = String(v['freeThrowsMade-freeThrowsAttempted'] || '0-0').split('-').map(num);
      const ev = evs[e.eventId] || {};
      rows.push({ gid: String(e.eventId), stype, date: ev.gameDate ? etDate(ev.gameDate) : null, opp: ev.opponent?.abbreviation || null, home: ev.atVs === 'vs', result: ev.gameResult || null, score: ev.score || null,
        line: { min: num(v.minutes), pts: num(v.points), fgm, fga, tpm, tpa, ftm, fta, reb: num(v.totalRebounds), ast: num(v.assists), stl: num(v.steals), blk: num(v.blocks), tov: num(v.turnovers), pf: num(v.fouls) } });
    }
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function search(q) {
  const j = await get(`${SEARCH()}?query=${encodeURIComponent(q)}&limit=10&type=player&sport=basketball&league=nba`, 600);
  return (j?.items || []).filter(x => x.type === 'player' && x.league === 'nba').map(x => ({ id: String(x.id), name: x.displayName, headshot: headshot(x.id) }));
}

export async function news(limit = 25) {
  const j = await get(`${SITE()}/news?limit=${limit}`, 300);
  return (j?.articles || []).map(a => ({
    id: String(a.id || a.dataSourceIdentifier || a.headline), headline: a.headline, description: a.description || '', published: a.published, url: a.links?.web?.href || null,
    image: a.images?.[0]?.url || null, type: a.type || null,
    teams: (a.categories || []).filter(c => c.type === 'team' && c.teamId).map(c => String(c.teamId)),
    players: (a.categories || []).filter(c => c.type === 'athlete' && c.athleteId).map(c => String(c.athleteId)),
    source: 'ESPN',
  }));
}

// The league's season dates for backfills: every day from the regular season's start to the end of the playoffs (some
// seasons start late — 2011-12 on Dec 25, 2020-21 on Dec 22 — so nothing is assumed about the calendar).
export async function seasonDates(year) {
  const [reg, post] = await Promise.all([
    get(`${CORE()}/seasons/${year}/types/2`, 86400).catch(() => null),
    get(`${CORE()}/seasons/${year}/types/3`, 86400).catch(() => null),
  ]);
  const ymd = iso => String(iso || '').slice(0, 10).replace(/-/g, '');
  const start = ymd(reg?.startDate) || `${year - 1}1001`, end = ymd(post?.endDate || reg?.endDate) || `${year}0630`;
  const dates = [];
  for (let d = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T12:00:00Z`); ; d = new Date(+d + 86400e3)) {
    const x = d.toISOString().slice(0, 10).replace(/-/g, '');
    if (x > end) break;
    dates.push(x);
  }
  return { year, start, end, playoffStart: ymd(post?.startDate) || null, dates };
}
