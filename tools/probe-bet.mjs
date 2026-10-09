// Live check of ESPN endpoints a betting tool needs (NBA + NFL). Writes probe/espn_live_probe.md
import fs from 'node:fs';
const out = []; const say = s => { console.log(s); out.push(s); };
const H = { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } };
const j = async u => { try { const r = await fetch(u, H); const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch {} return { s: r.status, d, t }; } catch (e) { return { s: 'ERR ' + e.message }; } };
const short = (x, n = 400) => JSON.stringify(x)?.slice(0, n);
const S = 'https://site.api.espn.com/apis/site/v2/sports', C = 'https://sports.core.api.espn.com/v2/sports', W = 'https://site.web.api.espn.com/apis/common/v3/sports';
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
for (const [sp, lg] of [['football', 'nfl'], ['basketball', 'nba']]) {
  say(`\n# ${lg.toUpperCase()}\n`);
  // find a completed game and an upcoming game around today
  let done = null, next = null;
  for (let k = -10; k <= 14 && !(done && next); k++) {
    const d = new Date(Date.now() + k * 864e5), r = await j(`${S}/${sp}/${lg}/scoreboard?dates=${ymd(d)}`);
    for (const e of r.d?.events || []) {
      if (e.status?.type?.completed && !done && k < 0) done = e;
      if (e.status?.type?.state === 'pre' && !next) next = e;
    }
  }
  if (!done) { const r = await j(`${S}/${sp}/${lg}/scoreboard?dates=${lg === 'nba' ? '20260612' : '20260208'}`); done = r.d?.events?.[0]; }
  say(`- completed game: ${done?.id} ${done?.name} (${done?.date}) | upcoming: ${next?.id} ${next?.name} (${next?.date})`);
  if (next) {
    const c = next.competitions?.[0];
    say(`- scoreboard odds on upcoming game: ${short(c?.odds?.map(o => ({ provider: o.provider?.name, details: o.details, overUnder: o.overUnder, spread: o.spread, home: o.homeTeamOdds?.moneyLine, away: o.awayTeamOdds?.moneyLine, open: !!o.open })), 500)}`);
    say(`- scoreboard weather field: ${short(next.weather || c?.weather)} | venue indoor: ${c?.venue?.indoor}`);
    say(`- records on competitors: ${short(c?.competitors?.map(t => ({ team: t.team?.abbreviation, records: t.records?.map(r => `${r.name}:${r.summary}`) })), 400)}`);
    const sum = await j(`${S}/${sp}/${lg}/summary?event=${next.id}`);
    say(`- summary(upcoming) keys: ${Object.keys(sum.d || {}).join(',')}`);
    say(`- pickcenter: ${short(sum.d?.pickcenter?.map(p => ({ provider: p.provider?.name, details: p.details, ou: p.overUnder, homeML: p.homeTeamOdds?.moneyLine })), 400)}`);
    say(`- predictor: ${short(sum.d?.predictor, 300)}`);
    say(`- injuries in summary: ${short(sum.d?.injuries?.map(t => ({ team: t.team?.abbreviation, n: t.injuries?.length, first: t.injuries?.[0] && { name: t.injuries[0].athlete?.displayName, status: t.injuries[0].status } })), 400)}`);
    say(`- lastFiveGames in summary: ${short(sum.d?.lastFiveGames?.map(t => ({ team: t.team?.abbreviation, n: t.events?.length, e0: t.events?.[0] && { opp: t.events[0].opponent?.abbreviation, res: t.events[0].gameResult, score: t.events[0].score } })), 400)}`);
    say(`- seasonseries / headToHead in summary: ${short(sum.d?.seasonseries || sum.d?.headToHeadGames, 400)}`);
    say(`- gameInfo weather: ${short(sum.d?.gameInfo?.weather)}`);
    const odds = await j(`${C}/${sp}/leagues/${lg}/events/${next.id}/competitions/${next.id}/odds`);
    say(`- core odds status ${odds.s}, providers: ${short(odds.d?.items?.map(i => i.provider?.name || i.$ref), 300)}`);
    const it = odds.d?.items?.[0];
    if (it) say(`- core odds item keys: ${Object.keys(it).join(',')} | sample: ${short({ details: it.details, overUnder: it.overUnder, spread: it.spread, open: it.open, current: it.current }, 500)}`);
    for (const pid of [...new Set([...(odds.d?.items || []).map(i => i.provider?.id), '58', '41', '100'])].filter(Boolean).slice(0, 4)) {
      const pb = await j(`${C}/${sp}/leagues/${lg}/events/${next.id}/competitions/${next.id}/odds/${pid}/propBets?limit=1000`);
      say(`- propBets provider ${pid}: status ${pb.s} count ${pb.d?.count ?? pb.d?.items?.length} sample ${short(pb.d?.items?.slice(0, 2), 700)}`);
    }
  }
  if (done) {
    const sum = await j(`${S}/${sp}/${lg}/summary?event=${done.id}`);
    const p = sum.d?.boxscore?.players || [];
    say(`- completed box score: ${p.length} teams; stat groups: ${short(p[0]?.statistics?.map(s => ({ name: s.name, labels: s.labels })), 1500)}`);
    say(`- team stats sample: ${short(sum.d?.boxscore?.teams?.[0]?.statistics?.map(s => `${s.label || s.name}=${s.displayValue}`), 600)}`);
    say(`- completed gameInfo: ${short(sum.d?.gameInfo, 400)}`);
    say(`- completed pickcenter (closing lines?): ${short(sum.d?.pickcenter?.map(p => ({ provider: p.provider?.name, details: p.details, ou: p.overUnder })), 300)}`);
    const tid = done.competitions?.[0]?.competitors?.[0]?.team?.id;
    const sch = await j(`${S}/${sp}/${lg}/teams/${tid}/schedule`);
    const ev = sch.d?.events || [];
    say(`- team ${tid} schedule: status ${sch.s}, ${ev.length} events; last result: ${short(ev.filter(e => e.competitions?.[0]?.status?.type?.completed).slice(-1).map(e => ({ date: e.date, name: e.shortName, comp: e.competitions[0].competitors.map(c => `${c.team?.abbreviation} ${c.score?.displayValue ?? c.score} ${c.winner ? 'W' : ''}`) })), 300)}`);
    const aid = p[0]?.statistics?.[0]?.athletes?.[0]?.athlete?.id;
    const gl = await j(`${W}/${sp}/${lg}/athletes/${aid}/gamelog`);
    say(`- athlete ${aid} gamelog: status ${gl.s} keys ${Object.keys(gl.d || {}).join(',')} labels ${short(gl.d?.labels)} events ${Object.keys(gl.d?.events || {}).length} sample ${short(Object.values(gl.d?.events || {})[0], 300)}`);
    const spl = await j(`${W}/${sp}/${lg}/athletes/${aid}/splits`);
    say(`- athlete splits: status ${spl.s} categories ${short(spl.d?.splitCategories?.map(c => c.displayName || c.name), 300)}`);
    const inj = await j(`${S}/${sp}/${lg}/injuries`);
    say(`- league injuries: status ${inj.s} teams ${inj.d?.injuries?.length} sample ${short(inj.d?.injuries?.[0]?.injuries?.[0], 400)}`);
    for (const dc of ['depthcharts', 'depth-charts']) { const r = await j(`${S}/${sp}/${lg}/teams/${tid}/${dc}`); say(`- ${dc}: status ${r.s} ${short(r.d, 200)}`); }
    const ats = await j(`${C}/${sp}/leagues/${lg}/seasons/2025/types/2/teams/${tid}/ats`);
    say(`- core ATS record: status ${ats.s} ${short(ats.d, 300)}`);
  }
}
fs.mkdirSync('probe', { recursive: true }); fs.writeFileSync('probe/espn_live_probe.md', '# ESPN live probe (run from GitHub Actions, ' + new Date().toISOString() + ')\n' + out.join('\n') + '\n');
