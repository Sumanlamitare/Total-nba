// Dump full raw ESPN examples a betting tool parses: propBets items, gamelog, schedule, summary bits.
import fs from 'node:fs';
const H = { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } };
const j = async u => { try { const r = await fetch(u, H); return { s: r.status, d: await r.json().catch(() => null) }; } catch (e) { return { s: 'ERR ' + e.message }; } };
const S = 'https://site.api.espn.com/apis/site/v2/sports', C = 'https://sports.core.api.espn.com/v2/sports', W = 'https://site.web.api.espn.com/apis/common/v3/sports';
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
fs.mkdirSync('probe', { recursive: true });
const save = (f, x) => fs.writeFileSync('probe/' + f, JSON.stringify(x, null, 1));
for (const [sp, lg] of [['football', 'nfl'], ['basketball', 'nba']]) {
  let next = null, done = null;
  for (let k = -6; k <= 10 && !(next && done); k++) {
    const r = await j(`${S}/${sp}/${lg}/scoreboard?dates=${ymd(new Date(Date.now() + k * 864e5))}`);
    for (const e of r.d?.events || []) { if (e.status?.type?.state === 'pre' && !next) next = e; if (e.status?.type?.completed && !done) done = e; }
  }
  save(`${lg}-scoreboard-event.json`, next);
  const pb = await j(`${C}/${sp}/leagues/${lg}/events/${next.id}/competitions/${next.id}/odds/100/propBets?limit=1000`);
  const items = pb.d?.items || [];
  const types = {}; for (const i of items) types[i.type?.name] = (types[i.type?.name] || 0) + 1;
  // group by athlete+type to see how over/under sides are represented
  const byKey = {}; for (const i of items) { const k = (i.athlete?.$ref || i.team?.$ref || '') + '|' + i.type?.id; (byKey[k] ||= []).push(i); }
  const firstGroups = Object.values(byKey).slice(0, 4);
  save(`${lg}-props-summary.json`, { count: items.length, pageCount: pb.d?.pageCount, types, firstGroups, keysOfItem: Object.keys(items[0] || {}) });
  const ath = items.find(i => i.athlete)?.athlete?.$ref;
  if (ath) save(`${lg}-athlete.json`, (await j(ath.replace('http:', 'https:'))).d);
  const sum = await j(`${S}/${sp}/${lg}/summary?event=${next.id}`);
  save(`${lg}-summary-upcoming.json`, { lastFiveGames: sum.d?.lastFiveGames, injuries: sum.d?.injuries?.map(t => ({ team: t.team, injuries: t.injuries?.slice(0, 2) })), pickcenter: sum.d?.pickcenter, odds: sum.d?.odds, againstTheSpread: sum.d?.againstTheSpread, predictor: sum.d?.predictor, seasonseries: sum.d?.seasonseries, header: sum.d?.header?.competitions?.[0]?.competitors?.map(c => ({ id: c.id, homeAway: c.homeAway, team: c.team?.abbreviation, record: c.record })) });
  const aid = ath?.match(/athletes\/(\d+)/)?.[1];
  const gl = await j(`${W}/${sp}/${lg}/athletes/${aid}/gamelog`);
  save(`${lg}-gamelog.json`, { labels: gl.d?.labels, names: gl.d?.names, displayNames: gl.d?.displayNames, filters: gl.d?.filters, seasonTypes: gl.d?.seasonTypes?.map(s => ({ ...s, categories: s.categories?.map(c => ({ ...c, events: c.events?.slice(0, 3) })) })), eventsSample: Object.fromEntries(Object.entries(gl.d?.events || {}).slice(0, 3)) });
  const gl2 = await j(`${W}/${sp}/${lg}/athletes/${aid}/gamelog?season=${lg === 'nba' ? 2026 : 2025}`);
  save(`${lg}-gamelog-prev.json`, { n: Object.keys(gl2.d?.events || {}).length, seasonTypes: gl2.d?.seasonTypes?.map(s => s.displayName) });
  const tid = next.competitions[0].competitors[0].team.id;
  const sch = await j(`${S}/${sp}/${lg}/teams/${tid}/schedule?season=${lg === 'nba' ? 2026 : 2025}`);
  save(`${lg}-schedule.json`, { n: sch.d?.events?.length, first: sch.d?.events?.[0], requestedSeason: sch.d?.requestedSeason });
  if (done) {
    const ds = await j(`${S}/${sp}/${lg}/summary?event=${done.id}`);
    save(`${lg}-boxscore.json`, { players: ds.d?.boxscore?.players?.map(t => ({ team: t.team?.abbreviation, statistics: t.statistics?.map(s => ({ name: s.name, labels: s.labels, keys: s.keys, athletes: s.athletes?.slice(0, 2) })) })), teams: ds.d?.boxscore?.teams?.map(t => ({ team: t.team?.abbreviation, statistics: t.statistics })) });
  }
}
