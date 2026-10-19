// The game's data, built only from ESPN's public API:
//   players  — every player whose career reaches the 1980s or later (names and positions)
//   eras     — one document per franchise and decade: every player-era with 25+ games, rated (see dynasty.js)
//   meta     — { _id: 'game', teams, dynasties }: the 30 franchises and the dynasty ladder's starting fives
// Seasons are named by the year they end (2016 = 2015-16), the same convention ESPN uses.
import * as espn from './espn.js';
import { parseStats } from './stats.js';
import { buildEras, buildDynasty, orderLadder, LADDER, DECADES } from './dynasty.js';

export const FIRST_STATS_SEASON = 1985;
export const FIRST_GAME_SEASON = 1981; // 1980-81, the first season of the 1980s

export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const sortKey = (last, first) => `${last} ${first}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

// The current season by ESPN's convention: from October, the season ending next year.
export function currentSeason(now = new Date()) {
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export const teamIdOf = ref => (String(ref || '').match(/teams\/(\d+)/) || [])[1] || null;

export function entry({ id, name, pos = '', debut = null, src }) {
  return { _id: String(id), n: name, p: pos && pos !== 'NA' ? pos : '', d: debut, src: [src] };
}

// Fold one season's byathlete response into the players map (names and positions).
export function foldSeason(players, season, json) {
  let n = 0;
  for (const row of json?.athletes || []) {
    const a = row.athlete; if (!a?.id) continue;
    let p = players.get(String(a.id));
    if (!p) { p = entry({ id: a.id, name: a.displayName, src: 'seasons' }); players.set(p._id, p); }
    if (a.position?.abbreviation && a.position.abbreviation !== 'NA') p.p = a.position.abbreviation;
    if (a.debutYear != null) p.d = Number(a.debutYear);
    n++;
  }
  return n;
}

export const teamsOf = tl => (tl?.sports?.[0]?.leagues?.[0]?.teams || []).map(({ team: t }) => ({
  id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName, loc: t.location || '',
  color: t.color ? `#${t.color}` : null, alt: t.alternateColor ? `#${t.alternateColor}` : null,
}));

// Build or refresh everything. `log` gets progress lines. Returns the meta document.
export async function ingest(d, { log = () => {}, from = FIRST_STATS_SEASON, to = currentSeason(), scan = 0 } = {}) {
  const players = new Map();

  // 0. Id scan: ESPN numbered players who debuted before ~2010 with small sequential ids, and its season lists
  //    start in 1984-85, so the scan finds the early-1980s players those lists miss.
  if (scan) {
    const ids = Array.from({ length: scan }, (_, k) => String(k + 1));
    let found = 0;
    await espn.pool(ids, 16, async id => {
      const a = await espn.fetchJson(`${espn.CORE}/athletes/${id}`, 2).catch(() => null);
      // Some 1980s players (Larry Bird) have no debut year on record: keep them, the stats step drops anyone too early.
      if (!a?.displayName || (a.debutYear && +a.debutYear < 1965)) return;
      players.set(id, entry({ id, name: a.displayName, pos: a.position?.abbreviation || '', debut: a.debutYear ? +a.debutYear : null, src: 'scan' })); found++;
    });
    log(`id scan 1..${scan}: ${found} players`);
  }

  // 1. Season lists: everyone who played since 1984-85.
  for (let y = from; y <= to; y++) {
    const json = await espn.byAthlete(y).catch(e => { log(`season ${y}: ${e.message}`); return null; });
    log(`season ${seasonLabel(y)}: ${foldSeason(players, y, json)} players`);
  }

  // 2. Franchises.
  const teams = teamsOf(await espn.teamsList().catch(() => null));
  const franchiseIds = new Set(teams.map(t => t.id));
  log(`teams: ${teams.length} franchises`);

  // 3. Every player's season-by-season stats, by team (one request per player).
  const rowsByPlayer = new Map();
  let failed = 0;
  await espn.pool([...players.values()], 12, async p => {
    const json = await espn.fetchJson(`${espn.WEB}/athletes/${p._id}/stats`, 3).catch(() => { failed++; return null; });
    const s = parseStats(json); if (!s) return;
    const rows = s.rows.filter(r => r.season >= FIRST_GAME_SEASON);
    if (!rows.length) return;
    rowsByPlayer.set(p._id, rows);
    if (!p.p) p.p = [...rows].reverse().find(r => r.pos)?.pos || '';
  });
  log(`season stats for ${rowsByPlayer.size} players since ${seasonLabel(FIRST_GAME_SEASON)} (${failed} requests failed)`);

  // 4. Player-eras and the dynasty ladder.
  const eras = buildEras(players, rowsByPlayer, franchiseIds);
  const byAbbr = new Map(teams.map(t => [t.abbr, t.id]));
  const dynasties = orderLadder(LADDER.map(e => buildDynasty(e, byAbbr.get(e.abbr), players, rowsByPlayer)).filter(Boolean));
  for (const x of dynasties) log(`${x.label}: ${x.five.map(f => `${f.slot} ${f.n} ${f.ovr}`).join(', ')}${x.missing.length ? ` (not found: ${x.missing.join(', ')})` : ''}`);
  log(`eras: ${eras.length} franchise-decades, ${eras.reduce((n, e) => n + e.players.length, 0)} player-eras; dynasties: ${dynasties.map(x => x.label).join(', ')}`);

  // Write.
  const kept = [...players.values()].filter(p => rowsByPlayer.has(p._id)).map(p => ({ _id: p._id, n: p.n, p: p.p || '' }));
  const col = d.collection('players');
  for (let i = 0; i < kept.length; i += 500) {
    await col.bulkWrite(kept.slice(i, i + 500).map(p => ({ replaceOne: { filter: { _id: p._id }, replacement: p, upsert: true } })), { ordered: false });
  }
  await col.deleteMany({ _id: { $nin: kept.map(p => p._id) } });
  await d.collection('eras').deleteMany({});
  if (eras.length) await d.collection('eras').insertMany(eras);
  const meta = { _id: 'game', teams, decades: DECADES, dynasties, players: kept.length, eras: eras.length, at: new Date() };
  await d.collection('meta').replaceOne({ _id: 'game' }, meta, { upsert: true });
  // The library's collections are no longer used.
  for (const name of ['leaders', 'awards', 'cache']) await d.collection(name).drop().catch(() => {});
  await d.collection('meta').deleteOne({ _id: 'catalog' }).catch(() => {});
  log(`done: ${kept.length} players, ${eras.length} eras, ${dynasties.length} dynasties`);
  return meta;
}
