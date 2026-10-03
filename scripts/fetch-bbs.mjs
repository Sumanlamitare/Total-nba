// Pulls NBA data from the Big Balls Data API into static JSON under data/ (no database).
//
// Free plan limits (https://bigballsdata.com/docs/rate-limits): 100 requests/minute and
// 250/day (500 with GitHub), daily window resets at 00:00 UTC. This script tracks its own
// usage per UTC day in data/state.json, stops at DAILY_CAP, and paces requests under the
// per-minute cap. Each run:
//   1. season leaders (1 request per stat per season; past seasons fetched once)
//   2. recent days (current season) via /v1/matches, refreshed every run until complete
//   3. historic backfill, newest first: full-season schedules, then one box score per game
//
// Files: data/index.json, data/leaders/<season>.json, data/days/<date>.json,
//        data/schedule/<startYear>.json, data/state.json, data/photos.json
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.BBS_API_KEY;
const BASE = process.env.BBS_API_BASE || 'https://api.bigballsdata.com';
const DATA = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const DAILY_CAP = +(process.env.BBS_DAILY_CAP || 450);   // leave headroom under the 500/day key limit
const MIN_GAP_MS = +(process.env.BBS_MIN_GAP_MS ?? 700);                                  // ~85 requests/minute, under the 100/minute cap
const LEADER_SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019]; // box-score era, newest first
const BACKFILL_SEASONS = [2025, 2024, 2023];
const STATS = { pts: 'pts', reb: 'reb', ast: 'ast', stl: 'stl', blk: 'blk', tpm: 'fg3m' }; // our key -> API stat
const TYPES = new Set(['Regular Season', 'Playoffs', 'PlayIn', 'Play-In', 'Play In']);

if (!KEY) { console.error('BBS_API_KEY is not set'); process.exit(1); }

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const write = (f, v) => { const p = path.join(DATA, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const utcDay = () => new Date().toISOString().slice(0, 10);
const iso = d => d.toISOString().slice(0, 10);
const seasonLabel = y => `${y}-${String(y + 1).slice(2)}`;
const startYearOf = date => { const [y, m] = date.split('-').map(Number); return m >= 8 ? y : y - 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const state = read('state.json', {});
state.usage ||= {};
if (state.usage.day !== utcDay()) state.usage = { day: utcDay(), used: 0 };
state.leaders ||= {};
state.checked ||= {};
const saveState = () => write('state.json', state);

class OutOfQuota extends Error {}
let last = 0;
async function api(p) {
  if (state.usage.used >= DAILY_CAP) throw new OutOfQuota(`daily cap ${DAILY_CAP} reached`);
  for (let attempt = 0; ; attempt++) {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    state.usage.used++;
    const r = await fetch(BASE + p, { headers: { authorization: 'Bearer ' + KEY, accept: 'application/json' } });
    if (r.status === 429) {
      const retry = +(r.headers.get('retry-after') || 60);
      if (r.headers.get('x-ratelimit-4xx-cooldown') || retry > 120 || attempt >= 2) throw new OutOfQuota(`429, retry after ${retry}s`);
      await sleep(retry * 1000);
      continue;
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${p}: ${body?.error?.message || ''}`);
    return body;
  }
}

// --- name helpers ---------------------------------------------------------------------
const NICK = n => (/Trail Blazers$/.test(n) ? 'Trail Blazers' : n.split(' ').pop());
const toInt = x => parseInt(String(x ?? '').split('-')[0], 10) || 0;

// Box score -> [playerId, name, team, opp, pts, reb, ast, stl, blk, tpm, min]
function parseBox(data) {
  const teams = data?.teams || [];
  const names = teams.map(t => NICK(t.team_name || ''));
  const rows = [];
  teams.forEach((t, ti) => {
    for (const g of t.stat_groups || []) {
      const k = g.keys || [];
      const col = name => k.findIndex(x => x === name || x.startsWith(name + '-'));
      const c = { min: col('minutes'), pts: col('points'), reb: col('rebounds'), ast: col('assists'), stl: col('steals'), blk: col('blocks'), tpm: col('threePointFieldGoalsMade') };
      for (const pl of g.players || []) {
        if (!pl.stats?.length) continue;
        const v = f => (c[f] < 0 ? 0 : toInt(pl.stats[c[f]]));
        const row = [pl.player_id, pl.name, names[ti], names[1 - ti] || '', v('pts'), v('reb'), v('ast'), v('stl'), v('blk'), v('tpm'), v('min')];
        if (row[10] || row[4] || row[5]) rows.push(row);
      }
    }
  });
  return rows;
}

// --- 1. season leaders ----------------------------------------------------------------
async function leaders() {
  const now = new Date();
  const current = startYearOf(iso(now));
  for (const y of [current, ...LEADER_SEASONS.filter(s => s !== current)]) {
    const file = `leaders/${seasonLabel(y)}.json`;
    const prev = read(file);
    const ended = y < current && prev?.complete;
    const fresh = prev && Date.now() - Date.parse(prev.updated) < 20 * 3600e3;
    if (ended || fresh) continue;
    const out = { season: seasonLabel(y), updated: now.toISOString(), complete: y < current, stats: {} };
    for (const [ours, theirs] of Object.entries(STATS)) {
      const res = await api(`/v1/nba/leaders?stat=${theirs}&season=${y}&season_type=regular&limit=5`);
      out.stats[ours] = (res.data?.leaders || []).map(l => ({ id: l.player?.id, n: l.player?.name, team: l.team?.abbreviation, v: l.value, gp: l.games_played, img: l.player?.headshot_url || null }));
    }
    if (Object.values(out.stats).some(a => a.length)) write(file, out);
    console.log(`leaders ${out.season}: ${out.stats.pts.length ? 'ok' : 'empty'}`);
  }
}

// --- day files --------------------------------------------------------------------------
function saveGame(date, game, rows) {
  const file = `days/${date}.json`;
  const d = read(file, { date, games: [], p: [] });
  d.games = d.games.filter(g => g.id !== game.id).concat(game);
  d.p = d.p.filter(r => r[11] !== game.id).concat(rows.map(r => [...r, game.id]));
  write(file, d);
}
const boxed = date => new Set((read(`days/${date}.json`)?.games || []).filter(g => g.boxed).map(g => g.id));

async function boxGame(date, game) {
  const res = await api(`/v1/live-stats/basketball/${game.id}/players`);
  const rows = parseBox(res.data);
  saveGame(date, { ...game, boxed: rows.length > 0 }, rows);
  return rows.length;
}

// --- 2. recent days (current season, by date) -----------------------------------------
async function recent() {
  const today = new Date(Date.now() - 5 * 3600e3); // US Eastern-ish date
  for (let i = 2; i >= 0; i--) {
    const date = iso(new Date(today - i * 864e5));
    if (state.checked[date] && i > 0) continue;
    const res = await api(`/v1/matches?league=nba&date=${date}&tz=America/New_York&limit=50`);
    const games = (res.data || []).filter(m => TYPES.has(m.season_type));
    const done = new Set(boxed(date));
    let pending = 0;
    for (const m of games) {
      if (done.has(m.id)) continue;
      if (m.status !== 'finished') { pending++; continue; }
      const g = { id: m.id, home: NICK(m.home?.name || ''), away: NICK(m.away?.name || ''), hs: +m.score?.home || 0, as: +m.score?.away || 0, type: m.season_type };
      await boxGame(date, g);
    }
    if (!pending && i > 0) state.checked[date] = true;
    console.log(`recent ${date}: ${games.length} games${pending ? `, ${pending} not finished` : ''}`);
  }
}

// --- 3. historic backfill ---------------------------------------------------------------
async function schedule(y) {
  const file = `schedule/${y}.json`;
  const cached = read(file);
  if (cached) return cached;
  const games = [];
  for (let offset = 0; ; offset += 200) {
    const res = await api(`/v1/nba/games?season=${y}&limit=200&offset=${offset}`);
    for (const g of res.data || []) {
      if (!TYPES.has(g.season_type)) continue;
      games.push({ id: g.match_id || g.game_id, date: g.game_date, type: g.season_type,
        home: NICK(g.home?.name || ''), away: NICK(g.away?.name || ''), hs: +g.home?.pts || 0, as: +g.away?.pts || 0 });
    }
    if (!res.data?.length || offset + 200 >= (res.pagination?.total ?? 0)) break;
  }
  games.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (games.length) write(file, games);
  console.log(`schedule ${seasonLabel(y)}: ${games.length} games`);
  return games;
}

async function backfill() {
  for (const y of BACKFILL_SEASONS) {
    const games = await schedule(y);
    const todo = games.filter(g => !boxed(g.date).has(g.id) && !(state.noBox?.[g.id]));
    console.log(`backfill ${seasonLabel(y)}: ${todo.length} of ${games.length} games left`);
    if (state.noBoxSeason?.[y]) { console.log(`  skipped: no box scores available for ${seasonLabel(y)}`); continue; }
    let empty = 0;
    for (const g of todo) {
      const { date, ...game } = g;
      if (await boxGame(date, game)) empty = 0;
      else {
        (state.noBox ||= {})[g.id] = true;
        // Don't burn quota on a season the API has no box scores for
        if (++empty >= 10) { (state.noBoxSeason ||= {})[y] = true; console.log(`  ${seasonLabel(y)}: 10 empty box scores in a row, skipping season`); break; }
      }
      if (state.usage.used % 25 === 0) saveState();
    }
  }
}

// --- index ----------------------------------------------------------------------------
function index() {
  const days = fs.existsSync(path.join(DATA, 'days')) ? fs.readdirSync(path.join(DATA, 'days')).filter(f => f.endsWith('.json')).sort() : [];
  const dates = days.map(f => f.slice(0, 10)).filter(d => read(`days/${d}.json`)?.p?.length);
  const seasons = fs.existsSync(path.join(DATA, 'leaders')) ? fs.readdirSync(path.join(DATA, 'leaders')).map(f => f.slice(0, -5)).sort().reverse() : [];
  let left = 0;
  for (const y of BACKFILL_SEASONS) for (const g of read(`schedule/${y}.json`, [])) if (!boxed(g.date).has(g.id) && !state.noBox?.[g.id]) left++;
  write('index.json', { updated: new Date().toISOString(), source: 'Big Balls Data', seasons, dates, backfillLeft: left });
  console.log(`index: ${dates.length} game days, ${seasons.length} seasons, ${left} historic games still to load`);
}

try {
  for (const step of [leaders, recent, backfill]) {
    try { await step(); } catch (e) { if (e instanceof OutOfQuota) { console.log(`stopping: ${e.message}`); break; } console.error(`${step.name} failed:`, e.message); }
  }
} finally {
  saveState();
  index();
  console.log(`requests used today (UTC): ${state.usage.used}/${DAILY_CAP}`);
}
