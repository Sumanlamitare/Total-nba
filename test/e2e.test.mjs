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
  assert.equal(body.games.length, 3);
  assert.equal(body.games.find(g => g.id === '999').detail, 'Postponed');
  assert.deepEqual(body.games.find(g => g.id === '401705127').teams.map(t => `${t.abbr} ${t.score}`).sort(), ['NY 125', 'PHI 119']);
  assert.equal(body.top.length, 10);
  assert.ok(['Jalen Brunson', 'Josh Hart'].includes(body.top[0].name), body.top[0].name);
  assert.deepEqual(body.top.map(p => p.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(body.players, 41, 'every player who appeared is ranked');
  assert.equal(body.potn.name, body.top[0].name);
  assert.equal(body.potn.competitors.length, 2);
  assert.equal(body.model, 'potn-2');
  assert.deepEqual(body.top.map(p => p.score), [...body.top.map(p => p.score)].sort((a, b) => b - a));
  const hart = body.top.find(p => p.name === 'Josh Hart');
  assert.ok(hart.tags.includes('Triple-double'));
  assert.equal(hart.result, 'W 125-119 OT');
  for (const p of body.top) {
    assert.ok(p.score >= 0 && p.score <= 100);
    assert.deepEqual(Object.keys(p.categories), ['result', 'offense', 'defense', 'possession', 'clutch']);
    assert.ok(Object.values(p.categories).every(c => c.items.length));
    assert.equal(p.confidence.level, 'high');
  }
  assert.ok(body.dates.includes('20250115'));
  // Served from the database from now on.
  const before = espn.hits.length;
  await get('/api/night?date=20250115');
  assert.equal(espn.hits.filter(h => h.includes('summary')).length, espn.hits.slice(0, before).filter(h => h.includes('summary')).length);
});

test('sharing: a shared link carries the preview tags and opens the performance; the preview image is a PNG', async () => {
  const night = (await get('/api/night?date=20250115')).body;
  const p = night.top[0];
  const r = await fetch(`${base}/s/20250115/${p.id}`, { redirect: 'manual' });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, new RegExp(`<meta property="og:title" content="${p.name}: ${p.score.toFixed(1)}`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, new RegExp(`og:image" content="http[^"]+/api/og\\?date=20250115&amp;p=${p.id}"`));
  assert.match(html, new RegExp(`/night/20250115\\?p=${p.id}`));
  assert.match(html, /was the Performance of the Night \(Jan 15, 2025\)/);
  assert.match(await (await fetch(`${base}/s/20250115`)).text(), /Top performances of Jan 15, 2025: 1\./);
  const img = await fetch(`${base}/api/og?date=20250115&p=${p.id}`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await img.arrayBuffer());
  assert.deepEqual([...buf.subarray(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG');
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal((await fetch(`${base}/api/og?date=bad`)).status, 400);
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
  assert.equal(lb.body.players[0].name, (await get('/api/night?date=20250115')).body.top[0].name, 'the night\'s No. 1 leads');
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
