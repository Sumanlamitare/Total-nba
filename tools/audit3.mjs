// What does ESPN's web summary look like for a game the main API has no players for?
import fs from 'node:fs';
const out = [];
for (const id of ['400829095', '400278923']) {
  const j = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${id}`, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }).then(r => r.json());
  const t = j.boxscore?.players?.[0];
  out.push(`== ${id} team ${t?.team?.shortDisplayName}`);
  out.push('statistics count ' + t?.statistics?.length + ' keys ' + Object.keys(t?.statistics?.[0] || {}).join(','));
  out.push('labels ' + JSON.stringify(t?.statistics?.[0]?.labels) + ' names ' + JSON.stringify(t?.statistics?.[0]?.names) + ' keys ' + JSON.stringify(t?.statistics?.[0]?.keys));
  out.push('athlete[0] ' + JSON.stringify(t?.statistics?.[0]?.athletes?.[0]).slice(0, 700));
  out.push('athlete[5] ' + JSON.stringify(t?.statistics?.[0]?.athletes?.[5]).slice(0, 400));
  const comp = j.header?.competitions?.[0];
  out.push('notes ' + JSON.stringify(comp?.notes) + ' season ' + JSON.stringify(j.header?.season));
}
const sb = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20231209').then(r => r.json());
out.push('2023-12-09 notes: ' + JSON.stringify((sb.events || []).map(e => [e.shortName, e.competitions?.[0]?.notes])));
fs.mkdirSync('audit', { recursive: true }); fs.writeFileSync('audit/report3.txt', out.join('\n') + '\n'); console.log(out.join('\n'));
