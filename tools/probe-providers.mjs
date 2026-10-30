// Stage 1 research: what each NBA data provider actually serves, from GitHub Actions. Writes probe/providers/*.json
// and a report on stdout.  node tools/probe-providers.mjs
import fs from 'node:fs';

fs.mkdirSync('probe/providers', { recursive: true });
const save = (name, data) => fs.writeFileSync(`probe/providers/${name}.json`, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', accept: 'application/json, text/plain, */*' };
async function get(name, url, headers = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    console.log(`\n### ${name}: ${r.status} in ${Date.now() - t0}ms, ${text.length} bytes, cors=${r.headers.get('access-control-allow-origin')}`);
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    save(name, json || text.slice(0, 20000));
    return json;
  } catch (e) { console.log(`\n### ${name}: FAILED ${e.message} after ${Date.now() - t0}ms`); return null; }
}
const keysDeep = (o, depth = 2, p = '') => !o || typeof o !== 'object' || depth < 0 ? [] : Object.entries(o).flatMap(([k, v]) => [`${p}${k}`, ...(Array.isArray(v) ? keysDeep(v[0], depth - 1, `${p}${k}[].`) : keysDeep(v, depth - 1, `${p}${k}.`))]);

// ESPN: season stats by athlete (league-wide table)
const by = await get('espn_byathlete', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=50&sort=offensive.avgPoints:desc&season=2025&seasontype=2');
if (by) {
  console.log('keys', keysDeep(by, 1).join(', '));
  console.log('pagination', JSON.stringify(by.pagination));
  for (const c of by.categories || []) console.log(`category ${c.name}: ${(c.names || []).join(', ')}`);
  for (const c of by.categories || []) console.log(`  labels ${c.name}: ${(c.labels || []).join(', ')}`);
  const a = by.athletes?.[0];
  console.log('athlete keys', keysDeep(a, 2).join(', '));
  console.log('first athlete', JSON.stringify(a).slice(0, 1500));
}
const byPo = await get('espn_byathlete_playoffs', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=5&season=2025&seasontype=3');
console.log('playoffs athletes', byPo?.athletes?.length, byPo?.pagination?.count);
const byOld = await get('espn_byathlete_2016', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=5&season=2016&seasontype=2');
console.log('2016 athletes', byOld?.athletes?.length, byOld?.pagination?.count);

// ESPN core: one athlete's season statistics (all categories)
const core = await get('espn_core_athlete_stats', 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025/types/2/athletes/3112335/statistics');
for (const c of core?.splits?.categories || []) console.log(`core ${c.name}: ${(c.stats || []).map(s => s.name).join(', ')}`);

// ESPN: game log for a player, and a game summary box score
const log = await get('espn_gamelog', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3112335/gamelog?season=2025');
console.log('gamelog names', JSON.stringify(log?.names), 'labels', JSON.stringify(log?.labels));
const sb = await get('espn_scoreboard', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20250115&limit=100');
console.log('status names', [...new Set((sb?.events || []).map(e => e.status?.type?.name))]);
const sum = await get('espn_summary', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401705127');
const st = sum?.boxscore?.players?.[0]?.statistics?.[0];
console.log('box names', JSON.stringify(st?.names), 'keys', JSON.stringify(st?.keys), 'descriptions', JSON.stringify(st?.descriptions));
console.log('team stats', JSON.stringify(sum?.boxscore?.teams?.[0]?.statistics?.map(s => s.name)));

// NBA.com: stats API (often blocks cloud hosts) and the public CDN
const nbaHeaders = { referer: 'https://www.nba.com/', origin: 'https://www.nba.com', 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true' };
const adv = await get('nba_stats_advanced', 'https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=2024-25&SeasonSegment=&SeasonType=Regular%20Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=', nbaHeaders);
console.log('nba stats advanced headers', JSON.stringify(adv?.resultSets?.[0]?.headers));
const cdnSb = await get('nba_cdn_scoreboard', 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json');
console.log('cdn scoreboard games', cdnSb?.scoreboard?.games?.length, cdnSb?.scoreboard?.gameDate);
const gid = cdnSb?.scoreboard?.games?.find(g => g.gameStatus === 3)?.gameId || '0022400555';
const cdnBox = await get('nba_cdn_boxscore', `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gid}.json`);
console.log('cdn box player stat keys', JSON.stringify(Object.keys(cdnBox?.game?.homeTeam?.players?.[0]?.statistics || {})));
const sched = await get('nba_cdn_schedule', 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json');
console.log('cdn schedule', sched?.leagueSchedule?.seasonYear, sched?.leagueSchedule?.gameDates?.length);

// Headshots: CORS for in-browser export
for (const [n, u] of [['espn_headshot', 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png'], ['nba_headshot', 'https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png']]) {
  try { const r = await fetch(u, { method: 'GET', headers: { ...UA, origin: 'https://example.com' } }); console.log(`\n### ${n}: ${r.status} ${r.headers.get('content-type')} cors=${r.headers.get('access-control-allow-origin')} len=${r.headers.get('content-length')}`); } catch (e) { console.log(n, 'FAILED', e.message); }
}
