// Browser test: the real interface against saved API responses (test/fixtures/api, real data), desktop and phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// The fixtures' own No. 1s, so the test follows a recalibrated score.
const fixture = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/api/${f}.json`, import.meta.url)));
const no1 = date => fixture(`night_${date}`).top[0].name;

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
  assert.equal(await p.locator('.rows > .perf').count(), 5);
  const scores = (await p.locator('.perf .score').allTextContents()).map(Number);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(await p.locator('.perf.first .name').textContent(), no1('20261024'));
  // The No. 1 is explained: why he won, the closest competitors, the five categories, the arithmetic, the data.
  assert.equal(await p.locator('.perf.first .cat').count(), 5);
  assert.match(await p.locator('.perf.first .verdict').textContent(), /Why .* won.*No\. 1 of \d+ players.*Closest competitors/s);
  assert.equal(await p.locator('.perf.first .verdict li').count() >= 4, true);
  assert.match(await p.locator('.perf.first .math .total').textContent(), /POTN score\d+\.\d/);
  assert.match(await p.locator('.perf.first .conf').textContent(), /Data confidence: (high|medium|low)/);
  assert.ok(scores.every(x => x >= 0 && x <= 100));
  assert.equal(await p.locator('.games li').count(), 8);
  // Another performance opens its breakdown; the next five are a tap away.
  await p.locator('.perf').nth(2).locator('.row').click();
  await p.locator('.perf').nth(2).locator('.detail').waitFor();
  assert.equal(await p.locator('.perf').nth(2).locator('.verdict').count(), 0, 'only No. 1 has the verdict');
  // Sharing: a menu of networks and a copy-link button; the links go through /s/... for the preview card.
  await p.locator('.perf.open .detail .share-btn').click();
  await p.locator('.share-menu').waitFor();
  const hrefs = await p.locator('.share-menu a').evaluateAll(a => a.map(x => x.href));
  assert.equal(hrefs.length, 6);
  assert.ok(hrefs[0].startsWith('https://twitter.com/intent/tweet?text=') && decodeURIComponent(hrefs[0]).includes('/s/20261024/'));
  await p.getByRole('menuitem', { name: 'Copy link' }).waitFor();
  // The graphic itself: downloads (wide and square for Instagram), with a preview.
  await p.getByRole('menuitem', { name: 'Download image' }).waitFor();
  await p.getByRole('menuitem', { name: 'Download square (Instagram)' }).waitFor();
  assert.match(await p.locator('.share-preview img').getAttribute('src'), /^\/api\/og\?date=20261024&p=\d+$/);
  await p.keyboard.press('Escape'); await p.locator('h1').click();
  // How the score works.
  await p.locator('.method summary').click();
  assert.match(await p.locator('.method').textContent(), /Offense\s*30%.*Stat padding.*Fouls/s);
  await p.getByRole('button', { name: /Show 6–10/ }).click();
  assert.equal(await p.locator('.rows > .perf').count(), 10);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('switching dates and seasons', async () => {
  const { p, errors } = await page('/night/20250115');
  await p.locator('.perf').first().waitFor();
  assert.equal(await p.locator('h1').textContent(), 'Wednesday, January 15, 2025');
  assert.equal(await p.locator('.perf.first .name').textContent(), no1('20250115'));
  assert.equal(await p.locator('select').inputValue(), '2025');
  // The arrows step through game nights (the previous one is the 14th).
  await p.getByRole('button', { name: /Previous game night, Tuesday, January 14, 2025/ }).click();
  await p.waitForURL(/20250114$/);
  await p.goBack();
  await p.waitForURL(/20250115$/);
  await p.locator('.perf.first .name', { hasText: no1('20250115') }).waitFor();
  // Picking a day on the calendar.
  await p.locator('.day input').fill('2025-06-16');
  await p.waitForURL(/20250616$/);
  await p.locator('.perf.first .who small', { hasText: 'Finals' }).waitFor();
  assert.equal(await p.locator('.perf.first .name').textContent(), no1('20250616'));
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
  await p.locator('.row.lb').first().waitFor();
  assert.match(await p.locator('.row.lb').first().textContent(), new RegExp(fixture('leaderboard_2025_all').players[0].name));
  const counts = (await p.locator('.row.lb .count .num').allTextContents()).map(Number);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  await p.locator('.row.lb').first().click();
  assert.ok(await p.locator('.nights li').count() > 40);
  await p.getByRole('radio', { name: 'Playoffs' }).click();
  await p.locator('.row.lb').first().waitFor();
  await p.locator('.row.lb').first().click();
  await p.locator('.nights a').first().click();
  await p.waitForURL(/\/night\/2025\d{4}$/);
  await p.locator('.perf').first().waitFor().catch(() => {});
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('a shared link opens that performance; phones show the stat line', async () => {
  const third = fixture('night_20261024').top[2];
  const { p, errors } = await page(`/night/20261024?p=${third.id}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.locator('.perf.open .detail').waitFor();
  assert.equal(await p.locator('.perf.open .name').textContent(), third.name);
  assert.match(await p.locator('.perf.open .line-m').textContent(), new RegExp(`^${third.line.pts} pts`));
  await p.locator('.perf.open .line-m').waitFor();
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('phone: no sideways scrolling', async () => {
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  for (const path of ['/night/20250616', '/leaderboard/2025']) {
    const { p, errors } = await page(path, opts);
    await p.locator('.rows li').first().waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, path);
    assert.deepEqual(errors, []);
    await p.context().close();
  }
});
