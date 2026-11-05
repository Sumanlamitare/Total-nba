// Record lists, computed from the box scores in the database (ESPN box scores reach back to 1993-94), never typed in.
// Every list says its scope — league, franchise, rookies, position, international players — its season type, and the
// span of games it covers, so a box-score-era record is never presented as an all-time NBA record. All-time records
// from before 1993-94 can only come from the reference records editors add with a source (refrecords).
//
// Kinds:  game     — one player's game (most points in a game...)        entries: one per game
//         combo    — a game meeting a condition (most points in a triple-double...)
//         age      — youngest / oldest to have such a game                  entries: one per player (first or last time)
//         season   — a player's season (totals, counts, averages)
//         streak   — consecutive games played (regular season)
//         team     — a team's game (points, threes, a quarter, margin)
import { derive, tens, STAT } from './stats.js';
import { ageOn, seasonLabel } from './util.js';

export const KEEP = 40, SHOW = 25;
const ST = { 2: 'Regular season', 3: 'Playoffs' };

const GAME_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgm', 'ftm', 'fga', 'tpa', 'fta', 'orb', 'drb', 'tov', 'pra', 'stocks', 'min'];
const SUB_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm']; // for franchise, rookie, position and international lists
const COMBOS = [
  ['td_pts', 'Most points in a triple-double', l => tens(l).length >= 3, 'pts', 'Statistical combination'],
  ['td_ast', 'Most assists in a triple-double', l => tens(l).length >= 3, 'ast', 'Statistical combination'],
  ['ast_no_tov', 'Most assists without a turnover', l => l.tov === 0, 'ast', 'Statistical combination'],
  ['pts_no_ft', 'Most points without a free throw attempt', l => l.fta === 0, 'pts', 'Statistical combination'],
  ['tpm_perfect', 'Most three-pointers without a miss', l => l.tpa > 0 && l.tpa === l.tpm, 'tpm', 'Shooting'],
  ['fgm_perfect', 'Most field goals without a miss', l => l.fga > 0 && l.fga === l.fgm, 'fgm', 'Shooting'],
  ['ftm_perfect', 'Most free throws without a miss', l => l.fta > 0 && l.fta === l.ftm, 'ftm', 'Shooting'],
  ['pts_bench', 'Most points off the bench', l => l.gs === false, 'pts', 'Statistical combination'],
  ['gmsc', 'Highest Game Score', () => true, 'gmsc', 'Statistical combination'],
  ['fga_miss', 'Most missed field goals', () => true, 'fg_miss', 'Shooting'],
  ['dd_blk', 'Most blocks in a points-rebounds double-double', l => l.pts >= 10 && l.reb >= 10, 'blk', 'Defensive'],
];
const AGES = [
  ['young_pts40', 'Youngest to score 40 in a game', l => l.pts >= 40, 'young'],
  ['young_pts50', 'Youngest to score 50 in a game', l => l.pts >= 50, 'young'],
  ['young_td', 'Youngest to record a triple-double', l => tens(l).length >= 3, 'young'],
  ['young_2020', 'Youngest with a 20-20 game', l => l.pts >= 20 && l.reb >= 20, 'young'],
  ['old_pts40', 'Oldest to score 40 in a game', l => l.pts >= 40, 'old'],
  ['old_td', 'Oldest to record a triple-double', l => tens(l).length >= 3, 'old'],
];
const SEASON = [
  ['pts', 'Most points in a season'], ['reb', 'Most rebounds in a season'], ['ast', 'Most assists in a season'], ['stl', 'Most steals in a season'],
  ['blk', 'Most blocks in a season'], ['tpm', 'Most three-pointers in a season'], ['ftm', 'Most free throws in a season'],
  ['g40', 'Most 40-point games in a season'], ['g30', 'Most 30-point games in a season'], ['td', 'Most triple-doubles in a season'], ['dd', 'Most double-doubles in a season'],
  ['ppg', 'Highest scoring average in a season'], ['rpg', 'Highest rebounding average in a season'], ['apg', 'Highest assist average in a season'],
];
const STREAKS = [
  ['pts20', 'Consecutive games with 20+ points', l => l.pts >= 20], ['pts30', 'Consecutive games with 30+ points', l => l.pts >= 30],
  ['dd', 'Consecutive double-doubles', l => tens(l).length >= 2], ['td', 'Consecutive triple-doubles', l => tens(l).length >= 3],
  ['tpm1', 'Consecutive games with a three-pointer', l => l.tpm >= 1], ['tpm5', 'Consecutive games with 5+ three-pointers', l => l.tpm >= 5],
  ['ast10', 'Consecutive games with 10+ assists', l => l.ast >= 10], ['reb10', 'Consecutive games with 10+ rebounds', l => l.reb >= 10],
];
const TEAM = [
  ['pts', 'Most points by a team in a game'], ['pts_low', 'Fewest points by a team in a game', 'asc'], ['tpm', 'Most three-pointers by a team in a game'],
  ['ast', 'Most assists by a team in a game'], ['reb', 'Most rebounds by a team in a game'], ['stl', 'Most steals by a team in a game'],
  ['blk', 'Most blocks by a team in a game'], ['qtr', 'Most points by a team in a quarter'], ['margin', 'Largest margin of victory'],
];

const posOf = p => { const c = String(p || '').toUpperCase(); return c.includes('C') && !c.includes('PG') ? 'C' : c.includes('G') ? 'G' : c.includes('F') ? 'F' : null; };
const POS_NAME = { G: 'guards', F: 'forwards', C: 'centers' };

// Every list definition. scope: { kind: nba | team | rookie | pos | intl, team?, pos?, stype }.
export function definitions(teams = []) {
  const defs = [];
  const label = s => STAT[s]?.label.toLowerCase() || s;
  for (const st of [2, 3]) {
    for (const s of GAME_STATS) defs.push({ id: `g:${s}:nba:${st}`, kind: 'game', stat: s, title: `Most ${label(s)} in a game`, scope: { kind: 'nba', stype: st }, category: categoryOf(s) });
    for (const t of teams) for (const s of SUB_STATS) defs.push({ id: `g:${s}:tm${t.id}:${st}`, kind: 'game', stat: s, title: `Most ${label(s)} in a game`, scope: { kind: 'team', team: t.id, teamName: t.name, stype: st }, category: 'Franchise' });
    for (const [k, title, , stat, category] of COMBOS) defs.push({ id: `c:${k}:nba:${st}`, kind: 'combo', combo: k, stat, title, scope: { kind: 'nba', stype: st }, category });
    for (const [k, title] of TEAM) defs.push({ id: `t:${k}:nba:${st}`, kind: 'team', stat: k, title, order: k === 'pts_low' ? 'asc' : 'desc', scope: { kind: 'nba', stype: st }, category: 'Team' });
  }
  for (const s of SUB_STATS) {
    defs.push({ id: `g:${s}:rookie:2`, kind: 'game', stat: s, title: `Most ${label(s)} in a game by a rookie`, scope: { kind: 'rookie', stype: 2 }, category: 'Rookie' });
    defs.push({ id: `g:${s}:intl:2`, kind: 'game', stat: s, title: `Most ${label(s)} in a game by an international player`, scope: { kind: 'intl', stype: 2 }, category: 'Nationality' });
    for (const p of ['G', 'F', 'C']) defs.push({ id: `g:${s}:pos${p}:2`, kind: 'game', stat: s, title: `Most ${label(s)} in a game by ${POS_NAME[p]}`, scope: { kind: 'pos', pos: p, stype: 2 }, category: 'Position' });
  }
  for (const [k, title, , dir] of AGES) defs.push({ id: `a:${k}:nba:2`, kind: 'age', combo: k, stat: 'age', title, order: dir === 'young' ? 'asc' : 'desc', scope: { kind: 'nba', stype: 2 }, category: 'Age' });
  for (const [k, title] of SEASON) {
    defs.push({ id: `s:${k}:nba:2`, kind: 'season', stat: k, title, scope: { kind: 'nba', stype: 2 }, category: 'Season' });
    if (['pts', 'reb', 'ast', 'tpm', 'ppg'].includes(k)) defs.push({ id: `s:${k}:rookie:2`, kind: 'season', stat: k, title: `${title} by a rookie`, scope: { kind: 'rookie', stype: 2 }, category: 'Rookie' });
  }
  for (const t of teams) for (const k of ['pts', 'tpm', 'ppg']) defs.push({ id: `s:${k}:tm${t.id}:2`, kind: 'season', stat: k, title: SEASON.find(x => x[0] === k)[1], scope: { kind: 'team', team: t.id, teamName: t.name, stype: 2 }, category: 'Franchise' });
  for (const [k, title] of STREAKS) defs.push({ id: `k:${k}:nba:2`, kind: 'streak', stat: k, title, scope: { kind: 'nba', stype: 2 }, category: 'Consecutive games' });
  for (const t of teams) for (const [k, title] of TEAM.filter(x => ['pts', 'tpm', 'qtr', 'margin'].includes(x[0]))) defs.push({ id: `t:${k}:tm${t.id}:2`, kind: 'team', stat: k, title: title.replace('by a team', 'by the team'), scope: { kind: 'team', team: t.id, teamName: t.name, stype: 2 }, category: 'Franchise' });
  return defs.map(d => ({ order: 'desc', ...d }));
}

function categoryOf(s) {
  if (['stl', 'blk', 'stocks', 'drb'].includes(s)) return 'Defensive';
  if (['tpm', 'fgm', 'ftm', 'fga', 'tpa', 'fta'].includes(s)) return 'Shooting';
  return 'League';
}

export function scopeLabel(def, coverage) {
  const s = def.scope;
  const who = s.kind === 'team' ? s.teamName : s.kind === 'rookie' ? 'Rookies' : s.kind === 'pos' ? POS_NAME[s.pos][0].toUpperCase() + POS_NAME[s.pos].slice(1) : s.kind === 'intl' ? 'International players' : 'NBA';
  const since = coverage?.from ? `since ${seasonLabel(coverage.from)}` : 'box-score era';
  return `${who} · ${ST[s.stype]} · ${since}`;
}

// Which lists a player's game can enter (not age, season, streak or team lists).
export function gameListIds(row, ctx) {
  const st = row.st; if (st !== 2 && st !== 3) return [];
  const ids = GAME_STATS.map(s => `g:${s}:nba:${st}`);
  for (const s of SUB_STATS) ids.push(`g:${s}:tm${row.t}:${st}`);
  for (const [k] of COMBOS) ids.push(`c:${k}:nba:${st}`);
  if (st === 2) {
    if (ctx.rookie) for (const s of SUB_STATS) ids.push(`g:${s}:rookie:2`);
    if (ctx.intl) for (const s of SUB_STATS) ids.push(`g:${s}:intl:2`);
    if (ctx.pos) for (const s of SUB_STATS) ids.push(`g:${s}:pos${ctx.pos}:2`);
    for (const [k] of AGES) ids.push(`a:${k}:nba:2`);
  }
  return ids;
}

// The value a row contributes to a list, or null if it doesn't qualify.
export function valueFor(def, l, ctx = {}) {
  if (def.kind === 'game') return l[def.stat] ?? null;
  if (def.kind === 'combo') {
    const c = COMBOS.find(x => x[0] === def.combo);
    if (!c[2](l)) return null;
    return def.stat === 'fg_miss' ? l.fga - l.fgm : l[def.stat] ?? null;
  }
  if (def.kind === 'age') {
    const a = AGES.find(x => x[0] === def.combo);
    return a[2](l) && ctx.age != null ? ctx.age : null;
  }
  return null;
}

// Context for a player in a game: rookie, international, position bucket, age.
export function playerContext(player, row) {
  const debut = player?.debut ? +player.debut + 1 : player?.firstSeason || null;
  return {
    rookie: debut != null && row.s === debut && (player?.debut || (player?.firstSeason && player.firstSeason > (player.coverageFrom || 1994))),
    intl: !!player?.country && !/^(USA|United States)$/i.test(player.country),
    pos: posOf(player?.pos), age: ageOn(player?.dob, String(row.d)),
  };
}

// Insert an entry into a sorted list (desc or asc), keeping KEEP. Returns the new list.
export function insert(list, entry, order = 'desc') {
  const out = list.filter(e => !(e.gid === entry.gid && e.pid === entry.pid && e.team === entry.team));
  out.push(entry);
  out.sort((a, b) => (order === 'asc' ? a.v - b.v : b.v - a.v) || String(a.date).localeCompare(String(b.date)));
  return out.slice(0, KEEP);
}
export const qualifies = (list, v, order = 'desc') => v != null && (list.length < KEEP || (order === 'asc' ? v <= list.at(-1).v : v >= list.at(-1).v));

// Where a value stands against a list: { rank, ties, top, state: broken | tied | top-N | none }.
export function standing(list, v, order = 'desc', exclude = null) {
  const l = exclude ? list.filter(e => e.gid !== exclude) : list;
  if (v == null) return { state: 'none' };
  const better = (a, b) => (order === 'asc' ? a < b : a > b);
  const top = l[0];
  if (!top) return { state: 'first', rank: 1, top: null };
  const rank = 1 + l.filter(e => better(e.v, v)).length;
  const ties = l.filter(e => e.v === v).length;
  const state = better(v, top.v) ? 'broken' : v === top.v ? 'tied' : rank <= 10 ? 'top' : 'none';
  return { state, rank, ties, top, holders: l.filter(e => e.v === top.v) };
}

// ── The full rebuild (backfill): one pass over every game and player line in date order. ──────────────────────────
export async function rebuild(d, { log = console.log } = {}) {
  const teams = await d.collection('teams').find({}).toArray();
  const defs = definitions(teams);
  const lists = new Map(defs.map(x => [x.id, []]));
  const players = new Map((await d.collection('players').find({}, { projection: { name: 1, dob: 1, country: 1, pos: 1, debut: 1, team: 1 } }).toArray()).map(p => [p._id, p]));
  // First season per player (rookies whose bio lacks a debut year).
  const first = await d.collection('pgames').aggregate([{ $match: { st: 2 } }, { $group: { _id: '$p', s: { $min: '$s' } } }]).toArray();
  const coverageFrom = Math.min(...first.map(x => x.s));
  for (const f of first) { const p = players.get(f._id) || {}; p.firstSeason = f.s; p.coverageFrom = coverageFrom; players.set(f._id, p); }
  const games = new Map((await d.collection('games').find({ status: 'final', 'verify.status': { $in: ['verified', 'consistent'] } }, { projection: { date: 1, season: 1, stype: 1, teams: 1 } }).toArray()).map(g => [g._id, g]));
  const name = pid => players.get(pid)?.name || pid;
  const abbr = (g, tid) => g?.teams?.find(t => t.id === tid)?.abbr || '';
  const put = (id, entry) => { const def = defMap.get(id); const l = lists.get(id); if (l && qualifies(l, entry.v, def.order)) lists.set(id, insert(l, entry, def.order)); };
  const defMap = new Map(defs.map(x => [x.id, x]));
  const seasons = new Map(); // pid:season:stype -> totals
  const streak = new Map(); // pid -> { key: { n, start, startGid } }
  const ageSeen = new Map(); // listId:pid -> entry (youngest: first time; oldest: last time)
  let n = 0, firstDate = null, lastDate = null;
  const cur = d.collection('pgames').find({ st: { $in: [2, 3] } }).sort({ d: 1 }).hint({ d: -1 }); // the date index: no in-memory sort
  for await (const r of cur) {
    n++; if (n % 100000 === 0) log(`  records: ${n} player lines`);
    firstDate ??= r.d; lastDate = r.d;
    const g = games.get(r.g);
    const l = derive(r);
    const ctx = playerContext(players.get(r.p), r);
    const base = { pid: r.p, name: name(r.p), team: abbr(g, r.t), opp: abbr(g, r.o), gid: r.g, date: String(r.d), season: r.s };
    for (const id of gameListIds(r, ctx)) {
      const def = defMap.get(id); if (!def) continue;
      const v = valueFor(def, { ...l, gs: r.gs }, ctx);
      if (v == null || (def.kind === 'game' && v <= 0)) continue;
      if (def.kind === 'age') {
        const key = `${id}:${r.p}`, prev = ageSeen.get(key);
        if (def.order === 'asc' ? !prev : true) ageSeen.set(key, { ...base, v: Math.round(v * 1000) / 1000, line: `${l.pts}/${l.reb}/${l.ast}` });
        continue;
      }
      put(id, { ...base, v: Math.round(v * 10) / 10 });
    }
    // Season accumulators.
    const sk = `${r.p}:${r.s}:${r.st}`;
    const a = seasons.get(sk) || { pid: r.p, season: r.s, st: r.st, team: r.t, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, ftm: 0, g40: 0, g30: 0, td: 0, dd: 0, rookie: ctx.rookie };
    a.gp++; for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'ftm']) a[k] += r[k];
    if (r.pts >= 40) a.g40++; if (r.pts >= 30) a.g30++;
    const t = tens(r).length; if (t >= 3) a.td++; if (t >= 2) a.dd++;
    a.team = r.t;
    seasons.set(sk, a);
    // Streaks (regular season games played, across seasons).
    if (r.st === 2) {
      const s = streak.get(r.p) || {};
      for (const [k, , test] of STREAKS) {
        const c = s[k] || { n: 0 };
        if (test(r)) { if (!c.n) { c.start = String(r.d); c.startGid = r.g; } c.n++; c.end = String(r.d); c.endGid = r.g; c.team = abbr(g, r.t); }
        else { if (c.n >= 2) put(`k:${k}:nba:2`, { pid: r.p, name: name(r.p), v: c.n, gid: c.endGid, date: c.end, start: c.start, team: c.team }); c.n = 0; }
        s[k] = c;
      }
      streak.set(r.p, s);
    }
  }
  // Open streaks at the end of the data are current streaks.
  const current = [];
  for (const [pid, s] of streak) for (const [k] of STREAKS) {
    const c = s[k]; if (!c?.n) continue;
    if (c.n >= 2) put(`k:${k}:nba:2`, { pid, name: name(pid), v: c.n, gid: c.endGid, date: c.end, start: c.start, team: c.team, active: true });
    if (c.n >= 3) current.push({ pid, key: k, n: c.n, start: c.start, end: c.end });
  }
  for (const [key, e] of ageSeen) { const id = key.slice(0, key.lastIndexOf(':')); put(id, e); }
  // Season lists (averages need 70% of the season's most games played).
  const maxGp = new Map();
  for (const a of seasons.values()) if (a.st === 2) maxGp.set(a.season, Math.max(maxGp.get(a.season) || 0, a.gp));
  for (const a of seasons.values()) {
    if (a.st !== 2) continue;
    const base = { pid: a.pid, name: name(a.pid), season: a.season, date: `${a.season}0630`, team: abbr(null, a.team) || teams.find(t => t.id === a.team)?.abbr || '', gp: a.gp };
    const qual = a.gp >= 0.7 * (maxGp.get(a.season) || 82);
    for (const [k] of SEASON) {
      const v = k === 'ppg' ? (qual ? a.pts / a.gp : null) : k === 'rpg' ? (qual ? a.reb / a.gp : null) : k === 'apg' ? (qual ? a.ast / a.gp : null) : a[k];
      if (v == null || v <= 0) continue;
      const e = { ...base, v: Math.round(v * 10) / 10, gid: `${a.pid}:${a.season}` };
      put(`s:${k}:nba:2`, e);
      if (a.rookie) put(`s:${k}:rookie:2`, e);
      put(`s:${k}:tm${a.team}:2`, e);
    }
  }
  // Team games.
  for (const g of games.values()) {
    if (g.stype !== 2 && g.stype !== 3) continue;
    for (const t of g.teams) {
      const o = g.teams.find(x => x.id !== t.id);
      const base = { team: t.abbr, teamId: t.id, opp: o?.abbr, gid: g._id, date: g.date, season: g.season, name: t.name };
      const tp = num0(String(t.stats?.tp || '').split('-')[0]);
      const vals = { pts: t.score, pts_low: t.score, tpm: tp || null, ast: num0(t.stats?.ast) || null, reb: num0(t.stats?.reb) || null, stl: num0(t.stats?.stl) || null, blk: num0(t.stats?.blk) || null,
        qtr: t.linescores?.length ? Math.max(...t.linescores.slice(0, 4)) : null, margin: t.winner && o ? t.score - o.score : null };
      for (const [k] of TEAM) {
        const v = vals[k]; if (v == null || v <= 0) continue;
        const e = { ...base, v, ...(k === 'qtr' ? { q: t.linescores.indexOf(v) + 1 } : {}) };
        put(`t:${k}:nba:${g.stype}`, e);
        if (g.stype === 2 && ['pts', 'tpm', 'qtr', 'margin'].includes(k)) put(`t:${k}:tm${t.id}:2`, e);
      }
    }
  }
  const coverage = { from: coverageFrom, firstDate: String(firstDate), lastDate: String(lastDate), lines: n, games: games.size };
  const docs = defs.filter(x => lists.get(x.id).length).map(x => ({ ...x, _id: x.id, entries: lists.get(x.id), coverage, scopeLabel: scopeLabel(x, coverage), updatedAt: new Date(),
    source: { provider: 'ESPN box scores', method: `Computed from ${n.toLocaleString('en-US')} player lines in ${games.size.toLocaleString('en-US')} verified games` } }));
  await d.collection('records').deleteMany({});
  for (let i = 0; i < docs.length; i += 200) await d.collection('records').insertMany(docs.slice(i, i + 200));
  await d.collection('meta').updateOne({ _id: 'records' }, { $set: { coverage, builtAt: new Date(), lists: docs.length, current } }, { upsert: true });
  log(`records: ${docs.length} lists from ${n} player lines in ${games.size} games (${coverage.firstDate}–${coverage.lastDate})`);
  return { lists: docs.length, coverage };
}
const num0 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ── Incremental: a newly verified game updates the lists it can enter; returns what changed. ────────────────────────
export async function applyGame(d, game, rows) {
  if (game.stype !== 2 && game.stype !== 3) return [];
  const pids = rows.map(r => r.p);
  const players = new Map((await d.collection('players').find({ _id: { $in: pids } }, { projection: { name: 1, dob: 1, country: 1, pos: 1, debut: 1 } }).toArray()).map(p => [p._id, p]));
  const meta = await d.collection('meta').findOne({ _id: 'records' });
  const firsts = new Map(); // rookies come from the player's debut year (bios); box-score history isn't kept day to day
  const abbr = tid => game.teams.find(t => t.id === tid)?.abbr || '';
  const wanted = new Map();
  for (const r of rows) {
    const p = { ...(players.get(r.p) || {}), firstSeason: firsts.get(r.p), coverageFrom: meta?.coverage?.from || 1994 };
    const ctx = playerContext(p, r);
    for (const id of gameListIds(r, ctx)) (wanted.get(id) || wanted.set(id, []).get(id)).push({ r, ctx, p });
  }
  const ids = [...wanted.keys()];
  const docs = new Map((await d.collection('records').find({ _id: { $in: ids } }).toArray()).map(x => [x._id, x]));
  const teams = await d.collection('teams').find({}).toArray();
  const defMap = new Map(definitions(teams).map(x => [x.id, x]));
  const changes = [];
  for (const [id, items] of wanted) {
    const def = docs.get(id) || defMap.get(id); if (!def) continue;
    let list = (docs.get(id)?.entries || []).filter(e => e.gid !== game._id);
    const before = list.slice();
    for (const { r, ctx, p } of items) {
      const l = { ...derive(r), gs: r.gs };
      const v = valueFor(def, l, ctx);
      if (v == null || (def.kind === 'game' && v <= 0)) continue;
      if (def.kind === 'age') {
        if (def.order === 'asc' && list.some(e => e.pid === r.p)) continue; // youngest: only a player's first time
        if (def.order === 'desc') list = list.filter(e => e.pid !== r.p || e.v > v);
      }
      const entry = { pid: r.p, name: p.name || r.p, team: abbr(r.t), opp: abbr(r.o), gid: game._id, date: String(r.d), season: r.s, v: def.kind === 'age' ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10 };
      const s = standing(before, entry.v, def.order);
      if (qualifies(list, entry.v, def.order)) list = insert(list, entry, def.order);
      if (s.state !== 'none') changes.push({ listId: id, def, entry, standing: s });
    }
    if (docs.get(id) || list.length) {
      // Lists only grow incrementally once the full rebuild has created them (it sets their coverage).
      if (docs.get(id)) await d.collection('records').updateOne({ _id: id }, { $set: { entries: list, updatedAt: new Date(), 'coverage.lastDate': String(game.date), 'coverage.games': (docs.get(id).coverage?.games || 0) + 1 } });
    }
  }
  return changes;
}
const stripDef = ({ _id, entries, updatedAt, ...rest }) => rest;

// Historical context for tonight's lines from the record book: where each line ranks in the league and franchise
// game lists (top 10 only, coverage stated). Returns Map(pid → [{ label, rank, listId }]).
export async function historyNotes(d, game, rows, { minCoverage = 5000 } = {}) {
  const out = new Map();
  if (game.stype !== 2 && game.stype !== 3) return out;
  const stats = ['pts', 'reb', 'ast', 'tpm', 'stl', 'blk'];
  const ids = [...stats.map(k => `g:${k}:nba:${game.stype}`), ...rows.flatMap(r => stats.map(k => `g:${k}:tm${r.t}:${game.stype}`))];
  const lists = new Map((await d.collection('records').find({ _id: { $in: [...new Set(ids)] }, 'coverage.games': { $gte: minCoverage } }).toArray()).map(l => [l._id, l]));
  const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  for (const r of rows) {
    for (const k of stats) {
      for (const id of [`g:${k}:nba:${game.stype}`, `g:${k}:tm${r.t}:${game.stype}`]) {
        const l = lists.get(id); if (!l || !r[k]) continue;
        const st = standing(l.entries, r[k], 'desc', game._id);
        if (!st.rank || st.rank > 10 || st.state === 'broken' || st.state === 'tied' || st.state === 'none' && st.rank > 10) continue;
        const since = l.coverage?.from ? `since ${l.coverage.from - 1}-${String(l.coverage.from % 100).padStart(2, '0')}` : '';
        const who = l.scope.kind === 'team' ? `${l.scope.teamName} history` : 'the NBA';
        const what = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'three-pointers', stl: 'steals', blk: 'blocks' }[k];
        const tie = st.ties ? 'Tied for the ' : 'The ';
        const label = `${tie}${st.rank === 1 ? '' : `${ord(st.rank)}-`}most ${what} in a ${game.stype === 3 ? 'playoff' : 'regular-season'} game in ${who} ${since}`.replace(/ +/g, ' ').trim();
        (out.get(r.p) || out.set(r.p, []).get(r.p)).push({ label, rank: st.rank, listId: id, stat: k, team: l.scope.kind === 'team' });
      }
    }
  }
  return out;
}
