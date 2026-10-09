// ESPN's free public NBA API: no key, no published rate limit, works from cloud servers.
// scoreboard?dates=YYYYMMDD lists a day's games; summary?event=ID has the full box score.
const BASE = process.env.ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
// ESPN's web endpoint has full player box scores for some games where the main API's summary is empty
const WEB = process.env.ESPN_API ? null : 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=';
const TYPE = { 2: 'Regular Season', 3: 'Playoffs', 5: 'PlayIn' }; // 1 preseason and 4 All-Star are skipped

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TotalNBA' } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(800 * 2 ** i);
    }
  }
}
export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
// NBA franchises past and present (ESPN short names). A game where neither side is one of these is an
// exhibition — All-Star, Rising Stars, celebrity game — which ESPN files as "regular season".
export const FRANCHISES = new Set(['Hawks', 'Celtics', 'Nets', 'Hornets', 'Bobcats', 'Bulls', 'Cavaliers', 'Mavericks', 'Nuggets', 'Pistons',
  'Warriors', 'Rockets', 'Pacers', 'Clippers', 'Lakers', 'Grizzlies', 'Heat', 'Bucks', 'Timberwolves', 'Pelicans', 'Knicks', 'Thunder',
  'Magic', '76ers', 'Suns', 'Trail Blazers', 'Kings', 'Spurs', 'Raptors', 'Jazz', 'Wizards', 'Bullets', 'SuperSonics']);
export const isExhibition = (home, away) => !FRANCHISES.has(home) && !FRANCHISES.has(away);
export const NICK = t => t?.shortDisplayName || (t?.displayName || '').split(' ').pop() || t?.abbreviation || '';

// Box score -> player lines
export function parseBox(summary) {
  const teams = summary?.boxscore?.players || [];
  const names = teams.map(t => NICK(t.team));
  const rows = [];
  teams.forEach((t, ti) => {
    const s = t.statistics?.[0];
    if (!s) return;
    const labels = (s.labels || s.names || []).map(x => String(x).toUpperCase());
    const keys = (s.keys || []).map(String);
    const col = (label, key) => { let i = labels.indexOf(label); if (i < 0) i = keys.findIndex(k => k.startsWith(key)); return i; };
    const c = { min: col('MIN', 'minutes'), pts: col('PTS', 'points'), reb: col('REB', 'rebounds'), ast: col('AST', 'assists'),
      stl: col('STL', 'steals'), blk: col('BLK', 'blocks'), tpm: col('3PT', 'threePointFieldGoalsMade'),
      fgm: col('FG', 'fieldGoalsMade'), ftm: col('FT', 'freeThrowsMade'), tov: col('TO', 'turnovers'), pf: col('PF', 'fouls') };
    for (const a of s.athletes || []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const v = k => { const x = a.stats[c[k]]; return c[k] < 0 || x == null ? 0 : parseInt(String(x).split('-')[0], 10) || 0; };
      const id = a.athlete?.id ? String(a.athlete.id) : null;
      // FG is "made-attempted" and includes threes, so 2PM = FGM - 3PM
      const row = { playerId: id, espnId: id, name: a.athlete?.displayName || '?', team: names[ti], opp: names[1 - ti] || '',
        pts: v('pts'), reb: v('reb'), ast: v('ast'), stl: v('stl'), blk: v('blk'), tpm: v('tpm'),
        fg2m: Math.max(0, v('fgm') - v('tpm')), ftm: v('ftm'), tov: v('tov'), pf: v('pf'), min: v('min') };
      if (row.min || row.pts || row.reb) rows.push(row);
    }
  });
  return rows;
}

// Player lines for one game: main API first, web endpoint when the main one has no players
export async function fetchBox(id) {
  const rows = parseBox(await get(`${BASE}/summary?event=${id}`));
  if (rows.length || !WEB) return rows;
  return fetchWebBox(id).catch(() => []);
}
export async function fetchWebBox(id) {
  if (!WEB) return [];
  const r = await fetch(WEB + id, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
  if (!r.ok) throw new Error(`web ${r.status}`);
  return parseBox(await r.json());
}
// the NBA Cup championship game (not the quarterfinals or semifinals) is left out of regular-season stats
export const isCupFinal = notes => /cup/i.test(notes) && /(championship|\bfinal\b)/i.test(notes) && !/(quarter|semi)/i.test(notes);

// One date: its games, and box score lines for every finished game not in `skip`
export async function fetchDay(date, skip = new Set()) {
  const sb = await get(`${BASE}/scoreboard?dates=${date.replace(/-/g, '')}&limit=100`);
  const events = (sb.events || []).filter(e => TYPE[+(e.season?.type ?? 2)]);
  const games = [];
  let pending = 0;
  await pool(events, 4, async e => {
    const comp = e.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home') || comp.competitors?.[0] || {};
    const away = comp.competitors?.find(c => c.homeAway === 'away') || comp.competitors?.[1] || {};
    const done = !!(e.status?.type?.completed ?? comp.status?.type?.completed);
    const notes = (comp.notes || []).map(n => n.headline || '').join(' ');
    // the NBA Cup championship game doesn't count in regular-season stats
    const type = isCupFinal(notes) ? 'Cup Final' : TYPE[+(e.season?.type ?? 2)];
    const game = { id: String(e.id), home: NICK(home.team), away: NICK(away.team), hs: +home.score || 0, as: +away.score || 0,
      type, seasonYear: +e.season?.year || null, done };
    if (isExhibition(game.home, game.away)) return;
    if (done && !game.hs && !game.as) return; // placeholder for a game that was never played
    if (!done) { pending++; games.push({ game, rows: null }); return; }
    if (skip.has(game.id)) return;
    games.push({ game, rows: await fetchBox(e.id) });
  });
  return { games, total: events.length, pending };
}
