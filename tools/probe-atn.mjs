// Data-source probe, round 2: historical bios, how far back ESPN box scores go, NBA CDN live box score shape.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe/raw', { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (AroundTheNBA probe)', accept: 'application/json' };
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const out = [];
const log = s => { out.push(s); console.log(s); };
async function get(name, url, { save = false, headers = UA } = {}) {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* */ }
    log(`## ${name} ${r.status} ${txt.length}B ${url}`);
    if (j && save) writeFileSync(`probe/raw/${name}.json`, JSON.stringify(j, null, 1));
    return j;
  } catch (e) { log(`## ${name} FAILED ${e.message}`); return null; }
}
await get('core_athlete_1966', `${CORE}/athletes/1966`, { save: true });
await get('core_athlete_old', `${CORE}/athletes/1035`, { save: true }); // an older player id
await get('core_athlete_stats_1966', `${CORE}/athletes/1966/statistics/0`, { save: true });
// Coverage: one date per season, box score athletes and play-by-play count.
for (let y = 1990; y <= 2004; y++) {
  for (const md of ['1215', '0215']) {
    const d = md === '1215' ? `${y}${md}` : `${y + 1}${md}`;
    const s = await get(`sb_${d}`, `${SITE}/scoreboard?dates=${d}`);
    const ev = s?.events || [];
    let line = `   >>> ${d}: ${ev.length} games`;
    if (ev[0]) {
      const m = await get(`sum_${d}`, `${SITE}/summary?event=${ev[0].id}`, { save: d === '19961215' });
      const sides = m?.boxscore?.players || [];
      const a = sides[0]?.statistics?.[0];
      line += `, keys ${JSON.stringify(a?.keys || a?.names)}, athletes ${a?.athletes?.length}, plays ${m?.plays?.length}, teamstats ${m?.boxscore?.teams?.[0]?.statistics?.length}`;
      if (a?.athletes?.[0]) line += `, first ${JSON.stringify(a.athletes[0].stats)}`;
    }
    log(line);
  }
}
// Playoffs coverage and NBA Cup notes.
await get('sb_20030601', `${SITE}/scoreboard?dates=20030601`, { save: true });
// NBA CDN: today's scoreboard, then a box score and play-by-play.
const nsb = await get('nba_sb', 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', { save: true, headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/' } });
const gid = nsb?.scoreboard?.games?.find(g => g.gameStatus === 3)?.gameId || nsb?.scoreboard?.games?.[0]?.gameId;
if (gid) {
  await get('nba_box', `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gid}.json`, { save: true, headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/' } });
  await get('nba_pbp', `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gid}.json`, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/' } });
}
await get('nba_schedule', 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.nba.com/' } });
writeFileSync('probe/report.txt', out.join('\n'));
