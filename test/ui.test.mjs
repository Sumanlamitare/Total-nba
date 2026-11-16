// Browser test: the built app with the API (in-memory database, mock ESPN), driven by Chromium. Set-up, the dashboard,
// the delete button and its confirmation, a graphic's preview, editor and PNG download, phones without sideways scroll.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright']) { try { if (p) return require(p); } catch { /* next */ } } throw new Error('playwright not found'); })();
let browser, base, state;
before(async () => {
  const port = 5200 + Math.floor(Math.random() * 500);
  Object.assign(process.env, { FP90_MEMDB: '1', STATIC_DIR: 'dist', PORT: String(port), MOCK_ESPN: '1', FP90_SETUP_HASH: crypto.createHash('sha256').update('fp90-setup:ui-code').digest('hex'), FP90_INSECURE_COOKIE: '1' });
  await import('../scripts/dev.mjs');
  base = `http://localhost:${port}`;
  browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); setTimeout(() => process.exit(0), 200); });

async function page(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...(state ? { storageState: state } : {}), ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + path);
  return { p, errors, ctx };
}

test('set up the owner, see the day\'s matches with statuses and graphics', async () => {
  const { p, errors, ctx } = await page('/');
  await p.waitForSelector('text=Set up');
  await p.fill('input >> nth=0', 'ui-code'); await p.fill('input >> nth=1', 'Owner'); await p.fill('input[type=email]', 'o@x.co'); await p.fill('input[type=password]', 'long-enough-pw');
  await p.click('button:has-text("Create account")');
  await p.waitForSelector('.row', { timeout: 30000 });
  state = await ctx.storageState();
  const text = await p.locator('.main').innerText();
  for (const s of ['Premier League', 'Everton', 'Graphic generated', 'Halftime', 'Scheduled']) assert.match(text, new RegExp(s, 'i'), s);
  assert.doesNotMatch(text, /Women/i);
  await p.click('.seg button:has-text("Live")');
  assert.ok((await p.locator('.row').count()) >= 1 && (await p.locator('.row.st-scheduled').count()) === 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a graphic: preview, editor with live preview, PNG download at 1080 × 1350', async () => {
  const { p, errors, ctx } = await page('/graphics');
  await p.waitForSelector('.tile');
  await p.click('.tile:has-text("Everton")');
  await p.waitForSelector('.canvas svg');
  assert.match(await p.locator('.canvas').innerHTML(), /Thierno Barry/);
  await p.click('button:has-text("Edit")');
  await p.fill('label:has-text("Home team") input', 'Everton FC');
  await p.waitForTimeout(200);
  assert.match(await p.locator('.canvas').innerHTML(), /EVERTON FC|Everton FC/i);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("Download PNG")')]);
  const buf = await (await import('node:fs')).promises.readFile(await dl.path());
  assert.equal(buf.readUInt32BE(16), 1080); assert.equal(buf.readUInt32BE(20), 1350);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('DELETE COMPLETED MATCH DATA: confirmation shows the counts; afterwards only unfinished matches remain, graphics stay', async () => {
  const { p, errors, ctx } = await page('/completed');
  await p.waitForSelector('.trow');
  await p.click('button:has-text("DELETE COMPLETED MATCH DATA")');
  await p.waitForSelector('.modal');
  assert.match(await p.locator('.modal').innerText(), /completed match.*goal event/s);
  await p.click('.modal button.danger');
  await p.waitForSelector('.notice.ok');
  const rows = await p.locator('.trow').allInnerTexts();
  assert.ok(rows.every(r => /Waiting for scorers|Freiburg/.test(r)), rows.join('\n'));
  await p.goto(base + '/');
  await p.waitForSelector('.row');
  const text = await p.locator('.main').innerText();
  assert.match(text, /Arsenal/); assert.match(text, /Liverpool/);
  await p.goto(base + '/graphics');
  await p.waitForSelector('.tile');
  assert.ok((await p.locator('.tile').count()) >= 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phones: no sideways scrolling, bottom tabs', async () => {
  for (const path of ['/', '/completed', '/graphics', '/settings']) {
    const { p, errors, ctx } = await page(path, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.waitForSelector('.page', { timeout: 15000 });
    await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, path);
    assert.ok(await p.locator('.bottom-tabs').isVisible(), path);
    assert.deepEqual(errors, [], path);
    await ctx.close();
  }
});
