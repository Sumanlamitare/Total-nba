// Browser test: the real interface against saved API responses (test/fixtures), in Chromium with software WebGL.
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
  browser = await chromium.launch({ executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true, ...opts });
  // Fonts come from Google; the tests don't need them.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn\.com/, r => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.errors = errors;
  return p;
}

test('the reading room: search guides to the shelf, a book opens, chapters turn, Esc returns', async () => {
  const p = await page();
  await p.goto(base + '/');
  await p.getByText(/Bookcase 1 of \d+/).waitFor({ timeout: 30000 });
  assert.match(await p.locator('.tagline').innerText(), /5,2\d\d NBA players/);
  await p.waitForTimeout(1500);
  await p.keyboard.press('/');
  await p.getByRole('combobox').fill('bill russell');
  assert.equal(await p.locator('.card-name').first().innerText(), 'Bill Russell');
  await p.keyboard.press('Enter');
  await p.locator('.slip.chosen', { hasText: 'Bill Russell' }).waitFor();
  await p.getByRole('button', { name: 'Open book' }).click();
  const reader = p.getByRole('dialog', { name: /Bill Russell/ });
  await reader.waitFor({ timeout: 15000 });
  assert.match(p.url(), /\/book\/4152\/bill-russell$/);
  await p.getByRole('button', { name: /Begin reading/ }).click();
  await p.getByText(/played 13 regular seasons/).waitFor();
  for (let k = 0; k < 5; k++) await p.keyboard.press('ArrowRight');
  await p.getByRole('heading', { name: 'Statistical record', exact: true }).waitFor();
  assert.equal(await p.locator('table.stats tbody tr').count(), 13);
  // Rebounds were not recorded by ESPN for these seasons: blank, not zero.
  const reb = await p.locator('table.stats tbody tr').first().locator('td').nth(5).innerText();
  assert.equal(reb, '—');
  await p.getByRole('radio', { name: 'Totals' }).click();
  await p.getByRole('radio', { name: 'Playoffs' }).click();
  assert.equal(await p.locator('table.stats tbody tr').count(), 13);
  await p.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached' });
  assert.equal(new URL(p.url()).pathname, '/');
  // Open another straight from the catalogue (Shift+Enter), then the browser's Back button closes it.
  await p.keyboard.press('/');
  await p.getByRole('combobox').fill('wembanyama');
  await p.keyboard.press('Shift+Enter');
  await p.getByRole('dialog', { name: /Victor Wembanyama/ }).waitFor({ timeout: 15000 });
  await p.goBack();
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(new URL(p.url()).pathname, '/');
  assert.deepEqual(p.errors, []);
});

test('a link straight to a book opens it on its own', async () => {
  const p = await page();
  await p.goto(base + '/');
  await p.getByText(/Bookcase 1 of/).waitFor({ timeout: 30000 });
  await p.goto(base + '/book/4142/wilt-chamberlain');
  const reader = p.getByRole('dialog', { name: /Wilt Chamberlain/ });
  await reader.waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /The player/ }).first().click();
  await p.getByText(/career began in 1959-60/).waitFor();
  await p.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached' });
  assert.deepEqual(p.errors, []);
});

test('records chapter loads career highs and says where they come from', async () => {
  const p = await page();
  await p.goto(base + '/book/1966/lebron-james');
  await p.getByRole('dialog', { name: /LeBron James/ }).waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /Records/ }).first().click();
  await p.getByText('Led the league').waitFor();
  await p.getByText(/Counted from ESPN's game logs/).waitFor({ timeout: 10000 });
  assert.ok(await p.locator('table.highs tbody tr').count() >= 5);
});

test('without WebGL the library is a shelf list that works by keyboard', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn\.com/, r => r.abort());
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function (t) { return /webgl/.test(t) ? null : CanvasRenderingContext2D && null; }; });
  const p = await ctx.newPage();
  await p.goto(base + '/');
  await p.getByRole('region', { name: 'Shelf list' }).waitFor({ timeout: 20000 }).catch(() => {});
  await p.locator('.listview').waitFor();
  assert.equal(await p.getByRole('button', { name: /Shelf list|Reading room/ }).count(), 0, 'no 3D toggle offered');
  const first = p.locator('.spine').first();
  await first.focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.getByRole('dialog').waitFor({ timeout: 10000 });
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
});

test('phone: the reader is a single page with a chapter picker', async () => {
  const p = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.goto(base + '/book/3992/james-harden');
  await p.getByRole('dialog', { name: /James Harden/ }).waitFor({ timeout: 30000 });
  await p.getByLabel('Chapter').selectOption('6');
  await p.getByRole('heading', { name: 'Statistical record', exact: true }).waitFor();
  assert.ok(await p.locator('tr.combined').count() >= 2, 'traded seasons show a season total');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, 'no sideways page scroll');
});
