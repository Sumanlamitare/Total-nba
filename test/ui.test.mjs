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

// Look for something on the book's visible pages, turning pages forward (→) until it shows up.
async function findInBook(p, make, turns = 4) {
  for (let k = 0; ; k++) {
    const loc = make(p.locator('.book'));
    if (await loc.first().isVisible().catch(() => false)) return loc;
    if (k >= turns) {
      const state = await p.evaluate(() => ({ pages: document.querySelector('.pg-count')?.textContent, chapter: document.querySelector('.chapter-pick select')?.value, heads: [...document.querySelectorAll('.book h2, .book h3')].map(h => h.textContent), turning: !!document.querySelector('.book.turning') }));
      throw new Error(`not found in the book: ${JSON.stringify(state)}`);
    }
    await p.keyboard.press('ArrowRight');
    await p.locator('.book:not(.turning)').waitFor();
    await p.waitForTimeout(150);
  }
}

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true, ...opts });
  // Fonts come from Google; the tests don't need them.
  await ctx.route(/espncdn\.com/, r => r.abort()); // portraits; the web fonts load as they do for real
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.errors = errors;
  return p;
}

test('the reading room: search guides to the shelf, a book opens, chapters turn, Esc returns', async () => {
  const p = await page();
  await p.goto(base + '/');
  await p.locator('.where').waitFor({ timeout: 30000 });
  await p.locator('.room .loading').waitFor({ state: 'detached', timeout: 30000 });
  assert.match(await p.locator('.brand-count').textContent(), /5,2\d\d players/);
  await p.waitForTimeout(1500);
  // The Teams button walks you to a team's section.
  await p.getByRole('button', { name: 'Teams' }).click();
  await p.getByRole('dialog', { name: 'Teams' }).getByRole('button', { name: /Boston Celtics/ }).click();
  await p.locator('.where', { hasText: 'Boston Celtics' }).waitFor({ timeout: 20000 });
  await p.keyboard.press('/');
  await p.getByRole('combobox').fill('bill russell');
  assert.equal(await p.locator('.card-name').first().textContent(), 'Bill Russell');
  await p.keyboard.press('Enter');
  await p.locator('.slip.chosen', { hasText: 'Bill Russell' }).waitFor();
  await p.keyboard.press('Enter'); // opens the selected book (the slip's button does the same)
  const reader = p.getByRole('dialog', { name: /Bill Russell/ });
  await reader.waitFor({ timeout: 15000 });
  assert.match(p.url(), /\/book\/4152\/bill-russell$/);
  // The book arrives closed, cover up; → opens it at the bookplate and the title page. Turn the page to read on.
  await p.locator('.book.closed .cover', { hasText: 'BILL' }).waitFor();
  await p.keyboard.press('ArrowRight');
  await p.locator('.book:not(.turning):not(.closed) .bookplate').waitFor();
  await p.keyboard.press('ArrowRight');
  await findInBook(p, b => b.getByText(/played 13 regular seasons/));
  // A page turns: mid-turn the book shows the folded-over back of the page.
  await p.keyboard.press('ArrowRight');
  await p.locator('.book .leaf-back').waitFor({ state: 'attached' });
  await p.locator('.book:not(.turning)').waitFor();
  // Jump by chapter: the statistical record.
  await p.getByLabel('Chapter').selectOption('7');
  await p.locator('.book:not(.turning)').waitFor();
  const rows = await findInBook(p, b => b.locator('table.stats tbody tr'));
  assert.equal(await rows.count(), 13);
  // Rebounds were not recorded by ESPN for these seasons: blank, not zero.
  assert.equal(await rows.first().locator('td').nth(5).innerText(), '—');
  await p.locator('.book').getByRole('radio', { name: 'Totals' }).click();
  await p.locator('.book').getByRole('radio', { name: 'Playoffs' }).click();
  assert.equal(await p.locator('.book table.stats tbody tr').count(), 13);
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
  await p.locator('.where').waitFor({ timeout: 30000 });
  await p.goto(base + '/book/4142/wilt-chamberlain');
  const reader = p.getByRole('dialog', { name: /Wilt Chamberlain/ });
  await reader.waitFor({ timeout: 30000 });
  await p.keyboard.press('ArrowRight'); // open the cover
  await p.keyboard.press('ArrowRight'); // and turn to the contents (queued behind the first turn)
  await p.locator('.book .toc').waitFor();
  await p.locator('.book:not(.turning)').waitFor();
  // The contents page carries real page numbers and turns to the chapter.
  await p.locator('.book .toc').getByRole('button', { name: /The player/ }).click();
  await p.locator('.book:not(.turning)').waitFor();
  await findInBook(p, b => b.getByText(/career began in 1959-60/));
  await p.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached' });
  assert.deepEqual(p.errors, []);
});

test('records chapter loads career highs and says where they come from', async () => {
  const p = await page();
  await p.goto(base + '/book/1966/lebron-james');
  await p.getByRole('dialog', { name: /LeBron James/ }).waitFor({ timeout: 30000 });
  await p.getByLabel('Chapter').selectOption('4');
  await p.locator('.book:not(.turning)').waitFor();
  await findInBook(p, b => b.getByText('Led the league'));
  const highs = await findInBook(p, b => b.locator('table.highs tbody tr'), 6);
  assert.ok(await highs.count() >= 5);
  await findInBook(p, b => b.getByText(/Counted from ESPN's game logs/));
});

test('without WebGL the library is a shelf list that works by keyboard', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.route(/espncdn\.com/, r => r.abort()); // portraits; the web fonts load as they do for real
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function (t) { return /webgl/.test(t) ? null : CanvasRenderingContext2D && null; }; });
  const p = await ctx.newPage();
  await p.goto(base + '/');
  await p.getByRole('region', { name: 'Shelf list' }).waitFor({ timeout: 20000 }).catch(() => {});
  await p.locator('.listview').waitFor();
  assert.equal(await p.getByRole('button', { name: /List view|Walk the library/ }).count(), 0, 'no 3D toggle offered');
  const first = p.locator('.spine').first();
  await first.focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.getByRole('dialog').waitFor({ timeout: 10000 });
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
});

test('phone: the reader is a single page that turns, with a chapter picker', async () => {
  const p = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.goto(base + '/book/3992/james-harden');
  await p.getByRole('dialog', { name: /James Harden/ }).waitFor({ timeout: 30000 });
  // A tap on the cover opens the book; a tap on the right of a page turns it, on the left turns back.
  await p.locator('.book.closed .cover').tap();
  await p.locator('.book:not(.turning):not(.closed)').waitFor();
  assert.equal(await p.locator('.pg-count').textContent(), '1 / ' + (await p.locator('.pg-count').textContent()).split(' / ')[1]);
  const box = await p.locator('.book').boundingBox();
  await p.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await p.locator('.book:not(.turning)').waitFor();
  await p.waitForFunction(() => document.querySelector('.pg-count')?.textContent.startsWith('2 /'));
  await p.touchscreen.tap(box.x + box.width * 0.15, box.y + box.height * 0.82); // below the contents list
  await p.waitForFunction(() => document.querySelector('.pg-count')?.textContent.startsWith('1 /'));
  await p.getByLabel('Chapter').selectOption('7');
  await p.locator('.book:not(.turning)').waitFor();
  await findInBook(p, b => b.getByRole('heading', { name: 'Statistical record', exact: true }));
  const combined = await findInBook(p, b => b.locator('tr.combined'));
  assert.ok(await combined.count() >= 2, 'traded seasons show a season total');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, 'no sideways page scroll');
});
