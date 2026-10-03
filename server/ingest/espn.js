// ESPN's free public NBA endpoints (no key). Returns games and player box score lines for one date.
const API = process.env.ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const TYPES = new Set([2, 3, 5]); // regular season, playoffs, play-in

const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function get(url, tries = 4) {
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
export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

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
      const line = { playerId: String(a.athlete?.id || a.athlete?.displayName), name: a.athlete?.displayName || '?',
        team: names[ti], opp: names[1 - ti] || '', pts: v('pts'), reb: v('reb'), ast: v('ast'),
        stl: v('stl'), blk: v('blk'), tpm: v('tpm'), min: v('min') };
      if (line.min || line.pts || line.reb) rows.push(line);
    }
  });
  return rows;
}

export async function fetchDay(date) {
  const sb = await get(`${API}/scoreboard?dates=${date.replace(/-/g, '')}&limit=100`);
  const events = (sb.events || []).filter(e => e.season?.type == null || TYPES.has(+e.season.type));
  const games = [], lines = [];
  let partial = false;
  await pool(events, 4, async e => {
    const comp = e.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home') || comp.competitors?.[0] || {};
    const away = comp.competitors?.find(c => c.homeAway === 'away') || comp.competitors?.[1] || {};
    const done = !!(e.status?.type?.completed ?? comp.status?.type?.completed);
    const type = +(e.season?.type ?? 2);
    games.push({ _id: String(e.id), home: home.team?.shortDisplayName, away: away.team?.shortDisplayName,
      hs: +home.score || 0, as: +away.score || 0, done, type });
    if (!done) { partial = true; return; }
    try {
      for (const l of parseBox(await get(`${API}/summary?event=${e.id}`))) lines.push({ ...l, gameId: String(e.id), type });
    } catch (err) { partial = true; console.warn('summary failed', e.id, err.message); }
  });
  return { games, lines, partial };
}
