// Alert delivery to a user's channels: generic webhook, Slack, Discord, and ntfy (free phone push).
import { db } from './db.js';
import { human } from './time.js';

export const KINDS = {
  slack: { name: 'Slack', help: 'Incoming webhook URL from Slack (https://hooks.slack.com/…)' },
  discord: { name: 'Discord', help: 'Channel webhook URL from Discord (Server settings → Integrations → Webhooks)' },
  ntfy: { name: 'Phone push (ntfy)', help: 'Install the free ntfy app, subscribe to a hard-to-guess topic, and enter it here' },
  webhook: { name: 'Webhook', help: 'We POST JSON to this URL on every status change' },
};

export function message(check, event, origin) {
  const link = origin ? `${origin}/app/checks/${check._id}` : '';
  const ago = check.lastPing ? human((Date.now() - new Date(check.lastPing)) / 1000) + ' ago' : 'never';
  const title = event === 'down' ? `🔴 ${check.name} is DOWN` : event === 'up' ? `🟢 ${check.name} is back up` : `🔔 Test alert for ${check.name}`;
  const why = event === 'down'
    ? (check.lastKind === 'fail' ? 'The job reported a failure.' : `No ping received — expected every ${human(check.period)}. Last ping: ${ago}.`)
    : event === 'up' ? 'Pings are arriving again.' : 'This is a test from Nightjar. Your alerts are working.';
  return { title, text: `${title}\n${why}${link ? `\n${link}` : ''}`, why, link };
}

async function deliver(ch, msg, check, event) {
  const opts = { method: 'POST', signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/json', 'user-agent': 'Nightjar-Alerts/1.0' } };
  let url = ch.target, body;
  if (ch.kind === 'slack') body = JSON.stringify({ text: msg.text });
  else if (ch.kind === 'discord') body = JSON.stringify({ content: msg.text.slice(0, 1900) });
  else if (ch.kind === 'ntfy') {
    url = `https://ntfy.sh/${encodeURIComponent(ch.target)}`;
    opts.headers = { 'user-agent': 'Nightjar-Alerts/1.0', Title: `${check.name} is ${event === 'down' ? 'DOWN' : event === 'up' ? 'back up' : 'testing alerts'}`.replace(/[^\x20-\x7E]/g, '') || 'Nightjar alert', Priority: event === 'down' ? 'high' : 'default', Tags: event === 'down' ? 'red_circle' : 'green_circle', ...(msg.link ? { Click: msg.link } : {}) };
    body = `${msg.why}`;
  } else body = JSON.stringify({ event, check: { id: String(check._id), name: check.name, status: event === 'test' ? check.status : event, lastPing: check.lastPing || null, period: check.period, grace: check.grace }, message: msg.text, at: new Date().toISOString() });
  const r = await fetch(url, { ...opts, body });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

// Sends to every channel of the check's owner; records the outcome on each channel. Never throws.
export async function alert(check, event, onlyChannel = null) {
  const d = await db();
  const user = await d.collection('users').findOne({ _id: check.userId }, { projection: { origin: 1 } });
  const chans = onlyChannel ? [onlyChannel] : await d.collection('channels').find({ userId: check.userId }).toArray();
  const msg = message(check, event, user?.origin);
  const results = await Promise.all(chans.map(async ch => {
    try { await deliver(ch, msg, check, event); return { id: ch._id, ok: true }; }
    catch (e) { return { id: ch._id, ok: false, error: e.name === 'TimeoutError' ? 'Timed out' : e.message }; }
  }));
  await Promise.all(results.map(r => d.collection('channels').updateOne({ _id: r.id }, { $set: { lastAt: new Date(), lastOk: r.ok, lastError: r.error || null } })));
  if (event !== 'test') await d.collection('checks').updateOne({ _id: check._id }, { $push: { alerts: { $each: [{ at: new Date(), event, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }], $slice: -30 } } });
  return results;
}
