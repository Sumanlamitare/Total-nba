// End to end: mock ESPN (real responses, test/fixtures/espn) -> the automation and the API (dev server) -> MongoDB.
// Needs MongoDB (CI starts one; MONGODB_URI, default localhost).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mockEspn } from './mock-espn.mjs';

const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = `overlap_e2e_${process.pid}`;
let espn, server, base, lib, d;

before(async () => {
  espn = await mockEspn();
  Object.assign(process.env, espn.env, { MONGODB_URI: MONGO, LIBRARY_DB: DB });
  lib = { db: await import('../lib/db.js'), jobs: await import('../lib/jobs.js'), data: await import('../lib/data.js') };
  d = await lib.db.db();
  await d.dropDatabase();
  const port = 5600 + (process.pid % 300);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port), NO_VITE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 20000); server.stdout.on('data', b => { if (String(b).includes('dev on')) { clearTimeout(t); res(); } }); });
});
after(async () => {
  server?.kill();
  try { await d.dropDatabase(); } catch { /* ignore */ }
  await lib?.db.close(); await espn?.close();
});

const get = async path => { const r = await fetch(base + path); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const quiet = { log: () => {}, now: new Date('2025-01-16T15:00:00Z') }; // the morning after

test('a night still being played publishes nothing; an incomplete box score is never trusted', async () => {
  // One game still in progress.
  espn.tweak.scoreboard = sb => { const e = sb.events.find(x => x.id === '401705128'); e.status = { type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, shortDetail: 'Q3 5:01' } }; };
  let r = await lib.jobs.processDate(d, '20250115', quiet);
  assert.equal(r.day.complete, false);
  assert.equal(r.day.pending, 1);
  assert.equal(r.made, null, 'no diagram while a game is on');
  assert.equal(await d.collection('diagrams').countDocuments(), 0);
  // Final on the scoreboard, but the box score is missing a team's points: not verified, still nothing published.
  espn.tweak.scoreboard = null;
  espn.tweak.summary = (id, j) => { if (id === '401705128') { const a = j.boxscore.players[0].statistics[0].athletes.find(x => x.stats?.length); a.stats[1] = String(+a.stats[1] - 2); } };
  r = await lib.jobs.processDate(d, '20250115', quiet);
  assert.equal(r.day.complete, false);
  assert.match(r.day.problems[0], /points .* score/);
  assert.equal(await d.collection('diagrams').countDocuments(), 0);
  // Two days on and still broken: the night publishes without that game, which is noted as unverified.
  const later = await lib.jobs.processDate(d, '20250115', { log: () => {}, now: new Date('2025-01-18T15:00:00Z') });
  assert.equal(later.day.complete, true);
  assert.deepEqual(later.day.excluded.map(x => x.status).sort(), ['postponed', 'unverified']);
  assert.equal(await d.collection('pgames').countDocuments({ gid: '401705128' }), 0, 'its box score is never stored');
  espn.tweak.summary = null;
  await d.collection('diagrams').deleteMany({});
  await d.collection('games').updateOne({ _id: '401705128' }, { $set: { status: 'final' } });
});

test('when every game is final and verified: the daily and season diagrams, once', async () => {
  const r = await lib.jobs.processDate(d, '20250115', quiet);
  assert.equal(r.day.complete, true);
  assert.equal(r.day.final, 2);
  assert.deepEqual(r.day.excluded.map(x => x.status), ['postponed'], 'the postponed game does not hold the night up');
  const daily = r.made.daily;
  assert.equal(daily.kind, 'daily');
  assert.deepEqual(daily.config.criteria.map(c => c.label), ['10+ REB', '6+ AST', '90%+ FT']);
  // Every qualifier, checked against the box score: 10+ rebounds or 6+ assists or 90%+ FT on 4+ attempts.
  const box = await d.collection('pgames').find({ date: '20250115' }).toArray();
  const expected = box.filter(g => g.s.reb >= 10 || g.s.ast >= 6 || (g.s.fta >= 4 && g.s.ftm / g.s.fta >= 0.9)).map(g => g.pid).sort();
  assert.deepEqual(daily.result.players.map(p => p.id).sort(), expected);
  for (const p of daily.result.players) {
    const g = box.find(x => x.pid === p.id);
    assert.equal(!!(p.mask & 1), g.s.reb >= 10, `${p.name} rebounds`);
    assert.equal(!!(p.mask & 2), g.s.ast >= 6, `${p.name} assists`);
  }
  assert.ok(r.made.season, 'the season to date');
  // Running again on unchanged data makes no copy.
  const again = await lib.jobs.processDate(d, '20250115', quiet);
  assert.equal(again.made.daily._id, daily._id);
  assert.equal(await d.collection('diagrams').countDocuments({ kind: 'daily' }), 1);
});

test('a stat correction makes a new version and supersedes the old one', async () => {
  espn.tweak.summary = (id, j) => {
    if (id !== '401705127') return;
    const st = j.boxscore.players.map(p => p.statistics[0]).find(x => x.athletes.some(a => a.athlete.displayName === 'Kelly Oubre Jr.'));
    const a = st.athletes.find(x => x.athlete.displayName === 'Kelly Oubre Jr.'), i = st.names.indexOf('REB'), o = st.names.indexOf('OREB');
    a.stats[i] = String(+a.stats[i] + 3); a.stats[o] = String(+a.stats[o] + 3);
  };
  const r = await lib.jobs.processDate(d, '20250115', { ...quiet, recheck: true });
  espn.tweak.summary = null;
  assert.equal(r.made.daily.version, 2);
  const v1 = await d.collection('diagrams').findOne({ kind: 'daily', version: 1 });
  assert.equal(v1.latest, false);
  assert.equal(v1.supersededBy, r.made.daily._id);
});

test('the API: home, datasets, statistics, diagrams, history', async () => {
  const home = await get('/api/data?q=home');
  assert.equal(home.status, 200);
  assert.equal(home.body.daily.date, '20250115');
  assert.equal(home.body.daily.version, 2);
  const ds = await get('/api/data?q=dataset&mode=daily&date=20250115');
  assert.equal(ds.body.rows.length, 41);
  assert.equal(ds.body.meta.complete, true);
  assert.ok(ds.body.available.includes('usg_pct') && ds.body.available.includes('ft_pct'));
  const brunson = ds.body.rows.find(r => r.name === 'Jalen Brunson');
  assert.deepEqual([brunson.v.pts, brunson.v.fgm, brunson.v.fga, brunson.n.fta], [38, 14, 22, 9]);
  const season = await get('/api/data?q=dataset&mode=season&season=2025&stype=regular');
  assert.equal(season.body.rows.find(r => r.name === 'Jalen Brunson').v.pts_pg, 38);
  assert.ok(!season.body.available.includes('per'), "no ESPN season figures in the mock: PER isn't offered");
  assert.equal((await get('/api/data?q=dataset&mode=daily&date=Jan15')).status, 400);
  const cat = await get('/api/data?q=catalog&mode=season');
  assert.ok(cat.body.stats.length > 80 && cat.body.unavailable.includes('Win Shares'));
  const auto = await get('/api/diagram?kind=daily&date=20250115');
  assert.equal(auto.body.diagram.version, 2);
  assert.equal(auto.body.versions.length, 2);
  const list = await get('/api/diagram?list=1');
  assert.ok(list.body.diagrams.length >= 2 && list.body.diagrams.every(x => x.latest));
  // A custom diagram evaluated on the server and saved for sharing: 6 criteria, two on the same statistic.
  const criteria = [{ stat: 'pts', op: '>=', value: 20 }, { stat: 'reb', op: '>=', value: 5 }, { stat: 'ast', op: '>', value: 4.5 }, { stat: 'stl', op: '>=', value: 1 }, { stat: 'fg_pct', op: '>=', value: 50 }, { stat: 'pts', op: '<', value: 30 }];
  const saved = await post('/api/diagram', { config: { mode: 'daily', date: '20250115', criteria }, style: { view: 'upset' } });
  assert.equal(saved.status, 200);
  const one = await get(`/api/diagram?id=${saved.body.id}`);
  assert.equal(one.body.diagram.kind, 'custom');
  assert.equal(one.body.diagram.config.criteria.length, 6);
  assert.equal(one.body.diagram.config.criteria[2].label, 'Over 4.5 AST');
  assert.equal((await post('/api/diagram', { config: { mode: 'daily', date: '20250115', criteria: [] } })).status, 400);
});

test('settings: the first passcode owns them; refresh is limited', async () => {
  const s = await get('/api/admin?q=settings');
  assert.equal(s.body.hasPasscode, false);
  assert.equal((await post('/api/admin?q=settings', { passcode: 'ab' })).status, 400);
  const set = await post('/api/admin?q=settings', { passcode: 'secret-1', daily: { criteria: [{ stat: 'pts', op: '>=', value: 25 }] } });
  assert.equal(set.status, 200);
  assert.equal(set.body.daily.criteria[0].stat, 'pts');
  assert.equal((await post('/api/admin?q=settings', { passcode: 'wrong-1', daily: { criteria: [{ stat: 'reb', op: '>=', value: 5 }] } })).status, 403);
  const saved = await post('/api/admin?q=configs', { name: 'Scorers', config: { mode: 'daily', date: '20250115', criteria: [{ stat: 'pts', op: '>=', value: 25 }] } });
  assert.equal(saved.status, 200);
  assert.equal((await get('/api/admin?q=configs')).body.configs[0].name, 'Scorers');
  const r1 = await post('/api/admin?q=refresh', { date: '20250115' });
  assert.ok(r1.body.skipped, 'checked under a minute ago');
});

test('sharing: the preview page and the diagram as a PNG', async () => {
  const home = (await get('/api/data?q=home')).body;
  const png = await fetch(`${base}/api/og?id=${home.daily._id}`);
  assert.equal(png.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await png.arrayBuffer());
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [1200, 630]);
  const sq = Buffer.from(await (await fetch(`${base}/api/og?id=${home.daily._id}&f=square`)).arrayBuffer());
  assert.deepEqual([sq.readUInt32BE(16), sq.readUInt32BE(20)], [1080, 1080]);
  const html = await (await fetch(`${base}/api/share?id=${home.daily._id}`)).text();
  assert.match(html, /<meta property="og:image" content="[^"]+\/api\/og\?id=/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /10\+ REB · 6\+ AST · 90%\+ FT/);
});
