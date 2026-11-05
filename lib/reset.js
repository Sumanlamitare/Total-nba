// The daily cycle. The feed is about today's games: one hour before the first tip-off of a new game day, everything
// from the previous day is deleted. What stays is small and permanent:
//   teams, players (bios), highs (career highs, one row per player), records (the record book), marks (season marks
//   such as the biggest comeback tracked), refrecords, settings, users, sessions, secrets, templates, uploads.
// Everything else — feed, comments, reactions, games, pgames, performances, events, graphics, careers, the context
// cache, the log beyond three days — belongs to one day.
import { data } from './providers/index.js';
import { etDate } from './util.js';

export const DAILY = ['feed', 'comments', 'reactions', 'games', 'pgames', 'performances', 'events', 'content', 'careers', 'ctx', 'notifications'];
const RESET_BEFORE = 60 * 60e3; // one hour before the first game

// The game day the feed is showing: today once today's reset has run, otherwise the previous one.
export async function slate(d) {
  const m = await d.collection('meta').findOne({ _id: 'slate' });
  return m?.date || null;
}

// Run the reset if it's due. Returns { reset, date } — reset is true when data was deleted now.
export async function maybeReset(d, { now = new Date(), log = () => {} } = {}) {
  const today = etDate(now);
  const cur = await d.collection('meta').findOne({ _id: 'slate' });
  if (cur?.date === today) return { reset: false, date: today };
  const sb = await data.scoreboard(today).catch(() => null);
  const starts = (sb?.games || []).map(g => g.start && new Date(g.start)).filter(Boolean).sort((a, b) => a - b);
  if (!starts.length) return { reset: false, date: cur?.date || null }; // no games today: keep showing the last game day
  if (now < new Date(starts[0] - RESET_BEFORE)) return { reset: false, date: cur?.date || null };
  // Claim the reset (only one process does it).
  const claimed = await d.collection('meta').updateOne({ _id: 'slate', date: { $ne: today } }, { $set: { date: today, resetAt: now, firstTip: starts[0] } }, { upsert: true }).catch(e => (e.code === 11000 ? null : Promise.reject(e)));
  if (!claimed || (!claimed.modifiedCount && !claimed.upsertedCount)) return { reset: false, date: today };
  const counts = {};
  for (const c of DAILY) counts[c] = (await d.collection(c).deleteMany({})).deletedCount;
  await d.collection('meta').deleteMany({ _id: { $regex: '^(potn:|login:|signup:|comment:)' } });
  await d.collection('log').deleteMany({ at: { $lt: new Date(now - 3 * 86400e3) } });
  log(`Daily reset for ${today}: ${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to delete'}`);
  return { reset: true, date: today, counts };
}
