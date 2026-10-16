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

test('the shelves: a team per shelf, one shelf for the retired, search brings a book to the pointer, it comes off the shelf and opens', async () => {
  const p = await page();
  await p.goto(base + '/');
  await p.locator('.vol').first().waitFor({ timeout: 30000 });
  // Active players start on "All teams": every active player, A to Z, with letters to jump along.
  assert.match(await p.locator('#team-pick option:checked').textContent(), /^All teams \(\d+\)$/);
  await p.getByRole('heading', { level: 1, name: 'Active players' }).waitFor();
  assert.equal(await p.locator('.ptag').textContent(), 'A');
  await p.getByRole('group', { name: 'Jump to' }).getByRole('button', { name: 'W', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('.ptag')?.textContent === 'W');
  // One team at a time, picked from the same dropdown.
  await p.getByLabel('Team').selectOption({ label: (await p.locator('#team-pick option', { hasText: 'Boston Celtics' }).textContent()).trim() });
  await p.getByRole('heading', { level: 1, name: 'Boston Celtics' }).waitFor();
  assert.match(await p.locator('.count').textContent(), /^\d+ players?$/);
  // Retired players: one shelf, no team picker.
  await p.getByRole('button', { name: /^Retired players/ }).click();
  await p.getByRole('heading', { level: 1, name: 'Retired players' }).waitFor();
  assert.equal(await p.getByLabel('Team').count(), 0);
  assert.match(await p.locator('.count').textContent(), /^4,\d{3} players$/);
  // Search: Enter brings the book to the pointer on its shelf and focuses it.
  await p.keyboard.press('/');
  await p.getByRole('combobox').fill('bill russell');
  assert.equal(await p.locator('#search-results .r-name').first().textContent(), 'Bill Russell');
  await p.keyboard.press('Enter');
  await p.locator('.vol.flash[data-id="4152"]').waitFor();
  assert.equal(await p.locator('.ptag').textContent(), 'R');
  await p.keyboard.press('Enter'); // the focused book comes off the shelf
  const reader = p.getByRole('dialog', { name: /Bill Russell/ });
  await reader.waitFor({ timeout: 15000 });
  await p.locator('.reader:not(.hidden)').waitFor();
  assert.match(p.url(), /\/book\/4152\/bill-russell$/);
  // It arrives closed, cover up, with his last team; → opens it at the bookplate and the title page.
  await p.locator('.book.closed .cover', { hasText: 'Boston Celtics' }).waitFor();
  await p.locator('.book:not(.turning) .pg-count, .reader .pg-count', { hasText: 'Cover' }).first().waitFor();
  await p.keyboard.press('ArrowRight');
  await p.locator('.book:not(.turning):not(.closed) .bookplate').waitFor();
  await p.keyboard.press('ArrowRight');
  await findInBook(p, b => b.getByText(/played 13 regular seasons/));
  // A page turns: mid-turn the book shows the folded-over back of the page.
  await p.keyboard.press('ArrowRight');
  await p.locator('.book .leaf-back').waitFor({ state: 'attached' });
  await p.locator('.book:not(.turning)').waitFor();
  await p.getByLabel('Chapter').selectOption('7');
  await p.locator('.book:not(.turning)').waitFor();
  const rows = await findInBook(p, b => b.locator('table.stats tbody tr'));
  assert.equal(await rows.count(), 13);
  assert.equal(await rows.first().locator('td').nth(5).innerText(), '—', 'rebounds not recorded: blank, not zero');
  await p.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached' });
  assert.equal(new URL(p.url()).pathname, '/');
  await p.locator('.vol[data-id="4152"]').waitFor({ state: 'visible', timeout: 10000 }); // put back on the shelf
  await p.locator('.stage').waitFor({ state: 'detached', timeout: 10000 });
  // Shift+Enter opens straight from the search; the browser's Back button closes it.
  await p.keyboard.press('/');
  await p.getByRole('combobox').fill('wembanyama');
  await p.keyboard.press('Shift+Enter');
  await p.getByRole('dialog', { name: /Victor Wembanyama/ }).waitFor({ timeout: 15000 });
  assert.equal(await p.locator('main h1').textContent(), 'San Antonio Spurs', 'his team\'s shelf, behind the book');
  await p.goBack();
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(new URL(p.url()).pathname, '/');
  assert.deepEqual(p.errors, []);
});

test('a link straight to a book opens it on its own', async () => {
  const p = await page();
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

test('the shelf works by keyboard, and the retired shelf jumps by letter', async () => {
  const p = await page({ viewport: { width: 1100, height: 800 } });
  await p.goto(base + '/');
  await p.locator('.vol').first().waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /^Retired players/ }).click();
  await p.getByRole('group', { name: 'Jump to' }).getByRole('button', { name: 'W', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('.ptag')?.textContent === 'W');
  // One tab stop on the shelf; arrows move along it; Enter takes the book down.
  const first = p.locator('.vol[tabindex="0"]');
  await first.focus();
  const before = await first.getAttribute('data-id');
  await p.keyboard.press('ArrowRight');
  const now = await p.evaluate(() => document.activeElement?.dataset.id);
  assert.notEqual(now, before);
  await p.keyboard.press('Enter');
  await p.getByRole('dialog').waitFor({ timeout: 10000 });
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(p.errors, []);
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
