// Data-source probe for Around the NBA Studio: saves each endpoint's response shape (and a few full responses) to probe/.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe/raw', { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (AroundTheNBA probe)', accept: 'application/json' };
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const out = [];
const log = s => { out.push(s); console.log(s); };
async function get(name, url, { save = false, headers = UA } = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* */ }
    log(`\n## ${name} ${r.status} ${txt.length}B ${Date.now() - t}ms ${url}\n   cache-control: ${r.headers.get('cache-control')}`);
    if (j) { log(shape(j, 0, 3).join('\n')); if (save) writeFileSync(`probe/raw/${name}.json`, JSON.stringify(j, null, 1)); }
    else log('   ' + txt.slice(0, 200).replace(/\n/g, ' '));
    return j;
  } catch (e) { log(`\n## ${name} FAILED ${e.message} ${url}`); return null; }
}
function shape(v, d, max, pre = '   ') {
  const lines = [];
  const walk = (v, d, key) => {
    const p = pre + '  '.repeat(d) + (key != null ? key + ': ' : '');
    if (Array.isArray(v)) { lines.push(`${p}[${v.length}]`); if (v.length && d < max + 2) walk(v[0], d + 1, '0'); }
    else if (v && typeof v === 'object') { const ks = Object.keys(v); lines.push(`${p}{${ks.length}}`); if (d < max + 2) for (const k of ks.slice(0, 40)) walk(v[k], d + 1, k); }
    else lines.push(`${p}${JSON.stringify(v)?.slice(0, 80)}`);
  };
  walk(v, d);
  return lines.slice(0, 400);
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const today = new Date(Date.now() - 5 * 3600e3);
const sb = await get('scoreboard_today', `${SITE}/scoreboard`, { save: true });
const yest = await get('scoreboard_yesterday', `${SITE}/scoreboard?dates=${ymd(new Date(today - 86400e3))}`, { save: true });
const ev = yest?.events?.[0]?.id;
if (ev) await get('summary_recent', `${SITE}/summary?event=${ev}`, { save: true });
const live = sb?.events?.find(e => e.status?.type?.state === 'in')?.id;
if (live) await get('summary_live', `${SITE}/summary?event=${live}`, { save: true });
await get('standings', `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings`, { save: true });
await get('teams', `${SITE}/teams`, { save: true });
await get('team_13', `${SITE}/teams/13`, { save: true });
await get('roster_13', `${SITE}/teams/13/roster`, { save: true });
const pid = '1966'; // LeBron James
await get('athlete', `${WEB}/athletes/${pid}`, { save: true });
await get('athlete_overview', `${WEB}/athletes/${pid}/overview`, { save: true });
await get('athlete_stats', `${WEB}/athletes/${pid}/stats`, { save: true });
await get('athlete_stats_post', `${WEB}/athletes/${pid}/stats?seasontype=3`, { save: true });
await get('athlete_gamelog', `${WEB}/athletes/${pid}/gamelog`, { save: true });
await get('athlete_gamelog_2004', `${WEB}/athletes/${pid}/gamelog?season=2004`, { save: true });
await get('athlete_splits', `${WEB}/athletes/${pid}/splits`);
await get('search', `https://site.web.api.espn.com/apis/common/v3/search?query=curry&limit=5&type=player&sport=basketball&league=nba`, { save: true });
await get('search2', `https://site.web.api.espn.com/apis/search/v2?query=curry&limit=5`);
await get('core_leaders', `${CORE}/seasons/2026/types/2/leaders?limit=5`);
await get('core_athlete_career', `${CORE}/athletes/${pid}/statistics/0`);
await get('core_athletes_active', `${CORE}/athletes?limit=1000&active=true`);
await get('byathlete', `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=3&season=2026&seasontype=2`);
await get('news', `${SITE}/news?limit=5`, { save: true });
// How far back do box scores go?
for (const d of ['20231115', '20101115', '20021115', '19981115', '19951115', '19901115', '19851115', '19751115']) {
  const s = await get(`scoreboard_${d}`, `${SITE}/scoreboard?dates=${d}`);
  const id = s?.events?.[0]?.id;
  if (id) {
    const m = await get(`summary_${d}`, `${SITE}/summary?event=${id}`);
    log(`   >>> ${d}: boxscore players sides ${m?.boxscore?.players?.length}, athletes ${m?.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length}, plays ${m?.plays?.length}, linescores ${m?.header?.competitions?.[0]?.competitors?.[0]?.linescores?.length}`);
  }
}
// Other providers.
await get('nba_cdn_scoreboard', 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/' } });
await get('nba_stats_alltime', 'https://stats.nba.com/stats/alltimeleadersgrids?LeagueID=00&PerMode=Totals&SeasonType=Regular%20Season&TopX=10', { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/', origin: 'https://www.nba.com', 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true', accept: 'application/json' } });
await get('bbref', 'https://www.basketball-reference.com/leaders/pts_career.html', { headers: { 'user-agent': 'Mozilla/5.0' } });
await get('balldontlie', 'https://api.balldontlie.io/v1/teams');
writeFileSync('probe/report.txt', out.join('\n'));
