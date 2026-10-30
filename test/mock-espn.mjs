// A stand-in for ESPN's API, built from real responses (test/fixtures/espn), for the end-to-end tests: the night of
// 15 January 2025 with two of its games (Knicks at 76ers in overtime, Raptors over Celtics).
import http from 'node:http';
import fs from 'node:fs';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const GAMES = ['401705127', '401705128'];

// tweak.summary(id, json) and tweak.scoreboard(json) let a test change what ESPN says (a game in progress, a stat
// correction, an incomplete box score).
export function mockEspn() {
  const hits = [];
  const tweak = { summary: null, scoreboard: null };
  const sb = raw('scoreboard_20250115');
  const night = { ...sb, events: sb.events.filter(e => GAMES.includes(String(e.id))) };
  // A postponed game on the same night doesn't keep it from being final.
  const postponed = { ...sb.events.find(e => !GAMES.includes(String(e.id))), id: '999', status: { type: { name: 'STATUS_POSTPONED', state: 'post', completed: false, shortDetail: 'Postponed' } } };
  night.events = [...night.events, postponed];
  const routes = [
    [/\/site\/scoreboard$/, u => {
      const date = u.searchParams.get('dates');
      if (!date) return { ...night, day: { date: '2025-01-15' } };
      if (date === '20250115') { const j = structuredClone(night); return tweak.scoreboard ? tweak.scoreboard(j) || j : j; }
      return { leagues: sb.leagues, events: [] };
    }],
    [/\/site\/summary$/, u => { const id = u.searchParams.get('event'); if (!GAMES.includes(id)) return null; const j = raw(`summary_${id}`); return tweak.summary ? tweak.summary(id, j) || j : j; }],
    [/\/core\/seasons\/2025\/types\/2$/, () => ({ startDate: '2024-10-22T07:00Z', endDate: '2025-04-14T06:59Z' })],
    [/\/core\/seasons\/2025\/types\/3$/, () => ({ startDate: '2025-04-19T07:00Z', endDate: '2025-06-27T06:59Z' })],
  ];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    const r = routes.find(([re]) => re.test(u.pathname));
    const body = r && r[1](u);
    res.setHeader('content-type', 'application/json');
    if (!body) { res.statusCode = 404; return res.end('{"code":404}'); }
    res.end(JSON.stringify(body));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ tweak, env: { ESPN_SITE: `${base}/site`, ESPN_CORE: `${base}/core`, ESPN_WEB: `${base}/web` }, hits, close: () => new Promise(r => server.close(r)) });
  }));
}
