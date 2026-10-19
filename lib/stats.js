// Parsing ESPN's career statistics (athletes/{id}/stats) into season rows. Nothing here is invented: a missing
// field stays missing.
const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;

const num = v => {
  if (v == null || v === '' || v === '-' || v === '--') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ESPN packs "made-attempted" pairs into one column ("9.8-19.4"); split them into two named fields.
export function statRow(names, values) {
  const out = {};
  names.forEach((name, i) => {
    const v = values?.[i];
    if (name.includes('-')) {
      const [a, b] = name.split('-'); const [x, y] = String(v ?? '').split('-');
      out[a] = num(x); out[b] = num(y);
    } else out[name] = num(v);
  });
  return out;
}

// ESPN fills stats the league did not record yet with zeros (steals before 1973-74, threes before 1979-80…) and
// sometimes has no rebounding for whole careers. A zero there is "not recorded", not zero, so it becomes null.
const SINCE = {
  avgSteals: 1974, steals: 1974, avgBlocks: 1974, blocks: 1974,
  avgOffensiveRebounds: 1974, avgDefensiveRebounds: 1974, offensiveRebounds: 1974, defensiveRebounds: 1974,
  avgTurnovers: 1978, turnovers: 1978, assistTurnoverRatio: 1978, stealTurnoverRatio: 1978,
  avgThreePointFieldGoalsMade: 1980, avgThreePointFieldGoalsAttempted: 1980, threePointFieldGoalPct: 1980,
  threePointFieldGoalsMade: 1980, threePointFieldGoalsAttempted: 1980, gamesStarted: 1982,
};
const ALWAYS_COUNTED = ['avgRebounds', 'totalRebounds', 'avgMinutes', 'avgAssists', 'assists'];
export function scrub(row, season, games) {
  if (!row) return row;
  for (const k of Object.keys(row)) {
    if (row[k] !== 0) continue;
    if (SINCE[k] && season < SINCE[k]) row[k] = null;
    else if (ALWAYS_COUNTED.includes(k) && games >= 5) row[k] = null;
  }
  return row;
}

// Parse an athletes/{id}/stats response into seasons (one row per team stint, plus combined rows for traded
// seasons) and career lines. Returns null when ESPN has no stats for the player.
export function parseStats(json) {
  const cats = Object.fromEntries((json?.categories || []).map(c => [c.name, c]));
  const base = cats.averages || cats.totals;
  if (!base?.statistics?.length) return null;
  const teams = json.teams || {};
  const rows = base.statistics.map((s, i) => {
    const slug = s.teamSlug || '';
    const combined = /totals/i.test(slug) || (!s.teamId && /total/i.test(slug));
    const t = teams[slug];
    const year = s.season?.year ?? null;
    const avg = cats.averages ? statRow(cats.averages.names, cats.averages.statistics[i]?.stats) : null;
    const games = avg?.gamesPlayed || 0;
    return {
      season: year,
      label: year ? seasonLabel(year) : s.season?.displayName || '',
      team: combined ? null : (t?.abbreviation || null),
      teamId: combined ? null : (String(s.teamId || t?.id || '') || null),
      teamName: combined ? null : (t?.displayName || null),
      combined,
      pos: s.position && s.position !== 'NA' ? s.position : null,
      avg: scrub(avg, year, games),
      tot: scrub(cats.totals ? statRow(cats.totals.names, cats.totals.statistics[i]?.stats) : null, year, games),
      misc: scrub(cats.miscellaneous ? statRow(cats.miscellaneous.names, cats.miscellaneous.statistics[i]?.stats) : null, year, games),
    };
  });
  const career = {
    avg: cats.averages?.totals ? statRow(cats.averages.names, cats.averages.totals) : null,
    tot: cats.totals?.totals ? statRow(cats.totals.names, cats.totals.totals) : null,
    misc: cats.miscellaneous?.totals ? statRow(cats.miscellaneous.names, cats.miscellaneous.totals) : null,
  };
  // Seasons counted once each: the combined row where a player was traded, otherwise the single team row.
  const bySeason = new Map();
  for (const r of rows) if (!bySeason.has(r.season) || r.combined) bySeason.set(r.season, r);
  // For some legends ESPN's career line covers the whole career while the season rows start later (Wilt
  // Chamberlain: 1,045 career games, seasons only from 1968-69). Flag it so the reader can say which is which.
  const rowGames = [...bySeason.values()].reduce((a, r) => a + (r.avg?.gamesPlayed || 0), 0);
  const careerGames = career.avg?.gamesPlayed || 0;
  const careerBeyondRows = careerGames > rowGames + 2;
  // A career figure is only shown when every season has it; otherwise it would quietly cover part of the career.
  // When the career line reaches beyond the rows it is ESPN's own whole-career figure and stands on its own.
  // (A zero in the career line itself is scrubbed the same way, judged by the first season on record.)
  const firstYear = Math.min(...rows.map(r => r.season || 9999));
  for (const part of ['avg', 'tot', 'misc']) scrub(career[part], firstYear, career.avg?.gamesPlayed || 0);
  for (const part of careerBeyondRows ? [] : ['avg', 'tot', 'misc']) {
    if (!career[part]) continue;
    for (const k of Object.keys(career[part])) if (rows.some(r => !r.combined && r[part] && r[part][k] == null)) career[part][k] = null;
  }
  const teamInfo = Object.values(teams).map(t => ({ abbr: t.abbreviation, name: t.displayName, color: t.color ? `#${t.color}` : null, alt: t.alternateColor ? `#${t.alternateColor}` : null, logo: t.logos?.[0]?.href || null }));
  return { rows, seasons: bySeason.size, first: Math.min(...bySeason.keys()), last: Math.max(...bySeason.keys()), career, careerBeyondRows, rowGames, teams: teamInfo };
}

// "17/2/1963" (ESPN's display order is day/month/year) -> "1963-02-17".
export function isoDate(display) {
  const m = String(display || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

