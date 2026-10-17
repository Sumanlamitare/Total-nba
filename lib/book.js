// A player's book: everything the reader shows, composed from ESPN responses. Nothing here is invented —
// a missing field stays missing and the reader says so.
import * as espn from './espn.js';
import { seasonLabel, HONOR_KEYS } from './catalog.js';

// Bump when the shape or cleaning of a book changes, so cached books are rebuilt.
export const BOOK_VERSION = 4;

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

const POSITIONS = { G: 'Guard', F: 'Forward', C: 'Center', PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', 'G-F': 'Guard-Forward', 'F-C': 'Forward-Center', 'F-G': 'Forward-Guard', 'C-F': 'Center-Forward' };

export function parseHonors(bioJson, awardRows = []) {
  const nba = (bioJson?.awards || []).filter(a => !a.league || a.league === 'nba');
  if (nba.length) {
    return nba.map(a => ({ name: a.name, count: num(String(a.displayCount || '').replace(/x$/i, '')) ?? (a.seasons?.length || 1), seasons: (a.seasons || []).map(Number).sort((x, y) => x - y), key: HONOR_KEYS[a.name] || null }));
  }
  // Fallback: the season award lists collected by the catalog ingest.
  const by = new Map();
  for (const r of awardRows) {
    const h = by.get(r.name) || { name: r.name, count: 0, seasons: [], key: HONOR_KEYS[r.name] || null };
    h.count++; h.seasons.push(r.season); by.set(r.name, h);
  }
  return [...by.values()].map(h => ({ ...h, seasons: h.seasons.sort((a, b) => a - b) }));
}

// Non-NBA honors (college awards etc.) the bio lists under other leagues.
const otherHonors = bioJson => (bioJson?.awards || []).filter(a => a.league && a.league !== 'nba').map(a => ({ name: a.name, count: num(String(a.displayCount || '').replace(/x$/i, '')) || 1, league: a.league }));

export function parseTeams(bioJson) {
  return (bioJson?.teamHistory || []).map(t => ({ name: t.displayName, slug: t.slug, seasons: t.seasons || '', logo: t.logo || null }));
}

const ORDER = ['mvp', 'fmvp', 'dpoy', 'roy', 'smoy', 'mip', 'nba1', 'nba2', 'nba3', 'def1', 'def2', 'asmvp'];
const sortHonors = list => list.sort((a, b) => (a.key ? ORDER.indexOf(a.key) : 99) - (b.key ? ORDER.indexOf(b.key) : 99) || b.count - a.count);

export function compose({ id, web, core, bioJson, reg, post, leaders = [], awardRows = [] }) {
  const a = web?.athlete || null;
  const c = core || null;
  if (!a && !c) return null;
  const pos = a?.position?.abbreviation || c?.position?.abbreviation || '';
  const team = a?.team && (a?.active || c?.active) ? { abbr: a.team.abbreviation, name: a.team.displayName, color: a.team.color ? `#${a.team.color}` : null } : null;
  const born = isoDate(a?.displayDOB) || (c?.dateOfBirth ? String(c.dateOfBirth).slice(0, 10) : null);
  const bp = c?.birthPlace ? [c.birthPlace.city, c.birthPlace.state || c.birthPlace.country].filter(Boolean).join(', ') : null;
  const regular = parseStats(reg), playoffs = parseStats(post);
  const name = a?.displayName || c?.displayName;
  const book = {
    id: String(id), name,
    first: a?.firstName || c?.firstName || '', last: a?.lastName || c?.lastName || '',
    pos: pos && pos !== 'NA' ? pos : null, posName: pos && pos !== 'NA' ? (a?.position?.displayName || POSITIONS[pos] || pos) : null,
    jersey: a?.jersey || c?.jersey || null,
    height: a?.displayHeight || c?.displayHeight || null,
    weight: a?.displayWeight || c?.displayWeight || null,
    born, birthplace: a?.displayBirthPlace || bp || null,
    college: a?.college?.name || null,
    draft: a?.displayDraft || c?.draft?.displayText || null,
    debut: num(a?.debutYear ?? c?.debutYear),
    active: !!(a?.active ?? c?.active),
    status: a?.status?.name || c?.status?.name || null,
    team,
    headshot: a?.headshot?.href || null,
    espn: `https://www.espn.com/nba/player/_/id/${id}`,
    regular, playoffs,
    honors: sortHonors(parseHonors(bioJson, awardRows)),
    otherHonors: otherHonors(bioJson),
    teams: parseTeams(bioJson),
    leaders: leaders.map(l => ({ season: l.season, label: seasonLabel(l.season), stat: l.stat, value: l.value })).sort((x, y) => x.season - y.season),
    at: new Date().toISOString(),
  };
  // If ESPN has no team history, derive it from the stat rows (in order, merging consecutive stints).
  if (!book.teams.length && regular) {
    const out = [];
    for (const r of regular.rows.filter(r => !r.combined)) {
      const last = out[out.length - 1];
      if (last && last.abbr === r.team) last.to = r.season;
      else out.push({ name: r.teamName || r.team, abbr: r.team, from: r.season, to: r.season });
    }
    book.teams = out.map(t => ({ name: t.name, slug: null, seasons: t.from === t.to ? seasonLabel(t.from) : `${seasonLabel(t.from)} to ${seasonLabel(t.to)}`, logo: null, derived: true }));
  }
  return book;
}

export async function loadBook(d, id) {
  id = String(id);
  if (!/^\d{1,10}$/.test(id)) return null;
  return espn.remember(`book:${BOOK_VERSION}:${id}`, b => (b?.active ? 6 * 3600 : 7 * 86400), async () => {
    let down = null;
    const soft = p => p.catch(e => { down = e; return null; });
    const [web, bioJson, reg, post] = await Promise.all([
      soft(espn.athlete(id)), soft(espn.bio(id)), soft(espn.careerStats(id, 2)), soft(espn.careerStats(id, 3)),
    ]);
    const core = web?.athlete ? null : await soft(espn.coreAthlete(id));
    // ESPN unreachable (rather than "no such player"): report it instead of caching a half-empty book.
    if (down && !web?.athlete && !core) throw down;
    let leaders = [], awardRows = [], meta = null;
    if (d) {
      [leaders, awardRows, meta] = await Promise.all([
        d.collection('leaders').find({ id }).toArray().catch(() => []),
        d.collection('awards').find({ id }).toArray().catch(() => []),
        d.collection('meta').findOne({ _id: 'catalog' }).catch(() => null),
      ]);
    }
    const book = compose({ id, web, core, bioJson, reg, post, leaders, awardRows });
    if (book) book.leadersFrom = meta?.leadersFrom || null;
    return book;
  });
}

// --- Career highs from game logs --------------------------------------------------------------------------------

const HIGH_FIELDS = [['points', 'Points'], ['totalRebounds', 'Rebounds'], ['assists', 'Assists'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['threePointFieldGoalsMade', 'Three-pointers made'], ['minutes', 'Minutes']];

// Fold one season's game log into the running highs. Preseason games are ignored.
export function foldGamelog(acc, season, json) {
  if (!json?.seasonTypes) return 0;
  const names = json.names || [];
  let games = 0;
  for (const st of json.seasonTypes) {
    const kind = /postseason|playoff/i.test(st.displayName) ? 'playoffs' : /regular/i.test(st.displayName) ? 'regular' : null;
    if (!kind) continue;
    for (const cat of st.categories || []) {
      if (cat.type && cat.type !== 'event') continue;
      for (const ev of cat.events || []) {
        const row = statRow(names, ev.stats);
        const meta = json.events?.[ev.eventId] || {};
        const game = { season, label: seasonLabel(season), kind, date: meta.gameDate ? String(meta.gameDate).slice(0, 10) : null, opp: meta.opponent?.abbreviation || null, at: meta.atVs || null, result: meta.gameResult || null, score: meta.score || null };
        games++; acc.games[kind]++;
        const pts = row.points ?? 0;
        if (pts >= 30) acc.thirty[kind]++;
        if (pts >= 40) {
          acc.forty[kind]++;
          const g40 = { ...game, points: pts };
          if (!acc.firstForty || g40.date < acc.firstForty.date) acc.firstForty = g40;
          if (!acc.lastForty || g40.date > acc.lastForty.date) acc.lastForty = g40;
        }
        if (pts >= 50) acc.fifty[kind]++;
        if (pts >= 20 && (row.totalRebounds ?? 0) >= 10) acc.twentyTen[kind]++;
        const tens = ['points', 'totalRebounds', 'assists', 'steals', 'blocks'].filter(k => (row[k] ?? 0) >= 10).length;
        if (tens >= 3) acc.tripleDoubles[kind]++;
        for (const [k] of HIGH_FIELDS) {
          const v = row[k]; if (v == null) continue;
          const cur = acc.highs[kind][k];
          if (!cur || v > cur.value) acc.highs[kind][k] = { value: v, games: [game] };
          else if (v === cur.value && cur.games.length < 3) cur.games.push(game);
          else if (v === cur.value) cur.more = (cur.more || 0) + 1;
        }
      }
    }
  }
  return games;
}

const pair0 = () => ({ regular: 0, playoffs: 0 });
export const newHighs = () => ({ highs: { regular: {}, playoffs: {} }, games: pair0(), thirty: pair0(), forty: pair0(), fifty: pair0(), twentyTen: pair0(), tripleDoubles: pair0(), firstForty: null, lastForty: null });

export async function loadHighs(id, seasons) {
  id = String(id);
  const list = [...new Set(seasons.map(Number).filter(y => y >= 1990 && y <= 2100))].sort((a, b) => a - b);
  return espn.remember(`highs:${BOOK_VERSION}:${id}:${list.join(',')}`, 7 * 86400, async () => {
    const acc = newHighs();
    const covered = [];
    const logs = await espn.pool(list, 6, y => espn.gamelog(id, y).catch(() => null));
    logs.forEach((json, i) => { if (foldGamelog(acc, list[i], json) > 0) covered.push(list[i]); });
    const label = Object.fromEntries(HIGH_FIELDS);
    const fmt = kind => Object.entries(acc.highs[kind]).map(([k, h]) => ({ stat: k, label: label[k], ...h }));
    return { covered, requested: list, highs: { regular: fmt('regular'), playoffs: fmt('playoffs') }, games: acc.games, thirty: acc.thirty, forty: acc.forty, fifty: acc.fifty, twentyTen: acc.twentyTen, tripleDoubles: acc.tripleDoubles, firstForty: acc.firstForty, lastForty: acc.lastForty };
  });
}
