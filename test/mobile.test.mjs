// The mobile app's own screens (its web build), driven in a phone-sized browser against the real API and MongoDB.
// CI builds mobile/dist-web with EXPO_PUBLIC_API_URL=http://localhost:5693 and installs Playwright.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';

const PORT = 5693, BASE = `http://localhost:${PORT}`, DB = `turnout_mobile_${Date.now()}`;
let server, browser, mongo;

before(async () => {
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(PORT), TURNOUT_DB: DB, STATIC_DIR: 'mobile/dist-web' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  browser = await chromium.launch();
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { await browser?.close(); server?.kill(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

// screens underneath stay mounted (hidden), like iOS navigation, so only match what's on screen
const seen = (p, text) => p.locator(`text=${text} >> visible=true`).first();
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
async function signup(p, name, email) {
  await p.getByPlaceholder('Marcus Bell').fill(name);
  await p.getByPlaceholder('you@email.com').fill(email);
  await p.locator('input[type=password]').fill('kick-off-123');
  await p.getByRole('button', { name: 'Create account' }).click();
}

test('organizer and player use the app end to end', async () => {
  const errors = [];
  const org = await (await phone()).newPage(), ply = await (await phone()).newPage();
  for (const p of [org, ply]) p.on('pageerror', e => errors.push(e.message));

  await org.goto(BASE + '/');
  await org.getByRole('button', { name: 'Create a free account' }).click();
  await signup(org, 'Olivia Reyes', 'olivia@example.com');
  await org.getByText('Start your first group').waitFor();
  await org.getByRole('button', { name: 'Start a group' }).click();
  await org.getByPlaceholder('Tuesday Night Hoops').fill('Sunday Soccer');
  await org.getByRole('radio', { name: 'Soccer' }).click();
  await org.getByPlaceholder('Rucker Park, court 2').fill('Riverside Field');
  await org.getByRole('button', { name: 'Create group' }).click();
  await org.getByText('Invite your players').waitFor();
  await org.getByRole('button', { name: '+ Post a game' }).click();
  await org.getByRole('button', { name: 'Post game' }).click();
  await seen(org, 'You’re in ✅').waitFor();
  await seen(org, '📍 Riverside Field').waitFor();

  const group = await mongo.db(DB).collection('groups').findOne({ name: 'Sunday Soccer' });
  assert.equal((await mongo.db(DB).collection('games').countDocuments({ groupId: group._id })), 1);

  await ply.goto(`${BASE}/join/${group.invite}`);
  await ply.getByText('Sunday Soccer').first().waitFor();
  await ply.getByRole('button', { name: 'Sign up to join' }).click();
  await signup(ply, 'Marcus Bell', 'marcus@example.com');
  await ply.getByRole('button', { name: 'Join group' }).click();
  await seen(ply, 'Members 2').waitFor(); // on the group screen
  await ply.locator('text="Riverside Field" >> visible=true').first().click(); // the game card, not the group header
  await seen(ply, 'I’m in').waitFor();
  await ply.getByRole('radio', { name: 'I’m in' }).click();
  await seen(ply, 'You’re in ✅').waitFor();
  await ply.getByLabel('Message').fill('On my way ⚽');
  await ply.getByRole('button', { name: 'Send' }).click();
  await seen(ply, 'On my way ⚽').waitFor();

  await org.reload();
  await seen(org, 'Marcus Bell').waitFor();
  await seen(org, 'On my way ⚽').waitFor();
  await org.getByRole('button', { name: 'Make teams' }).click();
  await seen(org, 'Lights').waitFor();
  await seen(org, 'Darks').waitFor();

  // the app stores its token, not a cookie
  assert.equal((await ply.context().cookies()).length, 0);
  assert.ok(await ply.evaluate(() => !!localStorage.getItem('turnout.session')));
  assert.deepEqual(errors, []);
});
