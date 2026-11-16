// Probe ESPN's public soccer API for the 39 competitions: confirms each league slug answers, and prints the exact shape
// of the fields the app uses (scoreboard events, status, competitors, goal details; summary key events), with real
// examples of a penalty, an own goal, stoppage time and a shootout when the window has them.
//   node tools/probe-espn-soccer.mjs [daysBack=21] [daysAhead=10]
const SLUGS = process.argv[4] ? process.argv[4].split(',') : ['caf.nations', 'ger.1', 'eng.charity', 'concacaf.nations.league', 'conmebol.america', 'esp.copa_del_rey', 'ita.coppa_italia',
  'fra.coupe_de_france', 'eng.league_cup', 'uefa.euro', 'uefa.euroq', 'eng.fa', 'fifa.cwc', 'fifa.world', 'esp.1', 'fra.1', 'usa.1', 'fifa.olympics',
  'eng.1', 'ksa.1', 'sco.1', 'ita.1', 'uefa.champions', 'uefa.europa.conf', 'uefa.europa', 'uefa.nations', 'uefa.super_cup', 'fifa.worldq.caf',
  'fifa.worldq.uefa', 'fifa.worldq.concacaf', 'fifa.worldq.conmebol', 'fifa.worldq.afc', 'fifa.worldq.ofc', 'fifa.friendly', 'caf.nations_qual',
  'ned.1', 'por.1', 'tur.1', 'conmebol.libertadores'];
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const back = +(process.argv[2] || 21), ahead = +(process.argv[3] || 10);
const range = `${ymd(new Date(Date.now() - back * 864e5))}-${ymd(new Date(Date.now() + ahead * 864e5))}`;
const LIMIT = process.env.PROBE_LIMIT || '';
const get = async u => { const t = Date.now(); const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (fp90 probe)', accept: 'application/json' } }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {} return { status: r.status, ms: Date.now() - t, j, bytes: txt.length, cc: r.headers.get('cache-control') }; };
const keys = o => (o && typeof o === 'object' ? Object.keys(o).join(',') : String(o));
// Which query shapes the scoreboard accepts (printing the error body when it refuses).
{
  const today = ymd(new Date());
  for (const q of [`dates=${range}&limit=400`, `dates=${range}&limit=100`, `dates=${range}`, `dates=${today}`, `dates=${ymd(new Date(Date.now() - 7 * 864e5))}-${today}`, `dates=${ymd(new Date(Date.now() - 7 * 864e5))}-${today}&limit=200`, '']) {
    const r = await get(`${SITE}/eng.1/scoreboard${q ? `?${q}` : ''}`);
    console.log(`variant "${q}": HTTP ${r.status} ${r.bytes}B events=${r.j?.events?.length ?? '-'} ${r.status !== 200 ? JSON.stringify(r.j) : ''}`);
  }
}
const finds = { pen: null, og: null, stoppage: null, shootout: null, aet: null, other: new Set() };
const statuses = new Map();
for (const slug of SLUGS) {
  const r = await get(`${SITE}/${slug}/scoreboard?dates=${range}${LIMIT ? `&limit=${LIMIT}` : ''}`);
  if (r.status !== 200) console.log(`  error body: ${JSON.stringify(r.j)}`);
  const lg = r.j?.leagues?.[0];
  const evs = r.j?.events || [];
  console.log(`\n## ${slug}: HTTP ${r.status} ${r.ms}ms ${r.bytes}B cache=${r.cc} | league id=${lg?.id} name="${lg?.name}" abbr=${lg?.abbreviation} slug=${lg?.slug} logo=${lg?.logos?.[0]?.href} | events=${evs.length}`);
  for (const e of evs) {
    const c = e.competitions?.[0]; const st = c?.status?.type || e.status?.type;
    statuses.set(st?.name, `${st?.state}/${st?.completed}/${st?.description}/${st?.detail}/${st?.shortDetail}`);
    for (const x of c?.details || []) {
      const tag = { ...x, athletesInvolved: x.athletesInvolved?.map(a => ({ id: a.id, displayName: a.displayName, shortName: a.shortName, team: a.team?.id })) };
      if (x.penaltyKick && x.scoringPlay && !finds.pen) finds.pen = { slug, event: e.id, tag };
      if (x.ownGoal && !finds.og) finds.og = { slug, event: e.id, tag };
      if (/\+/.test(x.clock?.displayValue || '') && x.scoringPlay && !finds.stoppage) finds.stoppage = { slug, event: e.id, tag };
      if (x.shootout && !finds.shootout) finds.shootout = { slug, event: e.id, tag };
      finds.other.add(x.type?.text);
    }
    if (/PEN/.test(st?.name || '') && !finds.shootoutEvent) finds.shootoutEvent = { slug, id: e.id, competitors: c.competitors.map(k => ({ score: k.score, shootoutScore: k.shootoutScore, winner: k.winner, homeAway: k.homeAway })) };
    if (/AET/.test(st?.name || '') && !finds.aet) finds.aet = { slug, id: e.id };
  }
  const done = evs.find(e => e.competitions?.[0]?.status?.type?.completed && (e.competitions[0].details || []).some(x => x.scoringPlay));
  const one = done || evs[0];
  if (one) {
    const c = one.competitions[0];
    console.log(`event keys: ${keys(one)}\ncompetition keys: ${keys(c)}\nstatus: ${JSON.stringify(c.status)}\ndate: ${one.date} | name: ${one.name}`);
    console.log(`competitor keys: ${keys(c.competitors[0])}\nteam keys: ${keys(c.competitors[0].team)}`);
    console.log(`competitors: ${JSON.stringify(c.competitors.map(k => ({ id: k.id, homeAway: k.homeAway, score: k.score, shootoutScore: k.shootoutScore, winner: k.winner, team: { id: k.team.id, name: k.team.displayName, short: k.team.shortDisplayName, abbr: k.team.abbreviation, logo: k.team.logo, color: k.team.color, alt: k.team.alternateColor } })))}`);
    if (c.details?.length) console.log(`detail keys: ${keys(c.details[0])}\ndetails: ${JSON.stringify(c.details.slice(0, 4).map(x => ({ ...x, athletesInvolved: x.athletesInvolved?.map(a => ({ id: a.id, displayName: a.displayName, shortName: a.shortName, team: a.team?.id })) })))}`);
  }
}
console.log('\n## statuses seen'); for (const [k, v] of statuses) console.log(k, v);
console.log('\n## detail types seen', [...finds.other].join(' | '));
for (const k of ['pen', 'og', 'stoppage', 'shootout', 'shootoutEvent', 'aet']) console.log(`\n## example ${k}: ${JSON.stringify(finds[k])}`);
// One summary for a finished match with goals, and the shootout one.
for (const ex of [finds.pen, finds.og, finds.shootoutEvent && { slug: finds.shootoutEvent.slug, event: finds.shootoutEvent.id }].filter(Boolean)) {
  const r = await get(`${SITE}/${ex.slug}/summary?event=${ex.event}`);
  const comp = r.j?.header?.competitions?.[0];
  console.log(`\n## summary ${ex.slug} ${ex.event}: HTTP ${r.status} ${r.bytes}B top keys: ${keys(r.j)}`);
  console.log(`header competitor: ${JSON.stringify(comp?.competitors?.map(k => ({ id: k.id, homeAway: k.homeAway, score: k.score, shootoutScore: k.shootoutScore, winner: k.winner, team: k.team?.displayName })))}`);
  console.log(`status: ${JSON.stringify(comp?.status)}`);
  const ke = r.j?.keyEvents || [];
  console.log(`keyEvents ${ke.length}, keys: ${keys(ke[0])}`);
  for (const k of ke.filter(x => x.scoringPlay || /goal|penalty|shootout/i.test(x.type?.type || ''))) console.log(`  ${JSON.stringify({ type: k.type, clock: k.clock, period: k.period, scoringPlay: k.scoringPlay, shootout: k.shootout, team: k.team?.id, text: k.text, short: k.shortText, participants: k.participants?.map(p => p.athlete?.displayName) })}`);
  console.log(`header.league: ${JSON.stringify(r.j?.header?.league && { id: r.j.header.league.id, name: r.j.header.league.name, abbr: r.j.header.league.abbreviation, slug: r.j.header.league.slug, logos: r.j.header.league.logos })}`);
}
