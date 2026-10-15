// Probe ESPN's free API for what a player library can use. Writes probe/*.json (trimmed) and probe/report.txt.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const H = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
async function get(name, url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: H });
    const txt = await r.text();
    log(`\n### ${name} ${r.status} ${txt.length}B ${Date.now() - t}ms\n${url}`);
    let j = null; try { j = JSON.parse(txt); } catch { log('not json: ' + txt.slice(0, 200)); }
    if (j) fs.writeFileSync(`probe/${name}.json`, JSON.stringify(j, null, 1).slice(0, 400000));
    return j;
  } catch (e) { log(`\n### ${name} ERR ${e.message}\n${url}`); return null; }
}
const keys = (o, d = 0) => (o && typeof o === 'object' ? Object.keys(o).slice(0, 40).join(', ') : String(o));
const CORE = 'https://sports.core.api.espn.com', WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba', SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// 1. the full athlete index
for (const [n, u] of [
  ['index_v3_all', `${CORE}/v3/sports/basketball/nba/athletes?limit=20000`],
  ['index_v3_active', `${CORE}/v3/sports/basketball/nba/athletes?limit=20000&active=true`],
  ['index_v2', `${CORE}/v2/sports/basketball/leagues/nba/athletes?limit=1000`],
]) {
  const j = await get(n, u);
  if (j) { log(`top keys: ${keys(j)}; count=${j.count} pageCount=${j.pageCount} items=${j.items?.length}`); log('first item: ' + JSON.stringify(j.items?.[0]).slice(0, 800)); log('last item: ' + JSON.stringify(j.items?.at(-1)).slice(0, 400)); }
}
// 2. per-player: legend, star, journeyman, rookie, 70s player
const P = { lebron: 1966, jordan: 1035, kareem: 33, curry: 3975, wemby: 5104157, bird: 1575, journeyman: 2490 };
for (const [n, id] of Object.entries(P)) {
  const a = await get(`athlete_${n}`, `${WEB}/athletes/${id}`);
  if (a) log(`athlete keys: ${keys(a.athlete || a)}`);
  const s = await get(`stats_${n}`, `${WEB}/athletes/${id}/stats`);
  if (s) { log(`stats keys: ${keys(s)}; categories=${(s.categories || []).map(c => `${c.name}(${c.statistics?.length} rows, labels ${c.labels?.length})`).join(' | ')}`); }
  if (n === 'lebron' || n === 'kareem') {
    await get(`stats_post_${n}`, `${WEB}/athletes/${id}/stats?seasontype=3`);
    await get(`bio_${n}`, `${WEB}/athletes/${id}/bio`);
    await get(`gamelog_${n}`, `${WEB}/athletes/${id}/gamelog`);
    await get(`splits_${n}`, `${WEB}/athletes/${id}/splits`);
    await get(`core_athlete_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}`);
    await get(`core_awards_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}/awards`);
    await get(`core_statslog_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}/statisticslog`);
    await get(`core_records_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}/records`);
    await get(`core_seasons_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}/seasons`);
    await get(`core_careerstats_${n}`, `${CORE}/v2/sports/basketball/leagues/nba/athletes/${id}/statistics`);
  }
  for (const u of [`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`]) {
    const r = await fetch(u, { method: 'HEAD' }).catch(() => null);
    log(`headshot ${n}: ${r?.status} ${r?.headers.get('content-type')} ${r?.headers.get('content-length')}`);
  }
}
// 3. teams (for colors, logos) incl. historical
await get('teams', `${SITE}/teams`);
await get('core_franchises', `${CORE}/v2/sports/basketball/leagues/nba/franchises?limit=100`);
// 4. season awards (MVP etc.)
await get('core_season_awards_2016', `${CORE}/v2/sports/basketball/leagues/nba/seasons/2016/awards?limit=100`);
await get('core_athlete_season_awards', `${CORE}/v2/sports/basketball/leagues/nba/seasons/2016/athletes/1966/awards`);
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
