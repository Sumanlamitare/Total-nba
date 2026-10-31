// Browser test: the real app (dev server, Vite) on a database filled by the automation from mock ESPN; desktop and
// phone. Headshots are blocked, so their fallbacks are exercised too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mockEspn } from './mock-espn.mjs';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = `overlap_ui_${process.pid}`;
let espn, server, browser, base, lib, d, total;

before(async () => {
  espn = await mockEspn();
  Object.assign(process.env, espn.env, { MONGODB_URI: MONGO, LIBRARY_DB: DB });
  lib = { db: await import('../lib/db.js'), jobs: await import('../lib/jobs.js') };
  d = await lib.db.db();
  await d.dropDatabase();
  const r = await lib.jobs.processDate(d, '20250115', { log: () => {} });
  total = r.made.daily.result.total;
  const port = 5900 + (process.pid % 90);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 30000); server.stdout.on('data', b => { if (String(b).includes('dev on')) { clearTimeout(t); res(); } }); });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--headless=new'] });
});
after(async () => { await browser?.close(); server?.kill(); try { await d.dropDatabase(); } catch { /* */ } await lib?.db.close(); await espn?.close(); });

async function page(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await p.route(/espncdn\.com/, r => r.abort());
  await p.goto(base + path);
  return { p, errors };
}
const players = p => p.locator('.diagram-svg [data-pid]').count();

test('today: the automatic diagram, every qualifying player, the facts', async () => {
  const { p, errors } = await page('/');
  await p.locator('.diagram-svg').first().waitFor();
  assert.equal(await p.locator('.stage-head h1').first().textContent(), 'Wednesday, January 15, 2025');
  assert.equal(await p.locator('.studio').first().locator('.diagram-svg [data-pid]').count(), total, 'every player is drawn');
  const facts = await p.locator('.studio').first().locator('.facts').textContent();
  assert.match(facts, /Players\s*\d+/);
  assert.match(facts, /All 2 final \(1 postponed\)/);
  assert.deepEqual((await p.locator('.studio').first().locator('.legend-row .pill').allTextContents()).map(t => t.replace(/\d+$/, '')), ['10+ REB', '6+ AST', '90%+ FT']);
  // A headshot opens the player's numbers.
  await p.locator('.studio').first().locator('.diagram-svg [data-pid]').first().click();
  await p.locator('.modal.player').waitFor();
  assert.ok(await p.locator('.crit-values li').count() === 3);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('modify: add a criterion from the searchable catalog, undo and redo, switch views', async () => {
  const { p, errors } = await page('/daily/20250115');
  await p.getByRole('button', { name: 'Modify' }).first().click();
  await p.locator('.crit-editor li').first().waitFor();
  assert.equal(await p.locator('.crit-editor li').count(), 3);
  await p.getByRole('button', { name: '+ Add a criterion' }).click();
  await p.locator('.picker .search').fill('steals');
  await p.locator('.stat-row', { hasText: 'Steals' }).first().click();
  await p.locator('.legend-row .pill').nth(3).waitFor();
  assert.equal(await p.locator('.legend-row .pill').count(), 4, 'four criteria: a 4-set diagram');
  assert.equal(await p.locator('.diagram-svg ellipse').count(), 4);
  // Undo, redo.
  await p.getByRole('button', { name: 'Undo' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.legend-row .pill').length === 3);
  await p.getByRole('button', { name: 'Redo' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.legend-row .pill').length === 4);
  // Unavailable statistics are listed but can't be picked.
  await p.getByRole('button', { name: '+ Add a criterion' }).click();
  assert.match(await p.locator('.picker .unavailable').textContent(), /Win Shares/);
  await p.locator('.picker .x').click();
  // The intersection view shows the same players.
  const inVenn = await players(p);
  await p.getByRole('tab', { name: 'Style' }).click();
  await p.getByRole('radio', { name: 'Intersections' }).click();
  await p.waitForFunction(() => !document.querySelector('.diagram-svg ellipse'));
  assert.equal(await players(p), inVenn, 'same players, different view');
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('share: the standalone graphic, downloads', async () => {
  const { p, errors } = await page('/daily/20250115');
  await p.locator('.diagram-svg').waitFor();
  await p.getByRole('button', { name: 'Share' }).first().click();
  await p.locator('.preview img').waitFor({ timeout: 20000 });
  const [png] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'PNG', exact: true }).click()]);
  assert.match(png.suggestedFilename(), /^wednesday-january-15-2025-square\.png$/);
  const [svg] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'SVG' }).click()]);
  assert.match(svg.suggestedFilename(), /\.svg$/);
  await p.locator('.share-modal select').selectOption('portrait');
  const [pdf] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'PDF' }).click()]);
  assert.match(pdf.suggestedFilename(), /portrait\.pdf$/);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('season, history, custom', async () => {
  const { p, errors } = await page('/season?season=2025&stype=regular');
  await p.locator('.diagram-svg').waitFor();
  assert.match(await p.locator('.stage-head h1').textContent(), /2024-25 Regular Season/);
  await p.goto(`${base}/history`);
  await p.locator('.hist li').first().waitFor();
  assert.ok(await p.locator('.hist li').count() >= 2);
  await p.locator('.hist-main').first().click();
  await p.locator('.diagram-svg').waitFor();
  await p.goto(`${base}/custom`);
  await p.locator('.crit-editor li').first().waitFor();
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('phone: no sideways scrolling', async () => {
  for (const path of ['/', '/daily/20250115', '/custom', '/history']) {
    const { p, errors } = await page(path, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.locator('.diagram-svg, .hist li, .crit-editor li').first().waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, path);
    // Every section stays reachable in the bottom tab bar.
    const bar = await p.locator('.tabs-nav').boundingBox();
    assert.ok(bar.y + bar.height <= 844 && bar.y > 700, `${path}: tab bar at ${bar.y}`);
    for (const label of ['Today', 'Daily', 'Season', 'History', 'Custom', 'Settings']) assert.ok(await p.locator('.tabs-nav a', { hasText: label }).isVisible(), `${path}: ${label}`);
    assert.deepEqual(errors, [], path);
    await p.context().close();
  }
});
