// A stand-in for ESPN's API, built from real (trimmed) responses, for the end-to-end tests.
import http from 'node:http';
import fs from 'node:fs';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));

export function mockEspn() {
  let base = '';
  const hits = [];
  const season = () => ({
    athletes: [
      { athlete: { id: '1966', displayName: 'LeBron James', position: { abbreviation: 'F' }, debutYear: 2003 } },
      { athlete: { id: '3992', displayName: 'James Harden', position: { abbreviation: 'G' }, debutYear: 2009 } },
    ],
  });
  const routes = [
    [/\/statistics\/byathlete/, season],
    [/\/web\/athletes\/1966\/stats$/, () => raw('stats_lebron')],
    [/\/web\/athletes\/3992\/stats$/, () => raw('stats_harden')],
    // The id scan: a player before the game's era (kept by the scan, dropped for having no 1980s-on seasons) and
    // one without a debut year.
    [/\/core\/athletes\/2$/, () => ({ displayName: 'Old Timer', debutYear: 1950 })],
    [/\/core\/athletes\/3$/, () => ({ displayName: 'No Stats Anywhere', position: { abbreviation: 'F' } })],
    [/\/site\/teams$/, () => ({ sports: [{ leagues: [{ teams: [['5', 'CLE', 'Cleveland Cavaliers'], ['10', 'HOU', 'Houston Rockets'], ['13', 'LAL', 'Los Angeles Lakers'], ['14', 'MIA', 'Miami Heat'], ['17', 'BKN', 'Brooklyn Nets'], ['20', 'PHI', 'Philadelphia 76ers'], ['25', 'OKC', 'Oklahoma City Thunder']].map(([id, abbreviation, displayName]) => ({ team: { id, abbreviation, displayName, shortDisplayName: displayName.split(' ').pop(), location: displayName.split(' ').slice(0, -1).join(' '), color: '112233', alternateColor: 'ddeeff' } })) }] }] })],
  ];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    const r = routes.find(([re]) => re.test(u.pathname));
    res.setHeader('content-type', 'application/json');
    if (!r) { res.statusCode = 404; return res.end('{"code":404}'); }
    res.end(JSON.stringify(r[1](u)));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      env: { ESPN_WEB: `${base}/web`, ESPN_CORE: `${base}/core`, ESPN_SITE: `${base}/site` },
      hits, close: () => new Promise(r => server.close(r)),
    });
  }));
}
