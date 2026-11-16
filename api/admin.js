// Account, settings, competitions, the job log and status.
import { db } from '../lib/db.js';
import { route, actions, fail, int } from '../lib/http.js';
import { currentUser, requireUser, setupNeeded, setup, login, logout, changePassword, invite } from '../lib/auth.js';
import { getSettings, saveSettings, DEFAULTS } from '../lib/settings.js';
import { competitions, saveCompetitions, DEFAULT_COMPETITIONS, GROUPS } from '../lib/competitions.js';
import { jobStatus } from './matches.js';
import { plan } from '../lib/cleanup.js';

export default route({
  GET: actions({
    async me({ req }) {
      const d = await db();
      return { user: await currentUser(d, req), setupNeeded: await setupNeeded(d) };
    },
    async settings({ req }) {
      const d = await db(); await requireUser(d, req);
      return { settings: await getSettings(d), defaults: DEFAULTS, competitions: await competitions(d), defaultCompetitions: DEFAULT_COMPETITIONS, groups: GROUPS };
    },
    async log({ req, query }) {
      const d = await db(); await requireUser(d, req);
      return d.collection('log').find({}).sort({ at: -1 }).limit(int(query.limit, 100, 1, 300)).toArray();
    },
    async status({ req }) {
      const d = await db(); await requireUser(d, req);
      const [matches, graphics, logos, processed] = await Promise.all(['matches', 'graphics', 'logos', 'processed'].map(c => d.collection(c).estimatedDocumentCount()));
      return { jobs: await jobStatus(d), cleanup: await plan(d), counts: { matches, graphics, logos, processed } };
    },
  }),
  POST: actions({
    async setup({ req, res, body }) { const d = await db(); return { user: await setup(d, res, body) }; },
    async login({ res, body }) { const d = await db(); return { user: await login(d, res, body) }; },
    async logout({ req, res }) { const d = await db(); await logout(d, req, res); return { ok: true }; },
    async password({ req, body }) { const d = await db(); const u = await requireUser(d, req); await changePassword(d, u, body); return { ok: true }; },
    async invite({ req, body }) { const d = await db(); await requireUser(d, req, 'owner'); return invite(d, { ...body, role: 'editor' }); },
    async settings({ req, body }) {
      const d = await db(); await requireUser(d, req, 'owner');
      try { return { settings: await saveSettings(d, body.settings || {}) }; } catch (e) { fail(e.status || 400, e.message); }
    },
    async competitions({ req, body }) {
      const d = await db(); await requireUser(d, req, 'owner');
      try { return { competitions: await saveCompetitions(d, body.list) }; } catch (e) { fail(e.status || 400, e.message); }
    },
  }),
});
