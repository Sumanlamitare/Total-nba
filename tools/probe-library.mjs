// Probe 6: where ESPN records a player's teams when the season lists and career stats don't.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const get = async url => { try { const r = await fetch(url.replace(/^http:/, 'https:'), { headers: { 'user-agent': 'Mozilla/5.0' } }); return r.ok ? r.json() : { status: r.status }; } catch (e) { return { err: e.message }; } };
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const ids = ['3857', '5574', '4804', '5923', '6232', '4999', '4749', '4649', '4471', '2473', '2335', '4152'];
for (const id of ids) {
  const c = await get(`${CORE}/athletes/${id}`);
  const w = await get(`${WEB}/athletes/${id}`);
  const seasons = await get(`${CORE}/athletes/${id}/seasons?limit=50`);
  const items = seasons.items || [];
  let firstSeasonTeam = null;
  if (items[0]?.$ref) {
    const y = (items[0].$ref.match(/seasons\/(\d+)/) || [])[1];
    const sa = await get(`${CORE}/seasons/${y}/athletes/${id}`);
    firstSeasonTeam = { y, team: sa.team?.$ref, keys: Object.keys(sa).join(',') };
  }
  log(`${id} ${c.displayName} debut=${c.debutYear} coreTeam=${c.team?.$ref || '-'} webTeam=${w.athlete?.team?.abbreviation || '-'}/${w.athlete?.team?.displayName || ''} seasons=${seasons.count ?? seasons.status} first=${items.map(i => (i.$ref.match(/seasons\/(\d+)/) || [])[1]).join(',')} ${JSON.stringify(firstSeasonTeam)}`);
}
const teams = await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams');
const list = teams.sports?.[0]?.leagues?.[0]?.teams?.map(t => [t.team.id, t.team.abbreviation, t.team.displayName]) || [];
log('current teams: ' + JSON.stringify(list));
for (const [y, tid] of [[1960, 9], [1975, 25], [1970, 26], [2005, 25], [1995, 28], [1950, 1], [1955, 17]]) {
  const t = await get(`${CORE}/seasons/${y}/teams/${tid}`);
  log(`season ${y} team ${tid}: ${t.displayName} (${t.abbreviation}) status=${t.status ?? ''}`);
}
const all = await get(`${CORE}/franchises?limit=100`);
log('franchises count ' + all.count);
for (const it of (all.items || []).slice(0, 60)) { const f = await get(it.$ref); log(`  franchise ${f.id} ${f.displayName} (${f.abbreviation}) active=${f.isActive}`); }
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
