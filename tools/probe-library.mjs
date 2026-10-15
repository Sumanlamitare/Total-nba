// Probe 5: legends' endpoints (Bird, Wilt, Russell), headshot CORS, qualified leaders sort keys.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const raw = async url => { try { const r = await fetch(url.replace('http:', 'https:'), { headers: { 'user-agent': 'Mozilla/5.0', origin: 'https://example.com' } }); const t = await r.text(); return { status: r.status, t, h: r.headers }; } catch (e) { return { status: 0, t: e.message, h: new Headers() }; } };
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
for (const [name, id] of [['bird', 2335], ['wilt', 4142], ['russell', 4152], ['magic', 1449]]) {
  for (const [k, u] of [['athlete', `${WEB}/athletes/${id}`], ['stats', `${WEB}/athletes/${id}/stats`], ['post', `${WEB}/athletes/${id}/stats?seasontype=3`], ['bio', `${WEB}/athletes/${id}/bio`], ['core', `${CORE}/athletes/${id}`], ['gamelog', `${WEB}/athletes/${id}/gamelog`]]) {
    const r = await raw(u);
    let note = '';
    try { const j = JSON.parse(r.t);
      if (k === 'athlete') note = JSON.stringify({ n: j.athlete?.displayName, pos: j.athlete?.position?.abbreviation, dob: j.athlete?.displayDOB, ht: j.athlete?.displayHeight, draft: j.athlete?.displayDraft, col: j.athlete?.college?.name, debut: j.athlete?.debutYear, hs: !!j.athlete?.headshot });
      if (k === 'stats' || k === 'post') note = (j.categories || []).map(c => `${c.name}:${c.statistics?.length} [${(c.statistics || []).map(s => s.season?.displayName).join(',')}]`).join(' | ');
      if (k === 'bio') note = JSON.stringify((j.awards || []).map(a => [a.name, a.displayCount])) + ' teams ' + JSON.stringify((j.teamHistory || []).map(t => [t.displayName, t.seasons]));
      if (k === 'core') note = JSON.stringify({ n: j.displayName, debut: j.debutYear, pos: j.position?.abbreviation, dob: j.dateOfBirth, ht: j.displayHeight, bp: j.birthPlace, draft: j.draft?.displayText, college: j.college?.$ref, exp: j.experience });
      if (k === "gamelog") note = JSON.stringify(Object.keys(j)) + " " + JSON.stringify((j.filters || []).find(f => f.name === 'season')?.options?.map(o => o.value)?.slice(-5));
    } catch {}
    log(`${name} ${k} ${r.status} ${r.t.length}B ${String(note ?? "").slice(0, 900)}`);
    if (k === 'stats' && name === 'wilt') fs.writeFileSync('probe/stats_wilt.json', r.t);
  }
}
const hs = await raw('https://a.espncdn.com/i/headshots/nba/players/full/1966.png');
log(`headshot cors: ${hs.status} acao=${hs.h.get('access-control-allow-origin')} type=${hs.h.get('content-type')}`);
for (const y of [1985, 1990, 2016]) for (const s of ['offensive.avgPoints', 'general.avgRebounds', 'offensive.avgAssists', 'defensive.avgSteals', 'defensive.avgBlocks']) {
  const r = await raw(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=3&sort=${s}:desc&season=${y}&seasontype=2`);
  try { const j = JSON.parse(r.t); log(`leaders ${y} ${s}: ${r.status} count=${j.pagination?.count} ${(j.athletes || []).map(a => a.athlete.displayName).join(', ')}`); } catch { log(`leaders ${y} ${s}: ${r.status} ${r.t.slice(0, 100)}`); }
}
const b85 = await raw(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=1000&sort=offensive.avgPoints:desc&season=1985&seasontype=2`);
try { const j = JSON.parse(b85.t); log(`byathlete 1985 count=${j.pagination?.count}; cats=${JSON.stringify(j.categories?.map(c => [c.name, c.names]))}`); } catch { log('b85 ' + b85.status); }
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
