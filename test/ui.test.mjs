// Browser test: the real game against the saved /api/game response (test/fixtures/game.json), desktop and phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const port = 5800 + (process.pid % 100);
const base = `http://127.0.0.1:${port}`;
const exe = process.env.CHROMIUM_PATH || undefined;
let server, browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port), MOCK_API: 'test/fixtures' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dev server did not start')), 20000);
    server.stdout.on('data', b => { if (String(b).includes('dev on')) { clearTimeout(t); resolve(); } });
  });
  browser = await chromium.launch({ executablePath: exe, args: ['--headless=new'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.route(/espncdn\.com/, r => r.abort()); // headshots fall back to initials
  await p.goto(base);
  await p.locator('#boot').waitFor({ state: 'detached', timeout: 20000 });
  return { p, errors };
}

// Spin five times, signing the first player dealt each time (choosing his first spot when he fits two).
async function draft(p) {
  for (let k = 0; k < 5; k++) {
    await p.getByRole('button', { name: /^Spin/ }).click();
    await p.locator('.cards .card').first().waitFor();
    assert.ok(await p.locator('.cards .card').count() <= 4, 'a spin deals at most four players');
    await p.locator('.cards .card').first().click();
    const where = p.getByRole('dialog');
    if (await where.isVisible().catch(() => false)) await where.locator('.modal-actions .btn').first().click();
    await p.locator(`.court .spot.on`).nth(k).waitFor();
  }
}

test('home: the ladder with only the first rung open, and the daily challenge', async () => {
  const { p, errors } = await page();
  await assert.doesNotReject(p.getByRole('heading', { name: /Beat the Dynasty/i }).waitFor());
  const banners = p.locator('.banner');
  assert.equal(await banners.count(), 8);
  assert.equal(await p.locator('.banner.locked').count(), 7);
  assert.match(await banners.last().textContent(), /Final boss.*Warriors/);
  assert.match(await banners.nth(6).textContent(), /Bulls/);
  assert.match(await p.locator('.daily').textContent(), /Today: the '\d\d \w+/);
  // A locked banner says what to beat first.
  await banners.nth(3).click({ force: true });
  assert.match(await p.locator('.peek').textContent(), /Beat the '\d\d \w+ first/);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('a whole run: draft, tale of the tape, the series, the result, the next rung unlocked', async () => {
  const { p, errors } = await page();
  await p.locator('.banner').first().click({ force: true });
  await draft(p);
  await p.locator('.tape').waitFor();
  assert.equal(await p.locator('.matchups li').count(), 5);
  const odds = await p.locator('.tape-odds b').textContent();
  await p.getByRole('button', { name: 'Tip off' }).click();
  await p.locator('.board').waitFor();
  await p.getByRole('button', { name: 'Sim to the end' }).click();
  const games = await p.locator('.games li').count();
  assert.ok(games >= 4 && games <= 7, `${games} games`);
  // Every game has a score, a headline and a box score.
  await p.locator('.games li').first().locator('.game-row').click();
  assert.equal(await p.locator('.box').count(), 2);
  assert.equal(await p.locator('.box').first().locator('tbody tr').count(), 6);
  await p.locator('.series-actions .btn.primary').click();
  await p.locator('.result').waitFor();
  const verdict = await p.locator('.verdict').textContent();
  assert.match(verdict, /Dynasty down|Eliminated/);
  const share = await p.locator('.share-text').textContent();
  assert.match(share, /Beat the Dynasty/);
  assert.match(share, /Team \d+\.\d/);
  assert.equal(share.split('\n').length, 8);
  await p.getByRole('button', { name: 'Home', exact: true }).click();
  await p.locator('.banner').first().waitFor();
  assert.equal(await p.locator('.banner.locked').count(), verdict === 'Dynasty down' ? 6 : 7, `odds were ${odds}`);
  assert.deepEqual(errors, []);
  await p.context().close();
});

test('daily: the same spins for everyone', async () => {
  const deals = [];
  for (let k = 0; k < 2; k++) {
    const { p } = await page();
    await p.getByRole('button', { name: /Play the daily/ }).click();
    await p.getByRole('button', { name: /^Spin/ }).click();
    await p.locator('.cards .card').first().waitFor();
    deals.push(await p.locator('.cards .card-main b').allTextContents());
    await p.context().close();
  }
  assert.deepEqual(deals[0], deals[1]);
});

test('phone: the draft and the result fit the screen', async () => {
  const { p, errors } = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.locator('.banner').first().tap({ force: true });
  await draft(p);
  await p.getByRole('button', { name: 'Tip off' }).click();
  await p.getByRole('button', { name: 'Sim to the end' }).click();
  await p.locator('.series-actions .btn.primary').click();
  await p.locator('.result').waitFor();
  await p.waitForTimeout(1500); // the card's entrance has settled
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scrolling');
  assert.deepEqual(errors, []);
  await p.context().close();
});
