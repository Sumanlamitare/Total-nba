// Look up players by name in ESPN (id scan) and print what their stats endpoints hold. Diagnostic only.
//   node tools/probe-players.mjs "Larry Bird,Dennis Johnson"
import * as espn from '../lib/espn.js';
import { parseStats } from '../lib/stats.js';

const want = new Set(process.argv.slice(2).join(',').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
const ids = Array.from({ length: 8000 }, (_, k) => String(k + 1));
const hits = [];
await espn.pool(ids, 16, async id => {
  const a = await espn.fetchJson(`${espn.CORE}/athletes/${id}`, 2).catch(() => null);
  if (a?.displayName && want.has(a.displayName.toLowerCase())) hits.push({ id, name: a.displayName, debut: a.debutYear, pos: a.position?.abbreviation });
});
console.log('scan hits', JSON.stringify(hits));
const show = (label, v) => console.log(` ${label}:`, JSON.stringify(v)?.slice(0, 1500));
for (const h of hits) {
  console.log(`== ${h.name} ${h.id}`);
  const raw = await espn.fetchJson(`${espn.WEB}/athletes/${h.id}/stats`, 2).catch(e => ({ error: e.message }));
  show('web stats keys', raw ? Object.keys(raw) : raw);
  const s = raw && parseStats(raw);
  show('web rows', (s?.rows || []).slice(0, 14).map(r => [r.season, r.teamId, r.team, r.avg?.gamesPlayed]));
  const log = await espn.fetchJson(`${espn.CORE}/athletes/${h.id}/statisticslog`, 2).catch(e => ({ error: e.message }));
  show('core statisticslog', log && { count: log.count, first: log.entries?.slice(0, 2) });
  const ref = log?.entries?.find(e => e.season?.$ref?.includes('1986'))?.statistics?.find(x => x.type === 'team') || log?.entries?.[0]?.statistics?.[0];
  if (ref?.statistics?.$ref) {
    const st = await espn.fetchJson(ref.statistics.$ref.replace('http://', 'https://'), 2).catch(e => ({ error: e.message }));
    show('season stat ref', ref);
    show('categories', (st?.splits?.categories || []).map(c => [c.name, c.stats.map(x => `${x.name}=${x.value}`).slice(0, 40)]));
  }
}
