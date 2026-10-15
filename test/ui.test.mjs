// Browser test: two people use the real UI against the real API and MongoDB. CI installs Playwright for this.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';

const PORT = 5493, BASE = `http://localhost:${PORT}`, DB = `turnout_ui_${Date.now()}`;
let server, browser, mongo;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(PORT), TURNOUT_DB: DB }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  browser = await chromium.launch();
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { await browser?.close(); server?.kill(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

async function signup(page, name, email) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('kick-off-123');
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('an organizer starts a group, a player joins by link, both play', async () => {
  const errors = [];
  const org = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const ply = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  for (const p of [org, ply]) p.on('pageerror', e => errors.push(e.message));

  // organizer
  await org.goto(BASE + '/');
  await org.getByRole('link', { name: 'Start a group — free' }).first().click();
  await signup(org, 'Olivia Reyes', 'olivia@example.com');
  await org.getByText('Start your first group').waitFor();
  await org.getByRole('button', { name: 'Start a group' }).click();
  await org.getByLabel('Group name').fill('Sunday Soccer');
  await org.getByRole('radio', { name: /Soccer/ }).click();
  await org.getByLabel('Usual spot (optional)').fill('Riverside Field');
  await org.getByRole('button', { name: 'Create group' }).click();
  await org.getByText('Now invite your players').waitFor();
  const link = (await org.locator('.invrow code').first().textContent()).trim();
  const code = link.split('/join/')[1];
  assert.ok(code && code.length >= 4, link);

  await org.getByRole('button', { name: '+ Post a game' }).click();
  await org.getByLabel('Spots').fill('2');
  await org.getByLabel('Need at least').fill('2');
  await org.getByRole('button', { name: 'Post game' }).click();
  await org.getByText('You\'re in ✅').waitFor();
  await org.getByText('Need 1 more to play', { exact: false }).waitFor();
  const gameUrl = org.url();

  // player, on a phone, from the invite link
  await ply.goto(`${BASE}/join/${code}`);
  await ply.getByText('Sunday Soccer').waitFor();
  await ply.getByRole('link', { name: 'Sign up to join' }).click();
  await signup(ply, 'Marcus Bell', 'marcus@example.com');
  await ply.getByRole('button', { name: 'Join group' }).click();
  await ply.getByRole('heading', { name: 'Sunday Soccer' }).waitFor();
  await ply.locator('.gamecard').first().click();
  await ply.getByText('Are you in?').first().waitFor();
  await ply.getByRole('radio', { name: 'I\'m in' }).click();
  await ply.getByText('You\'re in ✅').waitFor();
  await ply.getByText('Game on', { exact: false }).waitFor();
  await ply.getByLabel('Message').fill('On my way ⚽');
  await ply.getByRole('button', { name: 'Send' }).click();
  await ply.getByText('On my way ⚽').waitFor();
  assert.ok(await ply.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on the game page');

  // organizer sees the player, makes teams
  await org.goto(gameUrl);
  await org.getByText('Marcus Bell').first().waitFor();
  await org.getByText('On my way ⚽').waitFor();
  await org.getByRole('button', { name: 'Make teams' }).click();
  await org.getByRole('heading', { name: 'Lights' }).waitFor();
  await org.getByRole('heading', { name: 'Darks' }).waitFor();

  // home shows the game for the player
  await ply.goto(BASE + '/home');
  await ply.getByText('Sunday Soccer').first().waitFor();
  assert.equal(await ply.locator('.gamecard .chip.in').count(), 1);
  for (const p of ['/', '/home']) {
    await ply.goto(BASE + p); await ply.waitForTimeout(300);
    assert.ok(await ply.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll on ${p}`);
  }
  assert.deepEqual(errors, []);
});
