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
    [/\/web\/athletes\/1966\/stats$/, u => (u.searchParams.get('seasontype') === '3' ? raw('stats_post_lebron') : raw('stats_lebron'))],
    [/\/web\/athletes\/3992\/stats$/, u => (u.searchParams.get('seasontype') === '3' ? null : raw('stats_harden'))],
    // Awards: 2016 has LeBron's Finals MVP with Cleveland (so Cleveland are champions) and an award that doesn't count.
    [/\/core\/seasons\/\d+\/awards$/, u => ({ items: u.pathname.includes('/2016/') ? [{ $ref: `${base}/core/seasons/2016/awards/43` }, { $ref: `${base}/core/seasons/2016/awards/77` }] : [] })],
    [/\/core\/seasons\/2016\/awards\/43$/, () => ({ id: '43', name: 'Finals MVP', winners: [{ athlete: { $ref: `${base}/core/seasons/2016/athletes/1966` }, team: { $ref: `${base}/core/seasons/2016/teams/5` } }] })],
    [/\/core\/seasons\/2016\/awards\/77$/, () => ({ id: '77', name: 'Twyman-Stokes Teammate of the Year Award', winners: [{ athlete: { $ref: `${base}/core/seasons/2016/athletes/3992` }, team: { $ref: `${base}/core/seasons/2016/teams/10` } }] })],
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
    const body = r && r[1](u);
    if (!body) { res.statusCode = 404; return res.end('{"code":404}'); }
    res.end(JSON.stringify(body));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      env: { ESPN_WEB: `${base}/web`, ESPN_CORE: `${base}/core`, ESPN_SITE: `${base}/site` },
      hits, close: () => new Promise(r => server.close(r)),
    });
  }));
}
