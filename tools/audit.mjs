// Data audit (Probe ESPN, task "audit"): every past date that isn't complete and why; and season statistics computed
// from our box scores against ESPN's own season table, player by player.
//   MONGODB_URI=... node tools/audit.mjs 2026
import { db, close } from '../lib/db.js';
import { seasonRows, etDate } from '../lib/data.js';
import { fetchJson } from '../lib/espn.js';

const season = +(process.argv[2] || 2026);
try {
  const d = await db();
  const today = etDate();
  const days = await d.collection('days').find({ season }).sort({ _id: 1 }).toArray();
  const bad = days.filter(x => x._id < today && !x.complete && !x.noGames);
  console.log(`${season}: ${days.length} dates, ${days.filter(x => x.complete).length} complete, ${days.filter(x => x.noGames).length} without games, ${bad.length} incomplete in the past`);
  for (const x of bad) console.log('  incomplete', x._id, `${x.final}/${x.games} final`, JSON.stringify(x.excluded), (x.problems || []).join(' | '));
  const excluded = days.flatMap(x => (x.excluded || []).map(e => `${x._id}:${e.status}`));
  console.log('  excluded games:', excluded.join(', ') || 'none');
  console.log('  diagrams:', await d.collection('diagrams').countDocuments({ season, kind: 'daily', latest: true }), 'daily,', await d.collection('diagrams').countDocuments({ season, kind: 'season', latest: true }), 'season');

  // Ours vs ESPN's season table (regular season).
  const ours = new Map((await seasonRows(d, { season, stype: 'regular' })).map(r => [r.id, r]));
  const espn = [];
  for (let page = 1; page < 30; page++) {
    const j = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=${page}&limit=100&season=${season}&seasontype=2`);
    const names = Object.fromEntries((j.categories || []).map(c => [c.name, c.names]));
    for (const a of j.athletes || []) {
      const v = {};
      for (const c of a.categories) c.values.forEach((x, i) => { v[`${c.name}.${names[c.name][i]}`] = x; });
      espn.push({ id: a.athlete.id, name: a.athlete.displayName, v });
    }
    if (page >= (j.pagination?.pages || 1)) break;
  }
  const checks = [['gp', 'general.gamesPlayed', 0], ['pts_tot', 'offensive.points', 0], ['reb_tot', 'general.rebounds', 0], ['ast_tot', 'offensive.assists', 0], ['stl_tot', 'defensive.steals', 0], ['blk_tot', 'defensive.blocks', 0],
    ['fgm_tot', 'offensive.fieldGoalsMade', 0], ['fga_tot', 'offensive.fieldGoalsAttempted', 0], ['tpm_tot', 'offensive.threePointFieldGoalsMade', 0], ['ftm_tot', 'offensive.freeThrowsMade', 0], ['fta_tot', 'offensive.freeThrowsAttempted', 0], ['to_tot', 'offensive.turnovers', 0],
    ['pts_pg', 'offensive.avgPoints', 0.051], ['ft_pct', 'offensive.freeThrowPct', 0.051]];
  let compared = 0, missing = 0;
  const diffs = Object.fromEntries(checks.map(([k]) => [k, []]));
  for (const e of espn) {
    const o = ours.get(e.id);
    if (!o) { missing++; continue; }
    compared++;
    for (const [k, ek, tol] of checks) {
      const a = o.v[k], b = e.v[ek];
      if (a == null || b == null) continue;
      if (Math.abs(a - b) > tol) diffs[k].push(`${e.name}: ours ${+a.toFixed(2)} ESPN ${b}`);
    }
  }
  console.log(`\nAccuracy: ${compared} players compared with ESPN's season table (${espn.length} in ESPN's, ${ours.size} in ours, ${missing} of ESPN's missing from ours)`);
  for (const [k, list] of Object.entries(diffs)) console.log(`  ${k}: ${list.length === 0 ? 'all match' : `${list.length} differ — ${list.slice(0, 5).join('; ')}`}`);
} finally { await close(); }
