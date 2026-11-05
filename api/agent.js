// For an automated publisher (an AI agent running X and TikTok accounts): today's postable stories with everything
// needed to post them — headline, text (data-driven, plus the AI-written version when there is one), whether the facts
// are confirmed or still developing, sources, and ready-made images in each size (rendered on demand: 16:9 for X,
// 9:16 for TikTok/Reels/Stories). The agent records what it posted, so a story is never posted twice.
//   GET  /api/agent?action=today[&since=ISO][&level=high][&confirmed=1][&unposted=x]
//   POST /api/agent?action=posted  { id, platform, url, postId }   (Authorization: Bearer <agent key>)
//   GET  /api/agent?action=guide
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { route, actions, fail, str } from '../lib/http.js';
import { slate } from '../lib/reset.js';
import { CATEGORIES } from '../lib/feed.js';

const LEVELS = ['low', 'medium', 'high', 'critical'];
const base = req => `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

async function checkKey(d, req) {
  const key = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!key) fail(401, 'Send the agent key: Authorization: Bearer <key> (create it in Settings → Data & AI)');
  const doc = await d.collection('secrets').findOne({ _id: 'agentkey' });
  const ok = doc?.hash && crypto.timingSafeEqual(Buffer.from(doc.hash), Buffer.from(crypto.createHash('sha256').update(`atn-agent:${key}`).digest('hex')));
  if (!ok) fail(403, 'Wrong agent key');
}

export default route({
  GET: actions({
    async today({ req, query }) {
      const d = await db();
      const date = await slate(d);
      const q = { published: true, ...(date ? { 'game.date': { $gte: date } } : {}) };
      if (query.since) q.updatedAt = { $gt: new Date(String(query.since)) };
      if (LEVELS.includes(query.level)) q.level = { $in: LEVELS.slice(LEVELS.indexOf(query.level)) };
      if (query.confirmed === '1') q.status = { $in: ['final', 'confirmed'] };
      if (['x', 'tiktok'].includes(query.unposted)) q[`posted.${query.unposted}`] = { $exists: false };
      const items = await d.collection('feed').find(q).sort({ sortAt: -1 }).limit(100).toArray();
      const b = base(req);
      const img = (id, format) => `${b}/api/graphics?action=feed&id=${encodeURIComponent(id)}&format=${format}&f=jpeg`;
      return {
        date, generatedAt: new Date(),
        entries: items.map(e => ({
          id: e._id, link: `${b}/e/${encodeURIComponent(e._id)}`, category: e.category, categoryLabel: CATEGORIES[e.category]?.label, level: e.level, significance: e.significance,
          status: e.status, confirmed: ['final', 'confirmed'].includes(e.status), developing: e.status === 'developing', verification: e.verification?.status,
          title: e.title || e.headline, label: e.headline, headline: e.headline, text: e.body, aiText: e.aiBody || null, stats: e.stats, players: e.players, team: e.team ? { id: e.team.id, name: e.team.name, abbr: e.team.abbr } : null,
          game: { id: e.game?.id, teams: e.game?.teams?.map(t => ({ abbr: t.abbr, score: t.score })), moment: e.game?.moment || e.game?.label, playoffs: e.game?.stype === 3 },
          occurredAt: e.occurredAt, updatedAt: e.updatedAt, sources: e.sources, graphicSuggested: !!e.graphicable,
          images: { x: img(e._id, 'x_landscape'), square: img(e._id, 'x_square'), portrait: img(e._id, 'ig_portrait'), story: img(e._id, 'ig_story') },
          posted: e.posted || {},
        })),
      };
    },
    async guide() {
      return {
        about: 'Around the NBA, agent interface. One game day at a time; data older than the current game day is deleted an hour before the next day\'s first game.',
        steps: [
          'Poll GET /api/agent?action=today&unposted=x&level=high every minute or two during games (or follow /api/stream, Server-Sent Events).',
          'Post only entries with confirmed=true as facts. Entries with developing=true are live situations (a run, a close game, a comeback in progress): say so in the post.',
          'Use text (data-driven) or aiText (AI-written from the same facts, when present). Never add numbers that are not in the entry.',
          'Images: images.x (1600x900) for X; images.story (1080x1920) for TikTok, Reels, Stories. JPEG, rendered from the entry\'s data.',
          'After posting, POST /api/agent?action=posted with {id, platform: "x"|"tiktok", url, postId} and Authorization: Bearer <agent key>.',
        ],
      };
    },
  }),
  POST: actions({
    async posted({ req, body }) {
      const d = await db();
      await checkKey(d, req);
      const platform = ['x', 'tiktok', 'instagram', 'threads', 'youtube'].includes(body.platform) ? body.platform : fail(400, 'Unknown platform');
      const r = await d.collection('feed').updateOne({ _id: str(body.id, 160) }, { $set: { [`posted.${platform}`]: { url: str(body.url, 400) || null, postId: str(body.postId, 120) || null, at: new Date() } } });
      if (!r.matchedCount) fail(404, 'No such event');
      return { ok: true };
    },
  }),
});
