// Run the engine against live ESPN data (GitHub Actions) and save the output for review.
import fs from 'node:fs';
import { slate } from '../lib/slate.js';
import { analyzeGame } from '../lib/analyze.js';
fs.mkdirSync('try', { recursive: true });
const log = [];
for (const sport of ['nfl', 'nba']) {
  const t0 = Date.now(), s = await slate(sport);
  log.push(`${sport}: slate ${s.date}, ${s.games.length} games (${Date.now() - t0} ms)`);
  const g = s.games.find(x => x.status.state === 'pre') || s.games[0];
  if (!g) continue;
  const t1 = Date.now();
  try {
    const a = await analyzeGame(sport, g.id);
    fs.writeFileSync(`try/${sport}-game.json`, JSON.stringify(a, null, 1));
    log.push(`${sport}: ${a.away.abbr} @ ${a.home.abbr} analysed in ${Date.now() - t1} ms; ${a.props.length} props, ${a.props.filter(p => p.qualifies).length} qualify, ${a.props.filter(p => p.pick).length} picks; lines ${JSON.stringify(a.lines?.lines)}; proj margin ${a.lines?.projMargin} total ${a.lines?.projTotal}`);
    log.push('  ratings ' + JSON.stringify(a.ratings));
    log.push('  game sides ' + JSON.stringify(a.lines?.sides?.map(x => `${x.pick} pM=${x.pModel} mkt=${x.pMarket} p=${x.p} edge=${x.edge}`)));
    log.push('  lastFive ' + JSON.stringify(a.lastFive.map(t => `${t.abbr} ${t.record}`)) + ' h2h ' + JSON.stringify(a.h2h));
    for (const p of a.props.slice(0, 12)) log.push(`  ${p.pick ? 'PICK' : '    '} ${p.player} (${p.team}) ${p.market} ${p.side} ${p.line} | mu ${p.proj.mu} sd ${p.proj.sd} n ${p.proj.n} | pModel ${p.pModel} p ${p.p} edge ${p.edge} ev ${p.ev} | L5 ${p.context.hit.l5.over}/${p.context.hit.l5.n} | vsOpp ${JSON.stringify(p.context.lastVsOpp)} | ${p.flags.join('; ')}`);
    const mk = {}; for (const p of a.props) mk[p.market] = (mk[p.market] || 0) + 1; log.push('  markets ' + JSON.stringify(mk));
  } catch (e) { log.push(`${sport}: ERROR ${e.stack}`); }
}
fs.writeFileSync('try/log.txt', log.join('\n') + '\n'); console.log(log.join('\n'));
