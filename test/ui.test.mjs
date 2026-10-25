// Browser test: the real interface against saved API responses (test/fixtures/api, real data), desktop and phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const port = 5800 + (process.pid % 100);
const base = `http://127.0.0.1:${port}`;
let server, browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port), MOCK_API: 'test/fixtures/api' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dev server did not start')), 20000);
    server.stdout.on('data', b => { if (String(b).includes('dev on')) { clearTimeout(t); resolve(); } });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--headless=new'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function page(path = '/', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.route(/espncdn\.com/, r => r.abort()); // headshots and logos fall back
  await p.goto(base + path);
  await p.locator('#boot').waitFor({ state: 'detached', timeout: 20000 });
  return { p, errors };
}

test('the latest night: five performances, best first, the first one explained', async () => {
  const { p, errors } = await page('/');
  await p.locator('.perf').first().waitFor();
  assert.match(p.url(), /\/night\/20261024$/, 'the address names the night');
  assert.equal(await p.locator('.top > .perf').count(), 5);
  const scores = (await p.locator('.perf .score b').allTextContents()).map(Number);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(await p.locator('.perf.hero .name').textContent(), 'Devin Booker');
  assert.ok(await p.locator('.perf.hero .parts li').count() >= 4, 'the No. 1 shows why');
  assert.equal(await p.locator('.games li').count(), 8);
  // Another performance opens its breakdown; the next five are a tap away.
  await p.locator('.perf').nth(2).locator('.perf-main').click();
  await p.locator('.perf').nth(2).locator('.parts').waitFor();
  await p.getByRole('button', { name: /Show the next 5/ }).click();
  assert.equal(await p.locator('.also-list li').count(), 5);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('switching dates and seasons', async () => {
  const { p, errors } = await page('/night/20250115');
  await p.locator('.perf').first().waitFor();
  assert.equal(await p.locator('h1').textContent(), 'Wednesday, January 15, 2025');
  assert.equal(await p.locator('.perf.hero .name').textContent(), 'Mark Williams');
  assert.equal(await p.locator('select').inputValue(), '2025');
  // The arrows step through game nights (the previous one is the 14th).
  await p.getByRole('button', { name: /Previous game night, Tuesday, January 14, 2025/ }).click();
  await p.waitForURL(/20250114$/);
  await p.goBack();
  await p.waitForURL(/20250115$/);
  await p.locator('.perf.hero .name', { hasText: 'Mark Williams' }).waitFor();
  // Picking a day on the calendar.
  await p.locator('.day input').fill('2025-06-16');
  await p.waitForURL(/20250616$/);
  await p.locator('.perf.hero .stage', { hasText: 'NBA Finals' }).waitFor();
  assert.equal(await p.locator('.perf.hero .name').textContent(), 'Jalen Williams');
  // A postponed game is listed with the night.
  await p.goto(`${base}/night/20250111`); await p.locator('.perf').first().waitFor();
  assert.ok((await p.locator('.games small').allTextContents()).some(t => /Postponed/.test(t)));
  // Choosing a season jumps to its last night.
  await p.locator('select').selectOption('2027');
  await p.waitForURL(/\/night\/2026\d{4}$/);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('the leaderboard: most top-five nights, a player\'s nights, links back', async () => {
  const { p, errors } = await page('/night/20250115');
  await p.getByRole('link', { name: /Season leaderboard/ }).click();
  await p.waitForURL(/\/leaderboard\/2025$/);
  await p.locator('.lb-row').first().waitFor();
  assert.match(await p.locator('.lb-row').first().textContent(), /Nikola Jokic/);
  const counts = (await p.locator('.lb-row .lb-n:nth-child(3) b').allTextContents()).map(Number);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  await p.locator('.lb-row').first().click();
  assert.ok(await p.locator('.lb-nights li').count() > 40);
  await p.getByRole('radio', { name: 'Playoffs' }).click();
  await p.locator('.lb-row').first().waitFor();
  await p.locator('.lb-row').first().click();
  await p.locator('.lb-nights a').first().click();
  await p.waitForURL(/\/night\/2025\d{4}$/);
  await p.locator('.perf').first().waitFor().catch(() => {});
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('phone: no sideways scrolling', async () => {
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  for (const path of ['/night/20250616', '/leaderboard/2025']) {
    const { p, errors } = await page(path, opts);
    await p.locator('.perf, .lb-row').first().waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, path);
    assert.deepEqual(errors, []);
    await p.context().close();
  }
});
