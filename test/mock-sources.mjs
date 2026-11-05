// Stand-ins for ESPN and NBA.com, serving real responses saved in test/fixtures (tests and local development without
// network access). tweak.summary(id, json), tweak.scoreboard(json), tweak.nba(json) let a test change what a source says.
import http from 'node:http';
import fs from 'node:fs';

const FIX = new URL('./fixtures/espn/', import.meta.url);
const raw = f => JSON.parse(fs.readFileSync(new URL(`${f}.json`, FIX)));
const has = f => fs.existsSync(new URL(`${f}.json`, FIX));

// A tiny transparent PNG for every image request (headshots, logos) — 2×2 pixels, team-neutral gray.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNkYGD4z8DAwMDEwMDAAAAZAAIB0fSWwQAAAABJRU5ErkJggg==', 'base64');

export function mockSources() {
  const hits = [];
  const tweak = { summary: null, scoreboard: null, nba: null };
  const route = u => {
    const p = u.pathname, q = u.searchParams;
    if (p.endsWith('/site/scoreboard')) {
      const d = q.get('dates');
      let j = d === '20250115' ? raw('scoreboard_20250115') : d && d !== '20261104' && d !== '20261105' ? { leagues: raw('scoreboard_today').leagues, events: [] } : raw('scoreboard_today');
      if (tweak.scoreboard) j = tweak.scoreboard(structuredClone(j), d) || j;
      return j;
    }
    if (p.endsWith('/site/summary')) {
      const id = q.get('event');
      const f = has(`summary_${id}`) ? `summary_${id}` : id === '401909922' ? 'summary_recent' : null;
      if (!f) return null;
      const j = raw(f);
      return tweak.summary ? tweak.summary(id, structuredClone(j)) || j : j;
    }
    if (p.endsWith('/site/news')) return raw('news');
    if (p.endsWith('/site/teams')) return raw('teams');
    if (/\/site\/teams\/\d+\/roster$/.test(p)) return raw('roster_13');
    if (/\/site\/teams\/\d+$/.test(p)) return raw('team_13');
    if (p.endsWith('/standings/standings')) return raw('standings');
    if (/\/web\/athletes\/\d+\/stats$/.test(p)) return q.get('seasontype') === '3' ? raw('athlete_stats_post') : raw('athlete_stats');
    if (/\/web\/athletes\/\d+\/gamelog$/.test(p)) return raw('athlete_gamelog');
    if (/\/web\/athletes\/\d+$/.test(p)) return raw('athlete');
    if (/\/core\/athletes\/\d+$/.test(p)) return { id: p.split('/').pop(), displayName: 'LeBron James', firstName: 'LeBron', lastName: 'James', dateOfBirth: '1984-12-30T08:00Z', birthPlace: { city: 'Akron', state: 'OH', country: 'USA' }, debutYear: 2003, position: { abbreviation: 'F' }, active: true };
    if (/\/core\/seasons\/\d+\/types\/2$/.test(p)) return { startDate: '2026-10-20T07:00Z', endDate: '2027-04-12T06:59Z' };
    if (/\/core\/seasons\/\d+\/types\/3$/.test(p)) return { startDate: '2027-04-17T07:00Z', endDate: '2027-06-26T06:59Z' };
    if (p.endsWith('/search')) return raw('search');
    if (p.includes('/nba/liveData/scoreboard/')) return { scoreboard: { games: [] } };
    if (p.includes('/nba/staticData/scheduleLeagueV2.json')) return { leagueSchedule: { gameDates: [] } };
    return null;
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    if (u.pathname.startsWith('/img/')) { res.setHeader('content-type', 'image/png'); return res.end(PNG); }
    let body = null;
    try { body = route(u); } catch (e) { res.statusCode = 500; return res.end(e.message); }
    if (tweak.nba && u.pathname.includes('/nba/')) body = tweak.nba(u.pathname, body) ?? body;
    res.setHeader('content-type', 'application/json');
    if (!body) { res.statusCode = 404; return res.end('{"code":404}'); }
    res.end(JSON.stringify(body));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      tweak, hits, base,
      env: { ESPN_SITE: `${base}/site`, ESPN_WEB: `${base}/web`, ESPN_CORE: `${base}/core`, ESPN_STANDINGS: `${base}/standings`, ESPN_SEARCH: `${base}/search`, NBA_CDN: `${base}/nba` },
      close: () => new Promise(r => server.close(r)),
    });
  }));
}
