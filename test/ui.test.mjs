// Browser test: the real UI against the real API and MongoDB. CI installs Playwright for this.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';

const PORT = 5393, BASE = `http://localhost:${PORT}`, DB = `nightjar_ui_${Date.now()}`;
let server, browser, mongo;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(PORT), NIGHTJAR_DB: DB }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  browser = await chromium.launch();
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { await browser?.close(); server?.kill(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

test('sign up, create a check, ping it, see it go up, publish a status page', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '/');
  await page.getByRole('link', { name: 'Start free — no card' }).click();
  await page.getByLabel('Your name').fill('Ui Tester');
  await page.getByLabel('Email').fill('ui@example.com');
  await page.getByLabel('Password').fill('a-good-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Welcome to Nightjar').waitFor();

  await page.getByRole('button', { name: 'Create your first check' }).click();
  await page.getByLabel('Name').fill('UI test job');
  await page.getByRole('button', { name: 'Hourly' }).first().click();
  await page.getByRole('button', { name: 'Create check' }).click();
  await page.getByText('Waiting for the first ping').waitFor();

  const url = (await page.locator('.copyfield code').first().textContent()).trim();
  assert.match(url, /\/p\/[A-Za-z0-9_-]{20,}$/);
  assert.equal(await (await fetch(url)).text(), 'OK\n');
  await page.locator('.pill.s-up').first().waitFor({ timeout: 20000 }); // the page polls every 10 s
  await page.getByText('Last run time').waitFor();

  await page.getByRole('link', { name: '← All checks' }).click();
  await page.getByText('UI test job').waitFor();
  assert.equal(await page.locator('.checkrow .pill.s-up').count(), 1);

  await page.getByRole('link', { name: 'Status page' }).click();
  await page.getByPlaceholder('acme', { exact: true }).fill('ui-tester');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Status page saved').waitFor();
  await page.getByRole('checkbox').check();
  await page.waitForTimeout(500);
  await page.goto(BASE + '/s/ui-tester');
  await page.getByText('All systems running').waitFor();
  await page.getByText('UI test job').waitFor();

  await page.goto(BASE + '/app/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL(BASE + '/');
  await page.goto(BASE + '/app');
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel('Email').fill('ui@example.com');
  await page.getByLabel('Password').fill('a-good-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('UI test job').waitFor();

  // phone width: no sideways scrolling on the main pages
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of ['/', '/docs', '/app', '/s/ui-tester']) {
    await page.goto(BASE + p); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll on ${p}`);
  }
  assert.deepEqual(errors, []);
});
