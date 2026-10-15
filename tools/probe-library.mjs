// Probe 2: how to enumerate historical players, trades, honors for legends, gamelog shape.
import fs from 'node:fs';
fs.mkdirSync('probe', { recursive: true });
const out = []; const log = s => { console.log(s); out.push(s); };
const H = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
async function get(name, url, save = true) {
  try {
    const r = await fetch(url, { headers: H }); const txt = await r.text();
    log(`\n### ${name} ${r.status} ${txt.length}B\n${url}`);
    let j = null; try { j = JSON.parse(txt); } catch { log('not json: ' + txt.slice(0, 200)); }
    if (j && save) fs.writeFileSync(`probe/${name}.json`, JSON.stringify(j).slice(0, 2_000_000));
    return j;
  } catch (e) { log(`\n### ${name} ERR ${e.message}`); return null; }
}
const CORE = 'https://sports.core.api.espn.com', WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba', SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const summary = j => `count=${j?.count} pageCount=${j?.pageCount} items=${j?.items?.length} first=${JSON.stringify(j?.items?.[0]).slice(0, 300)}`;

const safe = async (label, fn) => { try { await fn(); } catch (e) { log(`!! ${label} crashed: ${e.message}`); } };
// ESPN's stats pages: every player with stats in a season
for (const y of [1950, 1965, 1980, 1990, 1997, 2010, 2025]) await safe('byathlete ' + y, async () => {
  const j = await get(`byathlete_${y}`, `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=1000&sort=offensive.avgPoints:desc&season=${y}&seasontype=2`);
  log(`keys ${Object.keys(j || {})} pagination ${JSON.stringify(j?.pagination)} athletes=${(j?.athletes || []).length}`);
  log('first ' + JSON.stringify((j?.athletes || [])[0]).slice(0, 700));
  log('categories ' + JSON.stringify((j?.categories || []).map(c => [c.name, (c.names || []).slice(0, 6)])).slice(0, 600));
});
for (const q of ['larry bird', 'kareem', 'wilt chamberlain', 'bill russell']) await safe('search ' + q, async () => {
  for (const u of [`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=5&mode=prefix&type=player&sport=basketball&league=nba`,
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=5`]) {
    const j = await get(`search_${q.replace(/ /g, '_')}_${u.includes('/v2') ? 'v2' : 'v3'}`, u);
    log(JSON.stringify(j).slice(0, 900));
  }
});
// a mid-season trade (Harden 2020-21), a legend's honors, an old-timer's stats
for (const [n, id] of [['harden', 3992], ['jordan', 1035]]) await safe('player ' + n, async () => {
  const s = await get(`stats_${n}`, `${WEB}/athletes/${id}/stats`);
  log(`${n} seasons: ` + JSON.stringify((s?.categories?.[0]?.statistics || []).map(r => [r.season?.displayName, r.teamSlug, r.stats?.[0]])));
  const b = await get(`bio_${n}`, `${WEB}/athletes/${id}/bio`);
  log(`${n} awards: ` + JSON.stringify((b?.awards || []).map(a => [a.name, a.displayCount])));
  log(`${n} teams: ` + JSON.stringify((b?.teamHistory || []).map(t => [t.displayName, t.seasons])));
});
const pj = await get('stats_post_jordan', `${WEB}/athletes/1035/stats?seasontype=3`);
log('jordan playoff rows: ' + JSON.stringify((pj?.categories?.[0]?.statistics || []).map(r => [r.season?.displayName, r.stats?.[0], r.stats?.at(-1)])));
// gamelog shape (smaller: an older season)
const g = await get('gamelog_lebron_2016', `${WEB}/athletes/1966/gamelog?season=2016`);
if (g) {
  log('gamelog keys ' + Object.keys(g) + ' labels ' + JSON.stringify(g.labels) + ' names ' + JSON.stringify(g.names));
  log('seasonTypes ' + JSON.stringify((g.seasonTypes || []).map(st => [st.displayName, (st.categories || []).map(c => [c.displayName, c.type, (c.events || []).length])])));
  const e0 = Object.entries(g.events || {})[0]; log('event ' + JSON.stringify(e0).slice(0, 900));
  const c0 = g.seasonTypes?.[0]?.categories?.[0]; log('row ' + JSON.stringify(c0?.events?.[0]).slice(0, 400));
}
// old-season gamelog availability
for (const [n, id, s] of [['jordan_1988', 1035, 1988], ['jordan_1997', 1035, 1997]]) {
  const j = await get(`gamelog_${n}`, `${WEB}/athletes/${id}/gamelog?season=${s}`, false);
  log(`${n}: events=${Object.keys(j?.events || {}).length} types=${JSON.stringify((j?.seasonTypes || []).map(st => st.displayName))}`);
}
fs.writeFileSync('probe/report.txt', out.join('\n') + '\n');
