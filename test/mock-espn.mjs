// A stand-in for ESPN's API, built from real (trimmed) responses, for the end-to-end tests.
import http from 'node:http';
import fs from 'node:fs';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));

export function mockEspn() {
  let base = '';
  const hits = [];
  const season = (y, qualified) => {
    const row = (id, name, first, last, team, gp, pts, reb) => ({
      athlete: { id, displayName: name, firstName: first, lastName: last, debutYear: id === '1966' ? 2003 : 2015, position: { abbreviation: 'F' }, teams: [{ abbreviation: team }] },
      categories: [{ name: 'general', values: [gp, 30, reb] }, { name: 'offensive', values: [pts] }, { name: 'defensive', values: [1, 1] }],
    });
    const athletes = [row('1966', 'LeBron James', 'LeBron', 'James', 'CLE', 76, 25.3, 7.4), row('100', 'Ann Able', 'Ann', 'Able', y === 2016 ? 'BOS' : 'NYK', 60, 8.1, 3.2)];
    return {
      categories: [{ name: 'general', names: ['gamesPlayed', 'avgMinutes', 'avgRebounds'] }, { name: 'offensive', names: ['avgPoints'] }, { name: 'defensive', names: ['avgSteals', 'avgBlocks'] }],
      athletes: qualified ? athletes.slice(0, 1) : athletes,
    };
  };
  const routes = [
    [/\/statistics\/byathlete/, u => season(+u.searchParams.get('season'), u.searchParams.get('isqualified') === 'true')],
    [/\/web\/athletes\/1966$/, () => raw('athlete_lebron')],
    [/\/web\/athletes\/1966\/bio$/, () => raw('bio_lebron')],
    [/\/web\/athletes\/1966\/stats$/, u => (u.searchParams.get('seasontype') === '3' ? raw('stats_post_lebron') : raw('stats_lebron'))],
    [/\/web\/athletes\/1966\/gamelog$/, u => (u.searchParams.get('season') === '2016' ? raw('gamelog_lebron_2016') : { filters: [] })],
    [/\/web\/athletes\/3992\/stats$/, () => raw('stats_harden')],
    [/\/web\/athletes\/3992\/bio$/, () => raw('bio_harden')],
    [/\/core\/athletes\/3992$/, () => ({ displayName: 'James Harden', firstName: 'James', lastName: 'Harden', debutYear: '2009', active: true, position: { abbreviation: 'G' } })],
    [/\/core\/athletes\/4142$/, () => ({ displayName: 'Wilt Chamberlain', firstName: 'Wilt', lastName: 'Chamberlain', debutYear: '1959', active: false, position: { abbreviation: 'NA' } })],
    [/\/core\/athletes\/3$/, () => ({ displayName: 'Old Timer', firstName: 'Old', lastName: 'Timer', debutYear: '1950', active: false })],
    [/\/core\/athletes\/7777$/, () => ({ displayName: 'Forgotten Guard', firstName: 'Forgotten', lastName: 'Guard', debutYear: '1955', active: false, position: { abbreviation: 'G' } })],
    [/\/core\/seasons\/\d+\/awards$/, u => ({ items: u.pathname.includes('/1960/') || u.pathname.includes('/2016/') ? [{ $ref: `${base}${u.pathname}/33` }] : [] })],
    [/\/core\/seasons\/1960\/awards\/33$/, () => ({ id: '33', name: 'MVP', winners: [{ athlete: { $ref: `${base}/core/seasons/1960/athletes/4142` }, team: { $ref: `${base}/core/seasons/1960/teams/9` } }] })],
    [/\/core\/seasons\/2016\/awards\/33$/, () => ({ id: '33', name: 'MVP', winners: [{ athlete: { $ref: `${base}/core/seasons/2016/athletes/1966` } }] })],
    [/\/core3\/athletes$/, () => ({ items: [{ id: '1966', displayName: 'LeBron James', firstName: 'LeBron', lastName: 'James' }, { id: '5000001', displayName: 'Rookie Newman', firstName: 'Rookie', lastName: 'Newman' }] })],
    [/\/search$/, u => ({ results: [{ type: 'player', contents: /forgotten/i.test(u.searchParams.get('query')) ? [{ uid: 's:40~l:46~a:7777', displayName: 'Forgotten Guard' }, { uid: 's:20~l:28~a:5', displayName: 'Football Person' }] : [] }] })],
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
      env: { ESPN_WEB: `${base}/web`, ESPN_CORE: `${base}/core`, ESPN_CORE3: `${base}/core3`, ESPN_SEARCH: `${base}/search` },
      hits, close: () => new Promise(r => server.close(r)),
    });
  }));
}
