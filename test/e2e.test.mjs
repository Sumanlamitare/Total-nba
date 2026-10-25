// End to end: mock ESPN -> the API functions (served by the dev server) -> MongoDB. Needs MONGODB_URI (CI starts a
// MongoDB container).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mockEspn } from './mock-espn.mjs';

const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = `night_test_${process.pid}`;
let espn, server, base, lib;

before(async () => {
  espn = await mockEspn();
  Object.assign(process.env, espn.env, { MONGODB_URI: MONGO, LIBRARY_DB: DB });
  lib = { db: await import('../lib/db.js'), nights: await import('../lib/nights.js') };
  await (await lib.db.db()).dropDatabase();
  const port = 5300 + (process.pid % 500);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port), NO_VITE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dev server did not start')), 15000);
    server.stdout.on('data', b => { if (String(b).includes('dev on')) { clearTimeout(t); resolve(); } });
    server.stderr.on('data', b => process.stderr.write(b));
  });
});

after(async () => {
  server?.kill();
  try { await (await lib.db.db()).dropDatabase(); } catch { /* ignore */ }
  await lib?.db.close();
  await espn?.close();
});

const get = async path => { const r = await fetch(base + path); return { status: r.status, body: await r.json(), headers: r.headers }; };

test('a night: games, the top five with every part explained, stored once final', async () => {
  const { status, body, headers } = await get('/api/night?date=20250115');
  assert.equal(status, 200);
  assert.equal(body.final, true);
  assert.equal(body.season, 2025);
  assert.match(headers.get('cache-control'), /s-maxage=86400/);
  assert.equal(body.games.length, 2);
  assert.deepEqual(body.games.find(g => g.id === '401705127').teams.map(t => `${t.abbr} ${t.score}`).sort(), ['NY 125', 'PHI 119']);
  assert.equal(body.top.length, 10);
  assert.equal(body.top[0].name, 'Jalen Brunson');
  assert.deepEqual(body.top.map(p => p.score), [...body.top.map(p => p.score)].sort((a, b) => b - a));
  const hart = body.top.find(p => p.name === 'Josh Hart');
  assert.ok(hart.tags.includes('Triple-double'));
  assert.equal(hart.result, 'W 125-119 OT');
  for (const p of body.top) {
    assert.ok(p.parts.some(x => x.k === 'production'));
    assert.equal(Math.round(p.parts.reduce((s, x) => s + x.value, 0)), Math.round(p.score));
  }
  assert.ok(body.dates.includes('20250115'));
  // Served from the database from now on.
  const before = espn.hits.length;
  await get('/api/night?date=20250115');
  assert.equal(espn.hits.filter(h => h.includes('summary')).length, espn.hits.slice(0, before).filter(h => h.includes('summary')).length);
});

test('latest: the newest night with finished games', async () => {
  const { body } = await get('/api/night?date=latest');
  assert.equal(body.date, '20250115');
});

test('a date with no games, and bad dates', async () => {
  const { status, body } = await get('/api/night?date=20250116');
  assert.equal(status, 200);
  assert.deepEqual([body.games.length, body.top.length, body.final], [0, 0, false]);
  assert.equal((await get('/api/night?date=Jan15')).status, 400);
});

test('seasons and the leaderboard', async () => {
  const s = await get('/api/seasons');
  assert.equal(s.status, 200);
  assert.equal(s.body.current, 2025);
  const y = s.body.seasons.find(x => x.year === 2025);
  assert.equal(y.label, '2024-25');
  assert.equal(y.nights, 1);
  assert.ok(y.dates.length > 100 && y.dates.every(x => x >= '20241022' && x <= '20250627'), 'regular season through the Finals, no preseason');
  const lb = await get('/api/leaderboard?season=2025');
  assert.equal(lb.status, 200);
  assert.equal(lb.body.nights, 1);
  assert.equal(lb.body.players.length, 5, 'the top five count');
  assert.equal(lb.body.players[0].name, 'Jalen Brunson');
  assert.deepEqual([lb.body.players[0].count, lb.body.players[0].firsts, lb.body.players[0].points], [1, 1, 5]);
  assert.equal(lb.body.players[0].nights[0].date, '20250115');
  assert.equal((await get('/api/leaderboard?season=abc')).status, 400);
  assert.equal((await get('/api/leaderboard?season=2025&stage=playoffs')).body.players.length, 0);
});

test('ingesting a season walks its dates in order and keeps final nights', async () => {
  const d = await lib.db.db();
  const r = await lib.nights.ingestSeason(d, 2025, { until: '20250120' });
  assert.ok(r.nights > 50);
  assert.equal(await d.collection('nights').countDocuments({ final: true }), 1);
  assert.ok(await d.collection('perfs').countDocuments() > 30);
});
