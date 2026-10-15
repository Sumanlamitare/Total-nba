// Probe 3: earliest byathlete season, legends' stats, qualified ranks.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const H = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
const get = async url => { try { const r = await fetch(url, { headers: H }); return { status: r.status, j: await r.json().catch(() => null) }; } catch (e) { return { status: 'ERR ' + e.message, j: null }; } };
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const BY = (y, q = false, sort = 'offensive.avgPoints') => `${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=${q}&page=1&limit=${q ? 3 : 1000}&sort=${sort}:desc&season=${y}&seasontype=2`;
for (let y = 1975; y <= 1991; y++) { const { status, j } = await get(BY(y)); log(`byathlete ${y}: ${status} players=${j?.athletes?.length ?? '-'} requested=${JSON.stringify(j?.requestedSeason)?.slice(0, 80)}`); }
for (const y of [1990, 2016]) for (const s of ['offensive.avgPoints', 'general.avgRebounds', 'offensive.avgAssists', 'defensive.avgSteals', 'defensive.avgBlocks']) {
  const { j } = await get(BY(y, true, s));
  const a = j?.athletes?.[0];
  log(`leader ${y} ${s}: ${a?.athlete?.displayName} ranks=${JSON.stringify(a?.categories?.map(c => c.ranks?.slice(0, 4)))}`);
}
const { j: g } = await get(BY(2016, true));
log('glossary/names ' + JSON.stringify((g?.categories || []).map(c => [c.name, c.names])).slice(0, 1500));
for (const [n, id] of [['wilt', 4142], ['russell', 4152], ['bird', 2335], ['magic', 1449]]) {
  const a = await get(`${WEB}/athletes/${id}`); const s = await get(`${WEB}/athletes/${id}/stats`); const b = await get(`${WEB}/athletes/${id}/bio`);
  log(`${n} ${id}: athlete ${a.status} ${a.j?.athlete?.displayName} draft=${a.j?.athlete?.displayDraft} | stats ${s.status} rows=${JSON.stringify((s.j?.categories?.[0]?.statistics || []).map(r => r.season?.displayName + ':' + r.stats?.[0]))} | awards ${JSON.stringify((b.j?.awards || []).map(x => x.name + ' ' + x.displayCount))}`);
}
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
