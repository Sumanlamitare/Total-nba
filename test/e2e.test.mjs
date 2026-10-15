// End to end: mock ESPN -> ingest into a real MongoDB -> the API functions served by the dev server.
// Needs MONGODB_URI (CI starts a MongoDB container).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mockEspn } from './mock-espn.mjs';

const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = `library_test_${process.pid}`;
let espn, server, base, lib;

before(async () => {
  espn = await mockEspn();
  Object.assign(process.env, espn.env, { MONGODB_URI: MONGO, LIBRARY_DB: DB });
  lib = { db: await import('../lib/db.js'), catalog: await import('../lib/catalog.js') };
  const d = await lib.db.db();
  await d.dropDatabase();
  await lib.catalog.ingest(await lib.db.db(), { from: 2016, to: 2017, awardsFrom: 1960, scan: 5 });
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

test('catalog: season-list players, award-only legends, the id scan and rookies are all shelved', async () => {
  const { status, body, headers } = await get('/api/catalog');
  assert.equal(status, 200);
  assert.match(headers.get('cache-control'), /s-maxage/);
  const byName = Object.fromEntries(body.players.map(p => [p.n, p]));
  assert.deepEqual(Object.keys(byName).sort(), ['Ann Able', 'LeBron James', 'Old Timer', 'Rookie Newman', 'Wilt Chamberlain']);
  assert.equal(byName['Wilt Chamberlain'].y0, 1960);
  assert.deepEqual(byName['Wilt Chamberlain'].h, { mvp: 1 });
  assert.equal(byName['Ann Able'].t.join(), 'BOS,NYK');
  assert.equal(byName['LeBron James'].a, 1);
  assert.equal(byName['Ann Able'].a, undefined, 'not in the current index, so not active');
  // LeBron's career stats (pre-1997 rule doesn't apply: he's active) keep season-list spans.
  assert.equal(byName['LeBron James'].y0, 2004);
  assert.deepEqual(body.players.map(p => p.k), [...body.players.map(p => p.k)].sort(), 'alphabetical');
  assert.equal(body.meta.players, 5);
  // Shelved by team: most games (career stats), then season lists, then award records; unknown stays unshelved.
  assert.equal(body.meta.teams.length, 7);
  assert.equal(byName['LeBron James'].tm, '5');
  assert.equal(byName['LeBron James'].tms, undefined, 'games is the default reason');
  assert.equal(byName['Ann Able'].tm, '2', 'equal season games: the first team seen');
  assert.equal(byName['Ann Able'].tms, 'seasons');
  assert.equal(byName['Wilt Chamberlain'].tm, '9');
  assert.equal(byName['Wilt Chamberlain'].tms, 'awards');
  assert.equal(byName['Old Timer'].tm, undefined);
});

test('book: a full book with honors, playoffs and league-leading seasons', async () => {
  const { status, body } = await get('/api/book?id=1966');
  assert.equal(status, 200);
  assert.equal(body.name, 'LeBron James');
  assert.ok(body.regular.seasons >= 22);
  assert.ok(body.playoffs.seasons >= 10);
  assert.deepEqual(body.leaders.map(l => [l.season, l.stat]), [[2016, 'pts'], [2016, 'reb'], [2016, 'ast'], [2016, 'stl'], [2016, 'blk'], [2017, 'pts'], [2017, 'reb'], [2017, 'ast'], [2017, 'stl'], [2017, 'blk']]);
  assert.equal(body.leadersFrom, 2016);
  assert.ok(body.honors.some(h => h.name === 'MVP'));
});

test('book: career highs come from the game logs ESPN has, and say which seasons', async () => {
  const { status, body } = await get('/api/book?id=1966&part=highs');
  assert.equal(status, 200);
  assert.deepEqual(body.covered, [2016]);
  assert.ok(body.requested.length > 10);
  assert.equal(body.highs.playoffs.find(h => h.stat === 'points').value, 41);
});

test('book: falls back to the core record when the web athlete is missing', async () => {
  const { status, body } = await get('/api/book?id=3992');
  assert.equal(status, 200);
  assert.equal(body.name, 'James Harden');
  assert.ok(body.regular.rows.some(r => r.combined));
});

test('book: bad ids and unknown players', async () => {
  assert.equal((await get('/api/book?id=abc')).status, 400);
  const missing = await get('/api/book?id=999999');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /no record/);
});

test('search: catalog matches first; ESPN search shelves an NBA player the catalog lacks', async () => {
  const local = await get('/api/search?q=lebron');
  assert.deepEqual(local.body.results.map(p => p.n), ['LeBron James']);
  const found = await get('/api/search?q=forgotten');
  assert.deepEqual(found.body.results.map(p => p.n), ['Forgotten Guard'], 'non-NBA results are ignored');
  assert.deepEqual(found.body.added, ['7777']);
  const after = await get('/api/catalog');
  assert.ok(after.body.players.some(p => p.n === 'Forgotten Guard' && p.y0 === 1956));
  assert.equal((await get('/api/search?q=a')).status, 400);
});

test('a rebuild keeps players added by search and by the id scan', async () => {
  await lib.catalog.ingest(await lib.db.db(), { from: 2016, to: 2016, awardsFrom: 1960 });
  const { body } = await get('/api/catalog');
  const names = body.players.map(p => p.n);
  assert.ok(names.includes('Forgotten Guard'));
  assert.ok(names.includes('Old Timer'));
});
