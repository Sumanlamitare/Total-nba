// Settings, competitions, the job log and status. (A personal tool: no accounts or sign-in.)
import { db } from '../lib/db.js';
import { route, actions, fail, int } from '../lib/http.js';
import { getSettings, saveSettings, DEFAULTS } from '../lib/settings.js';
import { competitions, saveCompetitions, DEFAULT_COMPETITIONS, GROUPS } from '../lib/competitions.js';
import { jobStatus } from './matches.js';
import { plan } from '../lib/cleanup.js';

export default route({
  GET: actions({
    async settings({}) {
      const d = await db();
      return { settings: await getSettings(d), defaults: DEFAULTS, competitions: await competitions(d), defaultCompetitions: DEFAULT_COMPETITIONS, groups: GROUPS };
    },
    async log({ req, query }) {
      const d = await db();
      return d.collection('log').find({}).sort({ at: -1 }).limit(int(query.limit, 100, 1, 300)).toArray();
    },
    async status({}) {
      const d = await db();
      const [matches, graphics, logos, processed] = await Promise.all(['matches', 'graphics', 'logos', 'processed'].map(c => d.collection(c).estimatedDocumentCount()));
      return { jobs: await jobStatus(d), cleanup: await plan(d), counts: { matches, graphics, logos, processed } };
    },
  }),
  POST: actions({
    async settings({ body }) {
      const d = await db();
      try { return { settings: await saveSettings(d, body.settings || {}) }; } catch (e) { fail(e.status || 400, e.message); }
    },
    async competitions({ body }) {
      const d = await db();
      try { return { competitions: await saveCompetitions(d, body.list) }; } catch (e) { fail(e.status || 400, e.message); }
    },
  }),
});
