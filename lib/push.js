// Push notifications to the mobile app through Expo's push service (free, no key needed).
// Best effort: a failed push never fails the request that caused it.
import { db } from './db.js';

const PUSH_URL = () => process.env.PUSH_URL || 'https://exp.host/--/api/v2/push/send';
export const isPushToken = t => typeof t === 'string' && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(t);

const fmt = (date, tz) => {
  const o = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try { return new Date(date).toLocaleString('en-US', { ...o, timeZone: tz || 'UTC' }); } catch { return new Date(date).toLocaleString('en-US', { ...o, timeZone: 'UTC' }); }
};

// userIds: string ids. message: { title, body(when) => string | string, url } — body can use the device's time zone.
export async function notify(userIds, { title, body, url }) {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return 0;
  try {
    const devices = await (await db()).collection('devices').find({ userId: { $in: ids } }).toArray();
    if (!devices.length) return 0;
    const messages = devices.map(d => ({ to: d.token, title, body: typeof body === 'function' ? body(date => fmt(date, d.tz)) : body, sound: 'default', data: { url } }));
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const r = await fetch(PUSH_URL(), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(chunk), signal: AbortSignal.timeout(5000) });
      const out = await r.json().catch(() => ({}));
      const dead = (out.data || []).map((t, k) => (t?.details?.error === 'DeviceNotRegistered' ? chunk[k].to : null)).filter(Boolean);
      if (dead.length) await (await db()).collection('devices').deleteMany({ token: { $in: dead } });
      sent += chunk.length - dead.length;
    }
    return sent;
  } catch (e) { console.error('push failed', e.message); return 0; }
}

