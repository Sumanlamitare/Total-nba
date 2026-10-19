// Print ESPN's award list for some seasons: names, winner counts, a sample winner. Diagnostic only.
//   node tools/probe-awards.mjs "1986,1996,2014,2025"
import * as espn from '../lib/espn.js';

for (const y of (process.argv[2] || '2014').split(',').map(Number)) {
  const list = await espn.fetchJson(`${espn.CORE}/seasons/${y}/awards?limit=100`).catch(e => ({ error: e.message }));
  console.log(`== ${y}: ${list?.items?.length ?? 0} awards ${list?.error || ''}`);
  const awards = await espn.pool(list?.items || [], 6, it => espn.fetchJson(it.$ref.replace('http://', 'https://')).catch(() => null));
  for (const a of awards) if (a) console.log(` ${a.id} | ${a.name} | winners ${a.winners?.length} | ${JSON.stringify(a.winners?.[0])?.slice(0, 260)}`);
}
