// Probe 4: season award lists (winners) for old seasons — a data-backed way to shelve pre-1985 greats.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const get = async url => { try { const r = await fetch(url.replace('http:', 'https:'), { headers: { 'user-agent': 'Mozilla/5.0' } }); return r.ok ? r.json() : { status: r.status }; } catch (e) { return { err: e.message }; } };
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
for (const y of [1950, 1960, 1975, 1985, 2016]) {
  const list = await get(`${CORE}/seasons/${y}/awards?limit=100`);
  log(`\n${y}: count=${list.count} status=${list.status ?? ''}`);
  for (const it of (list.items || []).slice(0, 20)) {
    const a = await get(it.$ref);
    const winners = await Promise.all((a.winners || []).slice(0, 6).map(async w => { const ath = w.athlete?.$ref ? await get(w.athlete.$ref) : null; return ath?.displayName || JSON.stringify(w).slice(0, 80); }));
    log(`  ${a.id} ${a.name}: ${winners.join(', ')}${(a.winners || []).length > 6 ? ' …' : ''}`);
  }
}
log('\nsample award object: ' + JSON.stringify(await get(`${CORE}/seasons/1960/awards/33`)).slice(0, 800));
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
