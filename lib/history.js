// History: every game ESPN has a box score for (from 1993-94), stored the same way as tonight's games, so records,
// career highs, rarity ("first since") and historical search all come from real box scores. Run from GitHub Actions
// (scripts/backfill.mjs); safe to re-run — games already stored are skipped.
import { data } from './providers/index.js';
import { storeGame, USABLE } from './ingest.js';
import { pool, etDate } from './util.js';

export async function syncTeams(d) {
  const teams = await data.teams();
  for (const t of teams) await d.collection('teams').updateOne({ _id: t.id }, { $set: { ...t, id: t.id, updatedAt: new Date() } }, { upsert: true });
  return teams.length;
}

export async function backfillSeason(d, year, { log = console.log, concurrency = 8, until = etDate() } = {}) {
  const cal = await data.seasonDates(year);
  const dates = cal.dates.filter(x => x <= until);
  let stored = 0, skipped = 0, failed = 0, total = 0;
  const problems = [];
  await pool(dates, 3, async date => {
    const sb = await data.scoreboard(date).catch(e => { failed++; problems.push(`${date}: ${e.message}`); return null; });
    if (!sb) return;
    const finals = sb.games.filter(g => g.status === 'final');
    total += finals.length;
    const have = new Set((await d.collection('games').find({ _id: { $in: finals.map(g => g.id) }, 'verify.status': { $in: [...USABLE] } }, { projection: { _id: 1 } }).toArray()).map(g => g._id));
    await pool(finals.filter(g => !have.has(g.id)), Math.max(1, Math.floor(concurrency / 3)), async g => {
      try {
        const c = await data.game(g.id, { ttl: 0 });
        if (!c) { failed++; return; }
        // Historical games: consistency checks only (NBA.com's CDN covers the current season). Give-up timing doesn't
        // apply: a historical box score that fails the checks stays out.
        const r = await storeGame(d, c, { crossCheck: false, now: new Date(0) });
        if (r.stored) stored++; else { failed++; if (r.verify?.problems?.length) problems.push(`${g.id} ${c.game.teams.map(t => t.abbr).join('-')}: ${r.verify.problems.join('; ')}`); }
      } catch (e) { failed++; problems.push(`${g.id}: ${e.message}`); }
    });
    skipped += have.size;
  });
  const coverage = { year, dates: dates.length, finals: total, stored, skipped, failed, at: new Date() };
  await d.collection('meta').updateOne({ _id: `season:${year}` }, { $set: { ...coverage, problems: problems.slice(0, 50) } }, { upsert: true });
  log(`${year - 1}-${String(year % 100).padStart(2, '0')}: ${total} final games, ${stored} stored, ${skipped} already in, ${failed} not usable`);
  return coverage;
}

// Bios for every player in the database that hasn't been looked up.
export async function backfillBios(d, { log = console.log, concurrency = 10 } = {}) {
  const missing = await d.collection('players').find({ bioAt: { $exists: false } }, { projection: { _id: 1 } }).toArray();
  let n = 0;
  await pool(missing, concurrency, async p => {
    const a = await data.athlete(p._id).catch(() => null);
    await d.collection('players').updateOne({ _id: p._id }, { $set: { bioAt: new Date(), ...(a ? { dob: a.dob, country: a.country, birthPlace: a.birthPlace, debut: a.debut, ...(a.pos ? { pos: a.pos } : {}), height: a.height, weight: a.weight, college: a.college, draft: a.draft, active: a.active, first: a.first, last: a.last } : {}) } });
    if (++n % 500 === 0) log(`  bios: ${n}/${missing.length}`);
  });
  log(`bios: ${n} players`);
  return n;
}
