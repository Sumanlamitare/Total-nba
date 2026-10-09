// Audit part 2: non-NBA teams, why some box scores are empty, season edges.
import fs from 'node:fs';
import { db, close } from '../lib/db.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const out = []; const say = (...a) => { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); out.push(s); };
const d = await db(), G = d.collection('games');
try {
  const teams = await G.aggregate([{ $project: { t: ['$home', '$away'] } }, { $unwind: '$t' }, { $group: { _id: '$t', n: { $sum: 1 } } }, { $sort: { n: 1 } }]).toArray();
  say('[A] team names (fewest games first):'); say(teams.map(t => `${t._id}:${t.n}`).join(' | '));
  const odd = await G.find({ $or: [{ home: /East|West|Team|World|USA|Rising|All|Rookies|Sophomores/i }, { away: /East|West|Team|World|USA|Rising|All|Rookies|Sophomores/i }] }, { projection: { home: 1, away: 1, date: 1, type: 1, boxed: 1 } }).limit(40).toArray();
  say('\n[B] all-star-like games:', odd.length); for (const g of odd) say('  ', g);
  const un = await G.aggregate([{ $match: { boxed: false } }, { $group: { _id: { s: '$season', t: '$type' }, n: { $sum: 1 }, ex: { $push: { id: '$_id', date: '$date', h: '$home', a: '$away', hs: '$hs', as: '$as' } } } }, { $sort: { '_id.s': 1 } }]).toArray();
  say('\n[C] unboxed games by season:'); for (const u of un) say('  ', u._id.s, u._id.t, u.n, JSON.stringify(u.ex.slice(0, 3)));
  for (const u of un.filter(x => [2014, 2016, 1999, 1998].includes(x._id.s)).slice(0, 4)) {
    const g = u.ex[0];
    const r = await fetch(`${BASE}/summary?event=${g.id}`).then(x => x.json()).catch(e => ({ err: e.message }));
    const p = r.boxscore?.players || [];
    say(`\n[D] ESPN summary for unboxed ${g.id} ${g.date} ${g.a}@${g.h} ${g.as}-${g.hs}: keys`, Object.keys(r).join(','), '| players teams', p.length,
      '| stats', JSON.stringify(p.map(t => ({ team: t.team?.shortDisplayName, nstat: t.statistics?.length, labels: t.statistics?.[0]?.labels, nath: t.statistics?.[0]?.athletes?.length, a0: t.statistics?.[0]?.athletes?.[0] && { dnp: t.statistics[0].athletes[0].didNotPlay, stats: t.statistics[0].athletes[0].stats } }))).slice(0, 900),
      '| status', r.header?.competitions?.[0]?.status?.type?.name, r.err || '');
  }
  const edge = await G.aggregate([{ $match: { date: { $gte: '2020-03-01', $lte: '2021-08-01' } } }, { $group: { _id: { m: { $substr: ['$date', 0, 7] }, s: '$season', t: '$type' }, n: { $sum: 1 } } }, { $sort: { '_id.m': 1 } }]).toArray();
  say('\n[E] 2020-21 games by month/season/type:'); for (const e of edge) say('  ', e._id.m, e._id.s, e._id.t, e.n);
  const sb = await fetch(`${BASE}/scoreboard?dates=20200801`).then(x => x.json());
  say('\n[F] ESPN 2020-08-01 events:', (sb.events || []).map(e => `${e.shortName} season ${e.season?.year}/${e.season?.type}`).join(' | '));
  const asg = await fetch(`${BASE}/scoreboard?dates=20230219`).then(x => x.json());
  say('[F] ESPN 2023-02-19 (All-Star) events:', (asg.events || []).map(e => `${e.name} season ${e.season?.year}/${e.season?.type} slug ${e.season?.slug}`).join(' | '));
  const pre = await G.aggregate([{ $match: { season: { $in: [1998, 1999] } } }, { $group: { _id: { s: '$season', m: { $substr: ['$date', 0, 7] }, b: '$boxed' }, n: { $sum: 1 } } }, { $sort: { '_id.s': 1, '_id.m': 1 } }]).toArray();
  say('\n[G] 1998-2000 games by month (boxed):'); for (const e of pre) say('  ', e._id.s, e._id.m, e._id.b, e.n);
} finally { await close(); fs.mkdirSync('audit', { recursive: true }); fs.writeFileSync('audit/report2.txt', out.join('\n') + '\n'); }
