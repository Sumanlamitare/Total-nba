// Audit part 3: is there another free source for games whose ESPN summary has no players?
import fs from 'node:fs';
const out = []; const say = (...a) => { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); out.push(s); };
const ids = ['400829095', '400579509', '400278923', '400900593'];
const tryUrl = async (label, url, pick) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
    say(label, r.status, url.slice(0, 110), '=>', j ? pick(j) : t.slice(0, 160).replace(/\s+/g, ' '));
  } catch (e) { say(label, 'ERR', e.message); }
};
for (const id of ids) {
  say('\n== game', id);
  await tryUrl('cdn.espn boxscore', `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${id}`, j => {
    const p = j.gamepackageJSON?.boxscore?.players || []; return p.map(t => `${t.team?.shortDisplayName}: ${t.statistics?.[0]?.athletes?.length} athletes`).join(' | ') || Object.keys(j).join(',');
  });
  await tryUrl('site.web.api summary', `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${id}`, j => (j.boxscore?.players || []).map(t => `${t.team?.shortDisplayName}: ${t.statistics?.[0]?.athletes?.length}`).join(' | '));
  await tryUrl('core competitors', `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/competitors`, j => JSON.stringify(j.items?.map(x => x.$ref)).slice(0, 300));
  await tryUrl('core playbyplay', `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/playbyplay?event=${id}`, j => `plays ${(j.plays || []).length} keys ${Object.keys(j).join(',')}`);
}
// NBA's own CDN (game ids: 002 + yy + 5-digit number; try a 2015-16 game)
await tryUrl('nba cdn boxscore', 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0021501213.json', j => Object.keys(j.game || j).join(','));
await tryUrl('nba stats', 'https://stats.nba.com/stats/boxscoretraditionalv2?GameID=0021501213&StartPeriod=0&EndPeriod=10&StartRange=0&EndRange=28800&RangeType=0', j => Object.keys(j).join(','));
await tryUrl('nba data.nba.net', 'https://data.nba.net/prod/v1/20160411/0021501213_boxscore.json', j => Object.keys(j).join(','));
fs.mkdirSync('audit', { recursive: true }); fs.writeFileSync('audit/report3.txt', out.join('\n') + '\n');
