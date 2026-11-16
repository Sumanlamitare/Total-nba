// App settings (one document). Everything the jobs and the graphic depend on that you may want to change.
import { validZone } from './tz.js';

export const DEFAULTS = {
  timezone: 'America/New_York',         // the app's calendar: "today", "tomorrow", the cleanup schedule
  cleanup: {
    auto: true,
    beforeFirstKickoffMin: 60,          // cleanup runs this long before the next day's first kickoff
    fallbackTime: '06:00',              // …or at this local time when the next day has no matches
    deletePostponedAfterHours: 12,      // postponed / cancelled / abandoned matches whose kickoff is this far past go too
  },
  graphics: {
    retentionDays: 30,                  // generated graphics are kept this long (0 = until deleted by hand)
    accent: '#d7ff3c',                  // brand accent on the graphic
    handle: '@footballpast90',
    showDate: true,
    useTeamColors: true,                // a thin team-colour rule under each crest
    playerOfGame: true,                 // name a Player of the Game (picked from the goals) on the graphic
    espnPhotos: false,                  // use ESPN's match highlight still as the photo when there is one (rights!)
  },
  polling: {
    liveEverySec: 60,                   // scoreboard check per competition while one of its matches is on
    syncEveryMin: 180,                  // full schedule refresh (today, tomorrow, the day after)
    preKickoffMin: 10,                  // start watching a match this long before kickoff
  },
};

const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };

export async function getSettings(d) {
  const s = await d.collection('settings').findOne({ _id: 'app' });
  return merge(DEFAULTS, s?.values || {});
}

export async function saveSettings(d, patch) {
  const cur = await getSettings(d);
  const next = merge(cur, patch);
  if (!validZone(next.timezone)) throw Object.assign(new Error('Unknown time zone'), { status: 400 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.cleanup.fallbackTime)) throw Object.assign(new Error('Fallback time must be HH:MM'), { status: 400 });
  next.cleanup.beforeFirstKickoffMin = Math.min(600, Math.max(0, Math.round(+next.cleanup.beforeFirstKickoffMin || 0)));
  next.cleanup.deletePostponedAfterHours = Math.min(240, Math.max(1, Math.round(+next.cleanup.deletePostponedAfterHours || 12)));
  next.graphics.retentionDays = Math.min(365, Math.max(0, Math.round(+next.graphics.retentionDays || 0)));
  if (!/^#[0-9a-f]{6}$/i.test(next.graphics.accent)) next.graphics.accent = DEFAULTS.graphics.accent;
  next.graphics.handle = String(next.graphics.handle || '').slice(0, 40);
  next.polling.liveEverySec = Math.min(300, Math.max(30, Math.round(+next.polling.liveEverySec || 60)));
  next.polling.syncEveryMin = Math.min(720, Math.max(30, Math.round(+next.polling.syncEveryMin || 180)));
  next.polling.preKickoffMin = Math.min(60, Math.max(0, Math.round(+next.polling.preKickoffMin || 10)));
  await d.collection('settings').updateOne({ _id: 'app' }, { $set: { values: next, updatedAt: new Date() } }, { upsert: true });
  return next;
}
