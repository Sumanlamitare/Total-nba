// The catalog: one small record per player, built only from ESPN data.
//
// ESPN has no single "every player ever" list, so the catalog is the union of
//   1. the season stat lists (statistics/byathlete), 1984-85 to now — everyone who played in those seasons;
//   2. every season's award winners since 1946-47 — this is how pre-1985 greats get shelved;
//   3. the current-player index — rookies who haven't played yet;
//   4. players added later through search (see addFromEspn).
// Seasons are named by the year they end (2016 = 2015-16), the same convention ESPN uses.
import * as espn from './espn.js';

export const FIRST_STATS_SEASON = 1985;
export const FIRST_AWARDS_SEASON = 1947;

// The honors counted on a spine. Keys are stable; names are ESPN's award names.
export const HONOR_KEYS = {
  'MVP': 'mvp', 'Finals MVP': 'fmvp', 'All-NBA 1st Team': 'nba1', 'All-NBA 2nd Team': 'nba2', 'All-NBA 3rd Team': 'nba3',
  'Defensive Player of the Year': 'dpoy', 'Rookie of the Year': 'roy', 'Sixth Man of the Year': 'smoy', 'Most Improved Player': 'mip',
  'All-Defensive 1st Team': 'def1', 'All-Defensive 2nd Team': 'def2', 'All-Star MVP': 'asmvp',
};
export const LEADER_STATS = [
  ['pts', 'offensive.avgPoints'], ['reb', 'general.avgRebounds'], ['ast', 'offensive.avgAssists'],
  ['stl', 'defensive.avgSteals'], ['blk', 'defensive.avgBlocks'],
];

export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const sortKey = (last, first) => `${last} ${first}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
export const slugOf = (name, id) => `${String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${id}`;

// The current season by ESPN's convention: from October, the season ending next year.
export function currentSeason(now = new Date()) {
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

const splitName = (display, first, last) => {
  if (last) return { first: first || '', last };
  const parts = String(display || '').trim().split(/\s+/);
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
  let i = parts.length - 1;
  if (i > 0 && suffix.test(parts[i])) i--;
  return { first: parts.slice(0, i).join(' '), last: parts.slice(i).join(' ') };
};

// A fresh catalog entry.
export function entry({ id, name, first, last, pos = '', debut = null, active = false, src }) {
  if (pos === 'NA') pos = '';
  const nm = splitName(name, first, last);
  return { _id: String(id), n: name, f: nm.first, l: nm.last, k: sortKey(nm.last, nm.first), p: pos, d: debut, y0: null, y1: null, a: !!active, t: [], ct: null, h: {}, g: 0, src: [src] };
}

const touch = (p, y) => { p.y0 = p.y0 == null ? y : Math.min(p.y0, y); p.y1 = p.y1 == null ? y : Math.max(p.y1, y); };
const addSrc = (p, s) => { if (!p.src.includes(s)) p.src.push(s); };

// Fold one season's byathlete response into the catalog map.
export function foldSeason(players, season, json) {
  let n = 0;
  for (const row of json?.athletes || []) {
    const a = row.athlete; if (!a?.id) continue;
    let p = players.get(String(a.id));
    if (!p) { p = entry({ id: a.id, name: a.displayName, first: a.firstName, last: a.lastName, src: 'seasons' }); players.set(p._id, p); }
    addSrc(p, 'seasons');
    if (a.position?.abbreviation && a.position.abbreviation !== 'NA') p.p = a.position.abbreviation;
    if (a.debutYear != null) p.d = Number(a.debutYear);
    touch(p, season);
    const gpIdx = (json.categories || []).find(c => c.name === 'general')?.names?.indexOf('gamesPlayed') ?? 0;
    const gen = (row.categories || []).find(c => c.name === 'general');
    p.g += Number(gen?.values?.[gpIdx >= 0 ? gpIdx : 0]) || 0;
    for (const t of a.teams || []) if (t.abbreviation && !p.t.includes(t.abbreviation)) p.t.push(t.abbreviation);
    if (season >= p.y1 && a.teams?.length) p.ct = a.teams[a.teams.length - 1].abbreviation;
    n++;
  }
  return n;
}

// The single leader for a stat in a season from a qualified, sorted byathlete response.
export function leaderOf(season, stat, json) {
  const row = json?.athletes?.[0]; if (!row) return null;
  const [cat, field] = LEADER_STATS.find(s => s[0] === stat)[1].split('.');
  const def = (json.categories || []).find(c => c.name === cat);
  const idx = def?.names?.indexOf(field) ?? -1;
  const vals = (row.categories || []).find(c => c.name === cat);
  const value = idx >= 0 ? vals?.values?.[idx] : null;
  return { _id: `${season}-${stat}`, season, stat, id: String(row.athlete.id), name: row.athlete.displayName, value: value == null ? null : Math.round(value * 10) / 10 };
}

const idFromRef = ref => (String(ref || '').match(/athletes\/(\d+)/) || [])[1] || null;
const teamFromRef = ref => (String(ref || '').match(/teams\/(\d+)/) || [])[1] || null;

// Award rows for one award object ({id, name, winners:[{athlete:{$ref}, team:{$ref}}]}).
export function awardRows(season, award) {
  return (award?.winners || []).map(w => idFromRef(w.athlete?.$ref)).filter(Boolean).map((id, i) => ({
    _id: `${season}-${award.id}-${id}`, season, award: String(award.id), name: award.name, id, team: teamFromRef(award.winners[i]?.team?.$ref),
  }));
}

export function countHonors(players, rows) {
  for (const p of players.values()) p.h = {};
  for (const r of rows) {
    const p = players.get(r.id), key = HONOR_KEYS[r.name];
    if (p && key) p.h[key] = (p.h[key] || 0) + 1;
  }
}

// Fold an athletes/{id}/stats response into a catalog entry: seasons on record, games, teams.
export function foldCareer(p, json) {
  const avg = (json?.categories || []).find(c => c.name === 'averages');
  if (!avg?.statistics?.length) return false;
  const gp = avg.names.indexOf('gamesPlayed');
  const seasons = new Map(), teams = [];
  for (const r of avg.statistics) {
    const y = r.season?.year; if (!y) continue;
    const combined = /totals/i.test(r.teamSlug || '');
    const abbr = json.teams?.[r.teamSlug]?.abbreviation;
    if (abbr && !combined && !teams.includes(abbr)) teams.push(abbr);
    if (!seasons.has(y) || combined) seasons.set(y, Number(r.stats?.[gp >= 0 ? gp : 0]) || 0);
  }
  if (!seasons.size) return false;
  const ys = [...seasons.keys()];
  p.y0 = Math.min(p.y0 ?? Infinity, ...ys); p.y1 = Math.max(p.y1 ?? -Infinity, ...ys); p.y1min = false;
  p.g = [...seasons.values()].reduce((a, b) => a + b, 0);
  if (teams.length) p.t = teams;
  addSrc(p, 'career');
  return true;
}

// Careers that began before the season lists do: start at the debut season (debutYear 1956 -> 1956-57 = 1957).
// Award-only players get their last award season as a lower bound for the end of the career.
export function finishSpans(players, rows = []) {
  const lastAward = new Map();
  for (const r of rows) lastAward.set(r.id, Math.max(lastAward.get(r.id) || 0, r.season));
  for (const p of players.values()) {
    if (p.d) p.y0 = Math.min(p.y0 ?? Infinity, p.d + 1);
    if (p.y1 == null && lastAward.has(p._id)) { p.y1 = lastAward.get(p._id); p.y1min = true; }
  }
}

// The compact record the client loads for every book on the shelves.
export function publicRecord(p) {
  const o = { i: p._id, n: p.n, l: p.l, k: p.k };
  if (p.p) o.p = p.p;
  if (p.y0) o.y0 = p.y0;
  if (p.y1) o.y1 = p.y1;
  if (p.y1min) o.y1m = 1;
  if (p.a) o.a = 1;
  if (p.t?.length) o.t = p.t;
  if (p.g) o.g = p.g;
  const h = Object.entries(p.h || {}).filter(([, v]) => v);
  if (h.length) o.h = Object.fromEntries(h);
  return o;
}

// Build or refresh the whole catalog. `log` gets progress lines. Returns counts.
export async function ingest(d, { log = () => {}, from = FIRST_STATS_SEASON, awardsFrom = FIRST_AWARDS_SEASON, to = currentSeason(), scan = 0 } = {}) {
  const players = new Map();
  for (const p of await d.collection('players').find({}).toArray()) {
    // Keep players found by search or by the id scan; everything else is rebuilt from scratch.
    const keep = (p.src || []).filter(s => s === 'search' || s === 'scan');
    if (keep.length) players.set(p._id, { ...p, y0: null, y1: null, y1min: false, t: [], g: 0, src: keep });
  }

  // 0. Optional id scan. ESPN numbered players who debuted before ~2010 with small sequential ids, and its
  //    season lists are thin before the mid-90s, so walking ids 1..scan finds the players those lists miss.
  if (scan) {
    const ids = Array.from({ length: scan }, (_, k) => String(k + 1)).filter(id => !players.has(id));
    let found = 0;
    await espn.pool(ids, 16, async id => {
      const a = await espn.fetchJson(`${espn.CORE}/athletes/${id}`, 2).catch(() => null);
      if (!a?.displayName || !a.debutYear) return;
      const p = entry({ id, name: a.displayName, first: a.firstName, last: a.lastName, pos: a.position?.abbreviation || '', debut: Number(a.debutYear), active: a.active, src: 'scan' });
      players.set(id, p); found++;
    });
    log(`id scan 1..${scan}: ${found} players`);
  }

  // 1. Seasons.
  const leaders = [];
  for (let y = from; y <= to; y++) {
    const json = await espn.byAthlete(y).catch(e => { log(`season ${y}: ${e.message}`); return null; });
    const n = foldSeason(players, y, json);
    log(`season ${seasonLabel(y)}: ${n} players`);
    if (!n) continue;
    for (const [stat, sort] of LEADER_STATS) {
      const q = await espn.byAthlete(y, { qualified: true, sort, limit: 1 }).catch(() => null);
      const l = leaderOf(y, stat, q); if (l) leaders.push(l);
    }
  }

  // 2. Awards.
  const rows = [];
  for (let y = awardsFrom; y <= to; y++) {
    const list = await espn.seasonAwards(y).catch(() => null);
    const awards = await espn.pool(list?.items || [], 6, it => espn.fetchJson(it.$ref).catch(() => null));
    for (const a of awards) if (a) rows.push(...awardRows(y, a));
    if (awards.length) log(`awards ${seasonLabel(y)}: ${awards.length} awards`);
  }
  const unknown = [...new Set(rows.map(r => r.id))].filter(id => !players.has(id));
  log(`resolving ${unknown.length} award winners not in the season lists`);
  await espn.pool(unknown, 8, async id => {
    const a = await espn.fetchJson(`${espn.CORE}/athletes/${id}`).catch(() => null);
    if (!a?.displayName) return;
    const p = entry({ id, name: a.displayName, first: a.firstName, last: a.lastName, pos: a.position?.abbreviation || '', debut: a.debutYear ? Number(a.debutYear) : null, active: a.active, src: 'awards' });
    players.set(p._id, p);
  });
  for (const r of rows) { const p = players.get(r.id); if (p) addSrc(p, 'awards'); }
  countHonors(players, rows);

  // 2b. Careers the season lists only partly cover (they thin out before the mid-1990s): read each player's
  //     ESPN career stats for the exact seasons, games and teams on record.
  const older = [...players.values()].filter(p => !p.a && (p.y0 == null || p.y0 < 1997 || (p.d != null && p.d < 1996)));
  let filled = 0;
  await espn.pool(older, 16, async p => {
    const json = await espn.fetchJson(`${espn.WEB}/athletes/${p._id}/stats`, 2).catch(() => null);
    if (foldCareer(p, json)) filled++;
  });
  log(`career stats read for ${older.length} older players (${filled} with season records)`);
  finishSpans(players, rows);

  // 3. Current players (rookies without a season yet). Also the source of truth for "active".
  const idx = await espn.activeIndex().catch(() => null);
  if (idx?.items?.length) {
    for (const p of players.values()) p.a = false;
    for (const a of idx.items) {
      let p = players.get(String(a.id));
      if (!p) { p = entry({ id: a.id, name: a.displayName, first: a.firstName, last: a.lastName, src: 'active' }); players.set(p._id, p); }
      p.a = true; addSrc(p, 'active');
    }
    log(`active index: ${idx.items.length}`);
  }

  // Write.
  const all = [...players.values()];
  const col = d.collection('players');
  for (let i = 0; i < all.length; i += 500) {
    await col.bulkWrite(all.slice(i, i + 500).map(p => ({ replaceOne: { filter: { _id: p._id }, replacement: p, upsert: true } })), { ordered: false });
  }
  await col.deleteMany({ _id: { $nin: all.map(p => p._id) } });
  await d.collection('leaders').deleteMany({});
  if (leaders.length) await d.collection('leaders').insertMany(leaders);
  await d.collection('awards').deleteMany({});
  if (rows.length) await d.collection('awards').insertMany(rows, { ordered: false }).catch(e => { if (e.code !== 11000) throw e; });
  const leadersFrom = leaders.length ? Math.min(...leaders.map(l => l.season)) : null;
  const meta = { _id: 'catalog', players: all.length, leaders: leaders.length, leadersFrom, awards: rows.length, from, to, at: new Date() };
  await d.collection('meta').replaceOne({ _id: 'catalog' }, meta, { upsert: true });
  log(`done: ${all.length} players, ${leaders.length} league-leader rows, ${rows.length} award rows`);
  return meta;
}

// Add a player found through ESPN search who isn't in the catalog yet (e.g. a pre-1985 player with no award).
export async function addFromEspn(d, id) {
  const col = d.collection('players');
  const have = await col.findOne({ _id: String(id) });
  if (have) return have;
  const [web, core] = await Promise.all([espn.athlete(id).catch(() => null), espn.coreAthlete(id).catch(() => null)]);
  const a = web?.athlete || core;
  if (!a?.displayName) return null;
  // Only basketball/NBA athletes: the core record lives under leagues/nba, the web one under nba.
  const p = entry({ id, name: a.displayName, first: a.firstName, last: a.lastName, pos: a.position?.abbreviation || '', debut: a.debutYear ? Number(a.debutYear) : null, active: a.active, src: 'search' });
  if (p.d) p.y0 = p.d + 1;
  if (p.p === 'NA') p.p = '';
  const rows = await d.collection('awards').find({ id: String(id) }).toArray();
  for (const r of rows) { const k = HONOR_KEYS[r.name]; if (k) p.h[k] = (p.h[k] || 0) + 1; }
  await col.updateOne({ _id: p._id }, { $setOnInsert: p }, { upsert: true });
  return p;
}
