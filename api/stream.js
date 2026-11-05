// Real-time delivery: Server-Sent Events. A connection lasts ~50 seconds (the function's limit); the browser's
// EventSource reconnects on its own and resumes from Last-Event-ID, so nothing is missed. While open it pushes every
// feed entry created or updated (published ones), every few seconds. If the dedicated monitor isn't running (no tick
// for over a minute) and a game is live, a connection runs a quick tick itself, so the feed keeps moving.
import { db } from '../lib/db.js';
import { tick } from '../lib/automation.js';

export const config = { maxDuration: 60 };
const LIFETIME = (+process.env.ATN_STREAM_SECONDS || 50) * 1e3, POLL = +process.env.ATN_STREAM_POLL_MS || 2500;

async function maybeTick(d) {
  const now = new Date();
  const t = await d.collection('meta').findOne({ _id: 'tick' });
  if (t?.at && now - new Date(t.at) < 60e3) return;
  const live = await d.collection('games').countDocuments({ status: { $in: ['in', 'halftime', 'delayed'] }, start: { $gt: new Date(now - 6 * 3600e3) } }, { limit: 1 });
  const soon = await d.collection('games').countDocuments({ status: 'scheduled', start: { $lt: new Date(now.getTime() + 10 * 60e3), $gt: new Date(now - 3 * 3600e3) } }, { limit: 1 });
  if (!live && !soon) return;
  const lock = await d.collection('meta').findOneAndUpdate({ _id: 'tick-lock', at: { $lt: new Date(now - 45e3) } }, { $set: { at: now } }, { returnDocument: 'after' }).catch(() => null)
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
    let ticked = false;
    while (!closed && Date.now() - start < LIFETIME) {
      const items = await d.collection('feed').find({ seq: { $gt: seq }, published: true }).sort({ seq: 1 }).limit(25).toArray();
      for (const e of items) { seq = e.seq; send('entry', e, e.seq); }
      if (!items.length) {
        // Unpublished changes still move the cursor.
        const top = await d.collection('meta').findOne({ _id: 'feedseq' });
        if (top?.n > seq && !(await d.collection('feed').countDocuments({ seq: { $gt: seq }, published: true }, { limit: 1 }))) seq = top.n;
        res.write(`: ping\n\n`);
      }
      if (!ticked && Date.now() - start > 5e3) { ticked = true; await maybeTick(d); }
      await new Promise(r => setTimeout(r, POLL));
    }
    send('bye', { seq }, seq);
  } catch (e) {
    send('error', { message: 'stream interrupted' });
  }
  res.end();
}
