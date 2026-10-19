// Look up players by name in ESPN (id scan) and print what their career stats hold. Diagnostic only.
//   node tools/probe-players.mjs "Larry Bird,Dennis Johnson"
import * as espn from '../lib/espn.js';
import { parseStats } from '../lib/stats.js';

const want = new Set(process.argv.slice(2).join(',').split(',').filter(Boolean).map(s => s.trim()).map(s => s.toLowerCase()));
const ids = Array.from({ length: 8000 }, (_, k) => String(k + 1));
const hits = [];
await espn.pool(ids, 16, async id => {
  const a = await espn.fetchJson(`${espn.CORE}/athletes/${id}`, 2).catch(() => null);
  if (a?.displayName && want.has(a.displayName.toLowerCase())) hits.push({ id, name: a.displayName, debut: a.debutYear, pos: a.position?.abbreviation });
});
console.log('scan hits', JSON.stringify(hits));
for (const h of hits) {
  const raw = await espn.fetchJson(`${espn.WEB}/athletes/${h.id}/stats`, 2).catch(e => ({ error: e.message }));
  console.log(h.name, h.id, 'categories', (raw.categories || []).map(c => `${c.name}:${c.statistics?.length}`).join(' '), raw.error || '');
  const s = parseStats(raw);
  console.log(' rows', JSON.stringify((s?.rows || []).slice(0, 14).map(r => [r.season, r.teamId, r.team, r.avg?.gamesPlayed])));
  if (!s) console.log(' raw', JSON.stringify(raw).slice(0, 600));
}
for (const y of [1985, 1986]) {
  const j = await espn.byAthlete(y).catch(() => null);
  const names = (j?.athletes || []).map(x => x.athlete?.displayName);
  console.log('byathlete', y, names.length, 'bird?', names.includes('Larry Bird'), 'count field', j?.pagination?.count ?? JSON.stringify(Object.keys(j || {})));
}
