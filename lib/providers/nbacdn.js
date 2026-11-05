// NBA.com's live-data CDN: the second, independent source. Used to cross-check final scores and every player's points
// before anything is marked verified. (The stats.nba.com API does not answer cloud servers; the CDN does.)
import { getJson } from '../fetcher.js';
import { etDate } from '../util.js';

const BASE = () => process.env.NBA_CDN || 'https://cdn.nba.com/static/json';
const HEAD = { referer: 'https://www.nba.com/', origin: 'https://www.nba.com' };
const get = (url, ttl) => getJson(url, { ttl, headers: HEAD, source: 'NBA.com' });

export const id = 'nbacdn';
// ESPN abbreviations → NBA tricodes where they differ.
const TRI = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BKN: 'BKN' };
export const tricode = abbr => TRI[abbr] || abbr;
export const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

// date + away/home tricodes → NBA game id, from the league schedule (cached six hours).
async function gameIdFor(date, away, home) {
  const today = await get(`${BASE()}/liveData/scoreboard/todaysScoreboard_00.json`, 30).catch(() => null);
  const t = today?.scoreboard?.games?.find(g => g.awayTeam?.teamTricode === away && g.homeTeam?.teamTricode === home && etDate(g.gameTimeUTC || g.gameEt) === date);
  if (t) return t.gameId;
  const sched = await get(`${BASE()}/staticData/scheduleLeagueV2.json`, 21600).catch(() => null);
  for (const d of sched?.leagueSchedule?.gameDates || []) for (const g of d.games || []) {
    if (g.awayTeam?.teamTricode === away && g.homeTeam?.teamTricode === home && etDate(g.gameDateTimeUTC || g.gameDateUTC) === date) return g.gameId;
  }
  return null;
}

// The NBA's box score for a game we know from ESPN: { gameId, status, teams: { TRI: score }, players: { normName: pts } }.
export async function boxFor(game) {
  const [a, h] = game.teams.map(t => tricode(t.abbr));
  const gid = await gameIdFor(game.date, a, h);
  if (!gid) return null;
  const j = await get(`${BASE()}/liveData/boxscore/boxscore_${gid}.json`, 20);
  const g = j?.game; if (!g) return null;
  const players = {};
  for (const side of [g.homeTeam, g.awayTeam]) for (const p of side?.players || []) {
    if (p.played === '0' && !p.statistics?.points) continue;
    players[normName(p.name)] = { pts: p.statistics?.points ?? 0, reb: p.statistics?.reboundsTotal ?? 0, ast: p.statistics?.assists ?? 0, team: side.teamTricode };
  }
  return { gameId: gid, final: g.gameStatus === 3, teams: { [g.awayTeam.teamTricode]: g.awayTeam.score, [g.homeTeam.teamTricode]: g.homeTeam.score }, players,
    url: `https://www.nba.com/game/${gid}/box-score`, fetchedAt: new Date() };
}

// Cross-check an ESPN final against NBA.com: scores, and points/rebounds/assists for every player found in both.
export async function crossCheck(game, players) {
  const nba = await boxFor(game).catch(e => ({ error: e.message }));
  if (!nba || nba.error) return { status: 'unavailable', detail: nba?.error || 'NBA.com has no box score for this game', source: 'NBA.com' };
  if (!nba.final) return { status: 'pending', detail: 'NBA.com does not list the game as final yet', source: 'NBA.com', url: nba.url };
  const diffs = [];
  for (const t of game.teams) { const s = nba.teams[tricode(t.abbr)]; if (s !== t.score) diffs.push(`${t.abbr} score: ESPN ${t.score}, NBA.com ${s}`); }
  let matched = 0;
  for (const p of players.filter(x => x.line)) {
    const n = nba.players[normName(p.name)]; if (!n) continue;
    matched++;
    for (const k of ['pts', 'reb', 'ast']) if (n[k] !== p.line[k]) diffs.push(`${p.name} ${k}: ESPN ${p.line[k]}, NBA.com ${n[k]}`);
  }
  return { status: diffs.length ? 'mismatch' : 'match', matched, diffs, source: 'NBA.com', url: nba.url, at: new Date() };
}
