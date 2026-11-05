// Real-time delivery: Server-Sent Events. A connection lasts ~50 seconds (the function's limit); the browser's
// EventSource reconnects on its own and resumes from Last-Event-ID, so nothing is missed. While open it pushes every
// feed entry created or updated (published ones), every second. If the dedicated monitor isn't running (no tick
// for over a minute) and a game is live, a connection runs a quick tick itself, so the feed keeps moving.
import { db } from '../lib/db.js';
import { tick } from '../lib/automation.js';
import { publicMsg } from './feed.js';

export const config = { maxDuration: 60 };
const LIFETIME = (+process.env.ATN_STREAM_SECONDS || 50) * 1e3, POLL = +process.env.ATN_STREAM_POLL_MS || 1000;

async function maybeTick(d) {
  const now = new Date();
  const t = await d.collection('meta').findOne({ _id: 'tick' });
  if (t?.at && now - new Date(t.at) < 25e3) return;
  const live = await d.collection('games').countDocuments({ status: { $in: ['in', 'halftime', 'delayed'] }, start: { $gt: new Date(now - 6 * 3600e3) } }, { limit: 1 });
  const soon = await d.collection('games').countDocuments({ status: 'scheduled', start: { $lt: new Date(now.getTime() + 10 * 60e3), $gt: new Date(now - 3 * 3600e3) } }, { limit: 1 });
  if (!live && !soon) return;
  const lock = await d.collection('meta').findOneAndUpdate({ _id: 'tick-lock', at: { $lt: new Date(now - 15e3) } }, { $set: { at: now } }, { returnDocument: 'after' }).catch(() => null)
    || await d.collection('meta').insertOne({ _id: 'tick-lock', at: now }).then(() => true).catch(() => null);
  if (lock) await tick(d, { now, log: () => {}, light: true }).catch(() => {});
}

export default async function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-store, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
  let closed = false;
  req.on('close', () => { closed = true; });
  const send = (event, data, id) => { if (!closed) res.write(`${id != null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const d = await db();
    const q = new URL(req.url, 'http://x').searchParams;
    let seq = parseInt(req.headers['last-event-id'] || q.get('seq') || '0', 10) || 0;
    if (!seq) seq = (await d.collection('meta').findOne({ _id: 'feedseq' }))?.n || 0;
    res.write(`retry: 3000\n\n`);
    send('hello', { seq, at: new Date() });
    const start = Date.now();
    let ticked = 0;
    while (!closed && Date.now() - start < LIFETIME) {
      // Every change, published or not: a page drops an entry that comes back unpublished (held, withdrawn).
      // Chat messages share the sequence: one cursor resumes both.
      const [items, chat] = await Promise.all([
        d.collection('feed').find({ seq: { $gt: seq } }).sort({ seq: 1 }).limit(25).toArray(),
        d.collection('comments').find({ seq: { $gt: seq } }).sort({ seq: 1 }).limit(50).toArray(),
      ]);
      const top = Math.min(items.length === 25 ? items.at(-1).seq : Infinity, chat.length === 50 ? chat.at(-1).seq : Infinity);
      const out = [...items.map(x => ['entry', x]), ...chat.map(x => ['chat', publicMsg(x)])].filter(([, x]) => x.seq <= top).sort((a, b) => a[1].seq - b[1].seq);
      for (const [kind, x] of out) { seq = x.seq; send(kind, x, x.seq); }
      if (!out.length) res.write(`: ping\n\n`);
      if (Date.now() - ticked > 20e3 && Date.now() - start > 3e3) { ticked = Date.now(); await maybeTick(d); }
      await new Promise(r => setTimeout(r, POLL));
    }
    send('bye', { seq }, seq);
  } catch (e) {
    send('error', { message: 'stream interrupted' });
  }
  res.end();
}
