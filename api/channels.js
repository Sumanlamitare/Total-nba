// GET    /api/channels                  -> { channels, kinds }
// POST   /api/channels {kind, name, target}
// POST   /api/channels?id=&action=test
// DELETE /api/channels?id=
import { ObjectId } from 'mongodb';
import { db } from '../lib/db.js';
import { route, fail, str } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { planOf } from '../lib/plans.js';
import { KINDS, alert } from '../lib/alerts.js';
import { checkUrl } from '../lib/net.js';

const show = ch => ({ id: String(ch._id), kind: ch.kind, name: ch.name, target: ch.kind === 'ntfy' ? ch.target : mask(ch.target),
  lastAt: ch.lastAt || null, lastOk: ch.lastOk ?? null, lastError: ch.lastError || null, createdAt: ch.createdAt });
// webhook URLs are secrets; show only enough to recognise them
const mask = u => { try { const x = new URL(u); return `${x.host}${x.pathname.length > 12 ? x.pathname.slice(0, 10) + '…' : x.pathname}`; } catch { return '…'; } };

async function own(user, id) {
  if (!ObjectId.isValid(id || '')) fail(404, 'Channel not found');
  return (await (await db()).collection('channels').findOne({ _id: new ObjectId(id), userId: user._id })) || fail(404, 'Channel not found');
}

export default route({
  async GET({ req }) {
    const user = await requireUser(req);
    const list = await (await db()).collection('channels').find({ userId: user._id }).sort({ createdAt: 1 }).toArray();
    return { channels: list.map(show), kinds: KINDS };
  },
  async POST({ req, query, body }) {
    const user = await requireUser(req), col = (await db()).collection('channels');
    if (query.id) {
      const ch = await own(user, query.id);
      if (query.action !== 'test') fail(400, 'Unknown action');
      const sample = { _id: new ObjectId(), userId: user._id, name: 'Example job', status: 'up', period: 86400, grace: 3600, lastPing: new Date() };
      const [r] = await alert(sample, 'test', ch);
      return { ok: r.ok, error: r.error || null };
    }
    const kind = str(body.kind, 20);
    if (!KINDS[kind]) fail(400, 'Pick a channel type');
    let target = str(body.target, 500);
    if (kind === 'ntfy') {
      target = target.replace(/^https:\/\/ntfy\.sh\//, '');
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(target)) fail(400, 'Use a topic of 6–64 letters, numbers, dashes or underscores (hard to guess is best)');
    } else {
      const bad = process.env.NIGHTJAR_ALLOW_HTTP === '1' && /^http:\/\/(127\.0\.0\.1|localhost)/.test(target) ? null : checkUrl(target);
      if (bad) fail(400, bad);
      if (kind === 'slack' && !/^https:\/\/hooks\.slack\.com\//.test(target)) fail(400, 'Slack webhook URLs start with https://hooks.slack.com/');
      if (kind === 'discord' && !/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(target)) fail(400, 'Discord webhook URLs look like https://discord.com/api/webhooks/…');
    }
    const plan = planOf(user);
    if ((await col.countDocuments({ userId: user._id })) >= plan.channels) fail(402, `Your plan allows ${plan.channels} alert channels.`);
    const ch = { userId: user._id, kind, name: str(body.name, 60) || KINDS[kind].name, target, createdAt: new Date() };
    ch._id = (await col.insertOne(ch)).insertedId;
    return { channel: show(ch) };
  },
  async DELETE({ req, query }) {
    const user = await requireUser(req), ch = await own(user, query.id);
    await (await db()).collection('channels').deleteOne({ _id: ch._id });
    return { ok: true };
  },
});
