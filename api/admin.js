// Accounts (setup, sign up, sign in, roles), each person's preferences, site settings (detection, feed, AI, graphics),
// integrations and data-source status, the automation log, and "run the monitor now".
import { db } from '../lib/db.js';
import { route, actions, fail, int, str } from '../lib/http.js';
import { currentUser, requireUser, setupNeeded, setup, signup, login, logout, invite, changePassword, ROLES } from '../lib/auth.js';
import { getSettings, saveSettings, DEFAULTS } from '../lib/settings.js';
import { credentialStatus, saveCredential, CREDENTIALS } from '../lib/secrets.js';
import { sourceStatus } from '../lib/providers/index.js';
import { tick } from '../lib/automation.js';
import { CATEGORIES } from '../lib/feed.js';

export const config = { maxDuration: 60 };

const cleanPrefs = p => ({
  teams: Array.isArray(p?.teams) ? p.teams.map(x => str(String(x), 4)).filter(Boolean).slice(0, 30) : [],
  players: Array.isArray(p?.players) ? p.players.map(x => str(String(x), 20)).filter(Boolean).slice(0, 60) : [],
  categories: Array.isArray(p?.categories) ? p.categories.filter(c => CATEGORIES[c]) : [],
  minLevel: ['low', 'medium', 'high', 'critical'].includes(p?.minLevel) ? p.minLevel : 'medium',
  notify: { critical: !!p?.notify?.critical, favorites: !!p?.notify?.favorites, browser: !!p?.notify?.browser },
});

export default route({
  GET: actions({
    async me({ req }) {
      const d = await db();
      return { user: await currentUser(d, req), setupNeeded: await setupNeeded(d) };
    },
    async settings({ req }) {
      const d = await db(); await requireUser(d, req, 'editor');
      return { settings: await getSettings(d), defaults: DEFAULTS, categories: CATEGORIES };
    },
    async integrations({ req }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const status = await credentialStatus(d);
      return { credentials: Object.fromEntries(Object.entries(CREDENTIALS).map(([k, v]) => [k, { label: v.label, fields: v.fields, env: v.env, ...status[k] }])), sources: sourceStatus() };
    },
    async users({ req }) {
      const d = await db(); await requireUser(d, req, 'owner');
      return d.collection('users').find({}, { projection: { password: 0 } }).sort({ createdAt: 1 }).limit(500).toArray();
    },
    async log({ req, query }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const q = query.level ? { level: str(query.level, 10) } : {};
      const [entries, last] = await Promise.all([d.collection('log').find(q).sort({ at: -1 }).limit(int(query.limit, 100, 1, 300)).toArray(), d.collection('meta').findOne({ _id: 'tick' })]);
      return { entries, lastTick: last };
    },
    async status() {
      const d = await db();
      const [t, rec, monitor] = await Promise.all([d.collection('meta').findOne({ _id: 'tick' }), d.collection('meta').findOne({ _id: 'records' }), d.collection('meta').findOne({ _id: 'monitor' })]);
      return { lastTick: t?.at || null, summary: t?.summary || null, records: rec?.coverage || null, monitor: monitor || null };
    },
  }),
  POST: actions({
    async setup({ res, body }) { const d = await db(); return { user: await setup(d, res, body) }; },
    async signup({ res, body }) { const d = await db(); return { user: await signup(d, res, body) }; },
    async login({ res, body }) { const d = await db(); return { user: await login(d, res, body) }; },
    async logout({ req, res }) { const d = await db(); await logout(d, req, res); return { ok: true }; },
    async password({ req, body }) { const d = await db(); const u = await requireUser(d, req); await changePassword(d, u, body); return { ok: true, signedOut: true }; },
    async prefs({ req, body }) {
      const d = await db(); const u = await requireUser(d, req);
      const prefs = cleanPrefs(body.prefs);
      await d.collection('users').updateOne({ _id: u._id }, { $set: { prefs } });
      return { prefs };
    },
    async invite({ req, body }) { const d = await db(); await requireUser(d, req, 'owner'); return invite(d, body); },
    async user({ req, body }) {
      const d = await db(); const me = await requireUser(d, req, 'owner');
      if (body.id === me._id) fail(400, 'You cannot change your own account here');
      const set = {};
      if (ROLES.includes(body.role) && body.role !== 'owner') set.role = body.role;
      if (typeof body.disabled === 'boolean') set.disabled = body.disabled;
      await d.collection('users').updateOne({ _id: str(body.id, 60) }, { $set: set });
      if (set.disabled) await d.collection('sessions').deleteMany({ uid: str(body.id, 60) });
      return { ok: true };
    },
    async settings({ req, body }) { const d = await db(); const u = await requireUser(d, req, 'owner'); return { settings: await saveSettings(d, body.settings || {}, u) }; },
    async credential({ req, body }) {
      const d = await db(); const u = await requireUser(d, req, 'owner');
      await saveCredential(d, str(body.id, 20), body.values === null ? null : body.values || {}, u);
      return { ok: true };
    },
    // Run the monitor now. At most once per 45 seconds across everyone.
    async tick({ req }) {
      const d = await db(); await requireUser(d, req, 'editor');
      const now = new Date();
      const lock = await d.collection('meta').findOneAndUpdate({ _id: 'tick-lock', at: { $lt: new Date(now - 45e3) } }, { $set: { at: now } }, { returnDocument: 'after' }).catch(() => null)
        || await d.collection('meta').insertOne({ _id: 'tick-lock', at: now }).then(() => true).catch(() => null);
      if (!lock) return { skipped: true, lastTick: await d.collection('meta').findOne({ _id: 'tick' }) };
      return { summary: await tick(d, { now, log: () => {} }), at: now };
    },
  }),
});
