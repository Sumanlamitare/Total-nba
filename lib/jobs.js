// The automation. Runs every 15 minutes through the NBA evening (GitHub Actions, scripts/auto.mjs):
//   1. Today's and yesterday's games (Eastern Time dates; games ending after midnight belong to the day they started).
//   2. Each game's status; every final game's box score, once it passes the provider's checks (both teams, points adding
//      up to the score, minutes adding up to the game) — an incomplete response is never taken for a final game.
//   3. When every game of a date is final and verified (postponed, canceled and suspended games don't hold it up), the
//      date's default diagrams are generated: the night, and the season through that night. Unchanged data never
//      makes a duplicate.
//   4. Box scores of the last three days are fetched again every six hours; a correction makes a new version. A box
//      score still failing the checks two days on is left out of its night (noted as unverified) so the night publishes.
//   5. ESPN's own season figures (PER...) are refreshed once a day.
import { ingestDate, etDate, addDays, refreshSeasonFigures, seasonInfo } from './data.js';
import { ensureDefaults } from './diagrams.js';

export async function runAutomation(d, { log = console.log, now = new Date(), force = false } = {}) {
  const today = etDate(now), yesterday = addDays(today, -1);
  const out = [];
  for (const date of [yesterday, today]) out.push(await processDate(d, date, { log, force, now }));
  // Corrections: dates up to three days back, if their box scores are more than six hours old.
  for (const back of [2, 3]) {
    const date = addDays(today, -back);
    const stale = await d.collection('games').countDocuments({ date, status: 'final', fetchedAt: { $lt: new Date(now - 6 * 3600e3) } });
    if (stale) out.push(await processDate(d, date, { log, recheck: true, now }));
  }
  // Season figures, once a day, for the season in play.
  const season = out.find(x => x.day?.season)?.day.season;
  if (season) {
    for (const stype of [2, 3]) {
      const m = await d.collection('meta').findOne({ _id: `figs:${season}:${stype}` });
      const any = await d.collection('pgames').countDocuments({ season, stype }, { limit: 1 });
      if (any && (!m || m.at < new Date(now - 20 * 3600e3))) await refreshSeasonFigures(d, season, stype, { log });
    }
  }
  return out;
}

export async function processDate(d, date, { log = console.log, force = false, recheck = false, now = new Date() } = {}) {
  const day = await ingestDate(d, date, { force, recheck, log, now });
  const status = day.noGames ? 'no games' : day.complete ? 'complete' : `${day.pending} of ${day.games} games not final`;
  let made = null;
  if (day.complete) made = await ensureDefaults(d, date, day.season);
  log(`${date}: ${day.games} games, ${day.final} final${day.excluded.length ? `, ${day.excluded.map(x => x.status).join(', ')}` : ''} — ${status}${made ? ` · daily ${made.daily._id} (${made.daily.result.total} players)${made.season ? ` · season ${made.season._id}` : ''}` : ''}${day.problems?.length ? ` · not yet verified: ${day.problems.join(' | ')}` : ''}`);
  return { date, day, made };
}

// A whole season, date by date (backfill). Dates already complete are skipped unless force.
export async function backfillSeason(d, year, { log = console.log, force = false, until = etDate(), diagrams = true } = {}) {
  const info = await seasonInfo(d, year);
  let n = 0;
  for (const date of info.dates.filter(x => x <= until)) {
    const known = await d.collection('days').findOne({ _id: date });
    if (known?.complete && !force) {
      if (diagrams) await ensureDefaults(d, date, known.season);
      continue;
    }
    await processDate(d, date, { log: n % 15 ? () => {} : log, force }).catch(e => log(`${date}: ${e.message}`));
    n++;
  }
  for (const stype of [2, 3]) if (await d.collection('pgames').countDocuments({ season: year, stype }, { limit: 1 })) await refreshSeasonFigures(d, year, stype, { log });
  log(`${info.label}: ${info.dates.length} dates`);
}
