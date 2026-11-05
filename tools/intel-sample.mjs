import { mockSources } from '../test/mock-sources.mjs';
const m = await mockSources(); Object.assign(process.env, m.env);
const espn = await import('../lib/providers/espn.js');
const { analyze } = await import('../lib/intel.js');
for (const id of ['401909922', '401705127', '401705128']) {
  const c = await espn.game(id);
  console.log('\n==', id, c.game.teams.map(t => `${t.abbr} ${t.score}`).join(' - '), c.game.status, 'plays', c.plays.length);
  for (const s of analyze(c).sort((a, b) => b.significance - a.significance)) console.log(String(s.significance).padStart(3), s.category.padEnd(16), s.headline.padEnd(26), '|', s.body);
}
await m.close();
