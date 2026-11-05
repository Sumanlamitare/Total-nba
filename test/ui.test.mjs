// Browser test: the built app served with the API (in-memory database, saved ESPN responses), driven by Chromium.
// The feed renders and filters; a new event arrives without a refresh; details show sources and verification; phones
// get no sideways scrolling; the graphics editor selects, drags and saves.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mockSources } from './mock-sources.mjs';

const require = createRequire(import.meta.url);
const pw = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright']) { try { if (p) return require(p); } catch { /* next */ } } throw new Error('playwright not found'); })();
let m, browser, base, d, upsert, getSettings;

before(async () => {
  m = await mockSources();
  const port = 4900 + Math.floor(Math.random() * 500);
  Object.assign(process.env, m.env, { ATN_MEMDB: '1', STATIC_DIR: 'dist', PORT: String(port), ATN_SETUP_HASH: crypto.createHash('sha256').update('atn-setup:uicode').digest('hex'), ATN_INSECURE_COOKIE: '1', ATN_STREAM_POLL_MS: '500' });
  const { db } = await import('../lib/db.js');
  d = await db();
  const { tick } = await import('../lib/automation.js');
  ({ upsert } = await import('../lib/feed.js'));
  ({ getSettings } = await import('../lib/settings.js'));
  // NBA.com has no box score here, so finals verify on consistency after the wait.
  for (const now of [new Date(), new Date(Date.now() + 40 * 3600e3)]) await tick(d, { dates: ['20261104', '20250115'], now, log: () => {} });
  await import('../scripts/dev.mjs');
  base = `http://localhost:${port}`;
  browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--headless=new'] });
});
after(async () => { await browser?.close(); await m?.close(); setTimeout(() => process.exit(0), 200); });

async function page(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route(/espncdn\.com/, r => r.abort());
  await p.goto(base + path);
  return { p, errors, ctx };
}

test('the feed renders, filters, and expands to sources and verification', async () => {
  const { p, errors, ctx } = await page('/');
  await p.waitForSelector('.ev');
  assert.ok(await p.locator('.ev').count() >= 5);
  await p.click('.seg button:has-text("Runs")');
  await p.waitForTimeout(800);
  const kinds = await p.locator('.ev').evaluateAll(els => els.map(e => e.className));
  assert.ok(kinds.length > 0 && kinds.every(c => /p-purple/.test(c)), kinds.join(','));
  await p.click('.ev >> nth=0 >> button:has-text("Details")');
  await p.waitForSelector('.details');
  assert.match(await p.locator('.details').first().innerText(), /sources[\s\S]*ESPN/i);
  assert.match(await p.locator('.details').first().innerText(), /verification/i);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a new event appears without refreshing', async () => {
  const { p, errors, ctx } = await page('/');
  await p.waitForSelector('.ev');
  await p.waitForSelector('.conn-live', { timeout: 10000 });
  await upsert(d, { _id: 'ui:live-test', category: 'game-winner', significance: 95, status: 'final', headline: 'AT THE BUZZER', body: 'A test of the live stream.', teams: [], players: [], game: { id: '401909922', teams: [] }, occurredAt: new Date(), sources: [{ name: 'test' }], verification: { status: 'verified' } }, await getSettings(d));
  await p.waitForSelector('.ev.fresh:has-text("AT THE BUZZER")', { timeout: 15000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phones: no sideways scrolling, tab bar present', async () => {
  for (const path of ['/', '/intel', '/records', '/performances', '/games/401909922']) {
    const { p, errors, ctx } = await page(path, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.waitForSelector('.ev, .section, .empty, .perf, .scoreboard-hero', { timeout: 10000 });
    await p.waitForTimeout(400);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, path);
    assert.ok(await p.locator('.tabbar').isVisible(), path);
    assert.deepEqual(errors, [], path);
    await ctx.close();
  }
});

test('graphics editor: create from an event, select, drag, save', async () => {
  const { p, errors, ctx } = await page('/signin');
  await p.waitForSelector('h1:has-text("Set up")');
  await p.fill('form input >> nth=0', 'uicode');
  await p.fill('form input >> nth=1', 'Owner');
  await p.fill('input[type=email]', 'owner@example.com');
  await p.fill('input[type=password]', 'a-long-password');
  await p.click('form button');
  await p.waitForURL(base + '/');
  await p.goto(base + '/studio');
  await p.click('.mini >> nth=0');
  await p.waitForSelector('.canvas [data-id]');
  const id = await p.locator('.canvas [data-id="note"], .canvas [data-id="headline"], .canvas [data-id="name-last"]').first().getAttribute('data-id');
  const box = await p.locator(`.canvas [data-id="${id}"]`).first().boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForSelector('.sel-box');
  const sel = await p.locator('.sel-box').boundingBox();
  await p.mouse.move(sel.x + 10, sel.y + 10); await p.mouse.down(); await p.mouse.move(sel.x + 70, sel.y + 40, { steps: 6 }); await p.mouse.up();
  await p.click('button:has-text("Save")');
  await p.waitForSelector('button:has-text("Saved")');
  const gid = p.url().split('/').pop();
  const { ObjectId } = await import('mongodb');
  const doc = await d.collection('content').findOne({ _id: new ObjectId(gid) });
  assert.ok(doc.project.overrides[id]?.x != null, 'the drag was saved as an override');
  assert.deepEqual(errors, []);
  await ctx.close();
});
