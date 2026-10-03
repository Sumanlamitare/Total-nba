// Pulls NBA box scores from ESPN's free public API and writes static JSON for the site.
//   data/days/YYYY-MM-DD.json  every player line for that date
//   data/season/<label>.json   season totals leaders
//   data/index.json            dates with games, seasons, last update
// Usage: node scripts/update.mjs [--from YYYY-MM-DD] [--refresh N]   (N = recent days to refetch, default 3)
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const DAYS = path.join(DATA, 'days');
const SEASON = path.join(DATA, 'season');
const API = process.env.ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const TYPES = new Set([2, 3, 5]); // regular season, playoffs, play-in
const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const FROM = arg('--from', '2023-10-24');
const REFRESH = +arg('--refresh', 3);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TotalNBA' } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]); } }));
  return out;
}
const readJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const iso = d => d.toISOString().slice(0, 10);
const seasonOf = date => { const [y, m] = date.split('-').map(Number); const end = m >= 8 ? y + 1 : y; return `${end - 1}-${String(end).slice(2)}`; };
// US Eastern "today", so late West Coast games land on the right date
const todayET = () => iso(new Date(Date.now() - 5 * 3600e3));

// Box score -> [id, name, team, opponent, pts, reb, ast, stl, blk, tpm, min]
function parseBox(summary) {
  const teams = summary?.boxscore?.players || [];
  const names = teams.map(t => t.team?.shortDisplayName || t.team?.displayName || t.team?.abbreviation || '');
  const rows = [];
  teams.forEach((t, ti) => {
    const s = t.statistics?.[0];
    if (!s) return;
    const labels = (s.labels || s.names || []).map(x => String(x).toUpperCase());
    const keys = (s.keys || []).map(String);
    const col = (label, key) => { let i = labels.indexOf(label); if (i < 0) i = keys.findIndex(k => k.startsWith(key)); return i; };
    const c = { min: col('MIN', 'minutes'), pts: col('PTS', 'points'), reb: col('REB', 'rebounds'), ast: col('AST', 'assists'),
      stl: col('STL', 'steals'), blk: col('BLK', 'blocks'), tpm: col('3PT', 'threePointFieldGoalsMade') };
    for (const a of s.athletes || []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const v = k => { const x = a.stats[c[k]]; return c[k] < 0 || x == null ? 0 : parseInt(String(x).split('-')[0], 10) || 0; };
      const min = v('min');
      if (!min && !v('pts') && !v('reb')) continue;
      rows.push([String(a.athlete?.id || ''), a.athlete?.displayName || '?', names[ti], names[1 - ti] || '',
        ...STATS.map(v), min]);
    }
  });
  return rows;
}

async function fetchDay(date) {
  const sb = await get(`${API}/scoreboard?dates=${date.replace(/-/g, '')}&limit=100`);
  const events = (sb.events || []).filter(e => e.season?.type == null || TYPES.has(+e.season.type));
  if (!events.length) return null;
  const games = [], p = [];
  let partial = false;
  await pool(events, 4, async e => {
    const comp = e.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home') || comp.competitors?.[0] || {};
    const away = comp.competitors?.find(c => c.homeAway === 'away') || comp.competitors?.[1] || {};
    const done = !!(e.status?.type?.completed ?? comp.status?.type?.completed);
    games.push({ id: e.id, home: home.team?.shortDisplayName, away: away.team?.shortDisplayName, hs: +home.score || 0, as: +away.score || 0, done });
    if (!done) { partial = true; return; }
    try { p.push(...parseBox(await get(`${API}/summary?event=${e.id}`))); }
    catch (err) { partial = true; console.warn('summary failed', e.id, err.message); }
  });
  games.sort((a, b) => a.id.localeCompare(b.id));
  return { date, partial, games, p };
}

function buildSeason(label, days) {
  const tot = new Map();
  for (const d of days) for (const r of d.p) {
    const k = r[0] || r[1];
    const t = tot.get(k) || { id: r[0], n: r[1], g: r[2], gp: 0, s: [0, 0, 0, 0, 0, 0] };
    t.g = r[2]; t.gp++; for (let i = 0; i < 6; i++) t.s[i] += r[4 + i];
    tot.set(k, t);
  }
  const all = [...tot.values()];
  const leaders = {};
  STATS.forEach((s, i) => {
    leaders[s] = all.sort((a, b) => b.s[i] - a.s[i] || a.gp - b.gp).slice(0, 10)
      .map(t => ({ id: t.id, n: t.n, team: t.g, v: t.s[i], gp: t.gp }));
  });
  return { season: label, days: days.length, first: days[0]?.date, last: days.at(-1)?.date, leaders };
}

async function main() {
  await fs.mkdir(DAYS, { recursive: true });
  await fs.mkdir(SEASON, { recursive: true });
  const checked = new Set(await readJson(path.join(DATA, 'checked.json'), []));
  const today = todayET();
  const recent = iso(new Date(Date.parse(today) - REFRESH * 864e5));
  const todo = [];
  for (let t = Date.parse(FROM); t <= Date.parse(today); t += 864e5) {
    const date = iso(new Date(t)), m = +date.slice(5, 7);
    if (m >= 7 && m <= 9) continue; // off-season
    if (date < recent && checked.has(date)) continue;
    if (date < recent) { const d = await readJson(path.join(DAYS, date + '.json')); if (d && !d.partial) continue; }
    todo.push(date);
  }
  console.log(`fetching ${todo.length} dates`);
  let n = 0;
  await pool(todo, 3, async date => {
    try {
      const d = await fetchDay(date);
      if (d) await fs.writeFile(path.join(DAYS, date + '.json'), JSON.stringify(d));
      else if (date < recent) checked.add(date);
      if (++n % 25 === 0) console.log(`  ${n}/${todo.length}`);
    } catch (e) { console.warn('day failed', date, e.message); }
  });
  await fs.writeFile(path.join(DATA, 'checked.json'), JSON.stringify([...checked].sort()));

  const files = (await fs.readdir(DAYS)).filter(f => f.endsWith('.json')).sort();
  const bySeason = {}, dates = [];
  for (const f of files) {
    const d = await readJson(path.join(DAYS, f));
    if (!d?.p?.length) continue;
    dates.push(d.date);
    (bySeason[seasonOf(d.date)] ||= []).push(d);
  }
  const seasons = Object.keys(bySeason).sort().reverse();
  for (const s of seasons) await fs.writeFile(path.join(SEASON, s + '.json'), JSON.stringify(buildSeason(s, bySeason[s])));
  await fs.writeFile(path.join(DATA, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), seasons, dates }));
  console.log(`done: ${dates.length} game days, seasons ${seasons.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
