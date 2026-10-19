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
  const urls = [
    `${espn.CORE}/seasons/1986/types/2/athletes/${h.id}/statistics`,
    `${espn.CORE}/seasons/1986/types/2/athletes/${h.id}/statistics/0`,
    `${espn.CORE}/athletes/${h.id}/statistics`,
    `${espn.CORE}/athletes/${h.id}/statistics/0`,
    `${espn.WEB}/athletes/${h.id}/overview`,
    `${espn.WEB}/athletes/${h.id}/splits?season=1986`,
    `${espn.WEB}/athletes/${h.id}/gamelog?season=1986`,
    `${espn.WEB}/athletes/${h.id}`,
  ];
  for (const u of urls) {
    const r = await fetch(u.replace('http://', 'https://')).then(async x => ({ status: x.status, body: (await x.text()).slice(0, 700) })).catch(e => ({ error: e.message }));
    show(u.replace(/^https?:\/\/[^/]+/, ''), r);
  }
}

for (const y of [1985, 1986, 1990]) {
  for (const q of [false, true]) {
    const j = await espn.byAthlete(y, { qualified: q }).catch(() => null);
    const list = j?.athletes || [];
    const bird = list.find(x => x.athlete?.displayName === 'Larry Bird');
    console.log('byathlete', y, 'qualified', q, list.length, 'pagination', JSON.stringify(j?.pagination), 'bird', JSON.stringify(bird)?.slice(0, 900));
  }
}
