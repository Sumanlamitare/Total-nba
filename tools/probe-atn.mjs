// Probe round 3: team schedule (results for streaks) and the current-season game log.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe/raw', { recursive: true });
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const out = [];
for (const [name, url] of [['schedule', `${SITE}/teams/2/schedule`], ['schedule_season', `${SITE}/teams/2/schedule?season=2027&seasontype=2`], ['gamelog_2027', 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3078576/gamelog?season=2027']]) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const t = await r.text(); out.push(`${name} ${r.status} ${t.length}`);
  writeFileSync(`probe/raw/${name}.json`, t);
}
writeFileSync('probe/report.txt', out.join('\n'));
console.log(out.join('\n'));
