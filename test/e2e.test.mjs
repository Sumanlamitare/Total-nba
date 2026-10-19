// End to end: mock ESPN -> ingest into a real MongoDB -> /api/game served by the dev server.
// Needs MONGODB_URI (CI starts a MongoDB container).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mockEspn } from './mock-espn.mjs';

const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = `game_test_${process.pid}`;
let espn, server, base, lib;

before(async () => {
  espn = await mockEspn();
  Object.assign(process.env, espn.env, { MONGODB_URI: MONGO, LIBRARY_DB: DB });
  lib = { db: await import('../lib/db.js'), ingest: await import('../lib/ingest.js') };
  const d = await lib.db.db();
  await d.dropDatabase();
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

test('before the first ingest the game says it is being built', async () => {
  const { status, body } = await get('/api/game');
  assert.equal(status, 503);
  assert.match(body.error, /being built/);
});

test('ingest: eras rated from real season stats; the library is cleaned away', async () => {
  const d = await lib.db.db();
  // Leftovers from the player library.
  await d.collection('leaders').insertOne({ _id: 'x' });
  await d.collection('cache').insertOne({ _id: 'x' });
  await d.collection('meta').insertOne({ _id: 'catalog', players: 1 });
  const meta = await lib.ingest.ingest(d, { from: 2016, to: 2017, scan: 3 });
  assert.equal(meta.players, 2, 'only players with seasons from 1980-81 on');
  const names = (await d.listCollections().toArray()).map(c => c.name).sort();
  assert.deepEqual(names, ['eras', 'meta', 'players']);
  assert.equal(await d.collection('meta').countDocuments({ _id: 'catalog' }), 0);
  assert.ok(espn.hits.some(h => h.startsWith('/core/athletes/3')), 'the id scan ran');
});

test('/api/game: franchises, eras with rated players, cached at the edge', async () => {
  const { status, body, headers } = await get('/api/game');
  assert.equal(status, 200);
  assert.match(headers.get('cache-control'), /s-maxage/);
  assert.equal(body.teams.length, 7);
  assert.deepEqual(body.decades, [1980, 1990, 2000, 2010, 2020]);
  const era = (team, decade) => body.eras.find(e => e.team === team && e.decade === decade);
  const mia = era('14', 2010).players;
  assert.deepEqual(mia.map(p => p.n), ['LeBron James']);
  assert.ok(mia[0].ovr >= 90 && mia[0].ovr <= 99);
  assert.deepEqual(mia[0].slots, ['SF', 'PF']);
  // A franchise's decade holds every player with 25+ games there, best first.
  const hou = era('10', 2010).players;
  assert.equal(hou[0].n, 'James Harden');
  assert.ok(era('25', 2000), 'Harden\'s rookie season (2009-10) is in the 2000s');
  // With two players in the mock there's no full starting five, so no dynasty.
  assert.deepEqual(body.dynasties, []);
});

test('a rebuild gives the same result', async () => {
  const d = await lib.db.db();
  const before = await d.collection('eras').countDocuments();
  await lib.ingest.ingest(d, { from: 2016, to: 2017, scan: 3 });
  assert.equal(await d.collection('eras').countDocuments(), before);
});
