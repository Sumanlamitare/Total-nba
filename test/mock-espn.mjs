// A stand-in for ESPN's soccer API with the exact shapes verified against the live API (tools/probe-espn-soccer.mjs):
// scoreboard per competition per day, summary per event, plus simple crest images. Tests change what it says with
// m.put(code, event) / m.update(id, patch); the default seed is a realistic day (finished, live and upcoming matches,
// a penalty, an own goal, stoppage time, extra time, a shootout, a goalless draw, a match with missing scorers).
import http from 'node:http';

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const nyDay = t => NY.format(new Date(t)).replace(/-/g, '');

export const STATUS = {
  scheduled: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Scheduled', shortDetail: 'Scheduled' },
  first: { id: '2', name: 'STATUS_FIRST_HALF', state: 'in', completed: false, description: 'First Half', detail: "23'", shortDetail: "23'" },
  half: { id: '23', name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime', detail: 'HT', shortDetail: 'HT' },
  second: { id: '22', name: 'STATUS_SECOND_HALF', state: 'in', completed: false, description: 'Second Half', detail: "67'", shortDetail: "67'" },
  ft: { id: '28', name: 'STATUS_FULL_TIME', state: 'post', completed: true, description: 'Full Time', detail: 'FT', shortDetail: 'FT' },
  aet: { id: '45', name: 'STATUS_FINAL_AET', state: 'post', completed: true, description: 'Final Score - After Extra Time', detail: 'AET', shortDetail: 'AET' },
  pen: { id: '47', name: 'STATUS_FINAL_PEN', state: 'post', completed: true, description: 'Final Score - After Penalties', detail: 'FT-Pens', shortDetail: 'FT-Pens' },
  postponed: { id: '6', name: 'STATUS_POSTPONED', state: 'post', completed: false, description: 'Postponed', detail: 'Postponed', shortDetail: 'Postponed' },
  canceled: { id: '5', name: 'STATUS_CANCELED', state: 'post', completed: false, description: 'Canceled', detail: 'Canceled', shortDetail: 'Canceled' },
};
const TYPES = { goal: { id: '70', text: 'Goal' }, header: { id: '137', text: 'Goal - Header' }, pen: { id: '98', text: 'Penalty - Scored' }, og: { id: '97', text: 'Own Goal' }, so: { id: '104', text: 'Penalty - Scored' } };

// team: [id, name, short, abbr, color]
export function event({ id, at, home, away, status = 'scheduled', score = [null, null], goals = [], shootout = null, clock = null }, base) {
  const team = (t, side) => ({ id: t[0], uid: `s:600~t:${t[0]}`, abbreviation: t[3], displayName: t[1], shortDisplayName: t[2], name: t[2], location: t[1], color: t[4], alternateColor: 'ffffff', isActive: true, logo: `${base}/logo/${t[3]}.svg`, links: [] });
  const comp = (t, side, i) => ({ id: t[0], uid: `s:600~t:${t[0]}`, type: 'team', order: i, homeAway: side, winner: false, form: '', score: score[i] == null ? '0' : String(score[i]), ...(shootout ? { shootoutScore: shootout[i] } : {}), records: [], team: team(t, side), statistics: [] });
  const details = goals.map(g => ({ type: TYPES[g.kind || 'goal'], clock: { value: (parseInt(g.min) || 0) * 60, displayValue: g.min.replace(/\+/, "'+") }, team: { id: (g.side === 'home' ? home : away)[0] }, scoreValue: 1, scoringPlay: true, redCard: false, yellowCard: false, penaltyKick: g.kind === 'pen' || g.kind === 'so', ownGoal: g.kind === 'og', shootout: g.kind === 'so', athletesInvolved: g.player ? [{ id: String(Math.abs(hash(g.player))), displayName: g.player, shortName: g.player, team: { id: (g.kind === 'og' ? (g.side === 'home' ? away : home) : (g.side === 'home' ? home : away))[0] } }] : [] }));
  const st = STATUS[status];
  return { id, uid: `s:600~e:${id}`, date: new Date(at).toISOString().replace(/:\d\d\.\d+Z$/, 'Z'), name: `${away[1]} at ${home[1]}`, shortName: `${away[3]} @ ${home[3]}`, season: { year: 2026 },
    competitions: [{ id, uid: `s:600~e:${id}`, date: new Date(at).toISOString(), startDate: new Date(at).toISOString(), status: { clock: 0, displayClock: clock || (st.state === 'in' ? st.detail : "0'"), period: 0, type: st }, competitors: [comp(home, 'home', 0), comp(away, 'away', 1)], details }],
    status: { type: st }, links: [] };
}
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

const LEAGUES = { 'eng.1': ['700', 'English Premier League', 'Premier League', 23], 'esp.1': ['740', 'Spanish LALIGA', 'LALIGA', 15], 'uefa.champions': ['775', 'UEFA Champions League', 'UEFA Champions League', 2], 'ger.1': ['720', 'German Bundesliga', 'Bundesliga', 10], 'fra.coupe_de_france': ['3952', 'Coupe de France', 'Coupe de France', 182], 'esp.copa_del_rey': ['3951', 'Spanish Copa del Rey', 'Copa del Rey', 80], 'usa.1': ['770', 'MLS', 'MLS', 19], 'eng.w.1': ['8097', "English Women's Super League", 'WSL', 99] };

export function seed(now = Date.now()) {
  const h = 3600e3, T = {
    eve: ['368', 'Everton', 'Everton', 'EVE', '0606fa'], cov: ['388', 'Coventry City', 'Coventry', 'COV', '87cced'], ars: ['359', 'Arsenal', 'Arsenal', 'ARS', 'e20520'], che: ['363', 'Chelsea', 'Chelsea', 'CHE', '034694'],
    mun: ['360', 'Manchester United', 'Man United', 'MUN', 'da020e'], tot: ['367', 'Tottenham Hotspur', 'Spurs', 'TOT', 'ffffff'], liv: ['364', 'Liverpool', 'Liverpool', 'LIV', 'd11317'], mci: ['382', 'Manchester City', 'Man City', 'MNC', '99c5ea'],
    rma: ['86', 'Real Madrid', 'Real Madrid', 'RMA', 'ffffff'], bar: ['83', 'Barcelona', 'Barcelona', 'BAR', 'a50044'], psg: ['160', 'Paris Saint-Germain', 'PSG', 'PSG', '004170'], bmg: ['268', 'Borussia Mönchengladbach', "M'gladbach", 'BMG', '000000'],
    fre: ['126', 'SC Freiburg', 'Freiburg', 'SCF', 'e3000f'], uni: ['598', '1. FC Union Berlin', 'Union Berlin', 'FCU', 'd4011d'], nje: ['134079', 'Neuvillette-Jamin', 'Neuvillette', 'NJ', '1d4ed8'], val: ['6732', 'Valenciennes', 'Valenciennes', 'VAL', 'e11d48'],
    ath: ['93', 'Athletic Club', 'Athletic', 'ATH', 'ee2523'], bet: ['244', 'Real Betis', 'Betis', 'BET', '00954c'], lag: ['187', 'LA Galaxy', 'Galaxy', 'LA', '00245d'], sea: ['9726', 'Seattle Sounders FC', 'Seattle', 'SEA', '5d9741'],
  };
  return [
    ['eng.1', event({ id: '401001', at: now - 5 * h, home: T.eve, away: T.cov, status: 'ft', score: [3, 1], goals: [{ side: 'away', player: 'Yann Gboho', min: "52'" }, { side: 'home', player: 'Thierno Barry', min: "56'", kind: 'header' }, { side: 'home', player: 'Thierno Barry', min: "61'" }, { side: 'home', player: 'Kiernan Dewsbury-Hall', min: "90+4'", kind: 'pen' }] })],
    ['eng.1', event({ id: '401002', at: now - 4.5 * h, home: T.mun, away: T.tot, status: 'ft', score: [0, 0] })],
    ['uefa.champions', event({ id: '401003', at: now - 4 * h, home: T.bmg, away: T.psg, status: 'ft', score: [4, 6], goals: [{ side: 'away', player: 'Ousmane Dembélé', min: "3'" }, { side: 'away', player: 'Ousmane Dembélé', min: "19'" }, { side: 'home', player: 'Alassane Pléa', min: "22'" }, { side: 'away', player: 'Ousmane Dembélé', min: "45+3'", kind: 'pen' }, { side: 'home', player: 'Rani Khedira', min: "51'", kind: 'og' }, { side: 'away', player: 'Khvicha Kvaratskhelia', min: "58'" }, { side: 'home', player: 'Franck Honorat', min: "64'" }, { side: 'away', player: 'Bradley Barcola', min: "71'" }, { side: 'home', player: 'Tim Kleindienst', min: "80'" }, { side: 'away', player: 'Gonçalo Ramos', min: "90+6'" }] })],
    ['fra.coupe_de_france', event({ id: '401004', at: now - 3.6 * h, home: T.nje, away: T.val, status: 'pen', score: [2, 2], shootout: [0, 3], goals: [{ side: 'home', player: 'Mathis Lambert', min: "12'" }, { side: 'away', player: 'Ilyes Hamache', min: "40'" }, { side: 'away', player: 'Ilyes Hamache', min: "77'" }, { side: 'home', player: 'Kévin Dupont', min: "88'", kind: 'pen' }, { side: 'away', player: 'Ilyes Hamache', min: "120'", kind: 'so' }] })],
    ['esp.copa_del_rey', event({ id: '401005', at: now - 3.4 * h, home: T.ath, away: T.bet, status: 'aet', score: [2, 1], goals: [{ side: 'home', player: 'Nico Williams', min: "33'" }, { side: 'away', player: 'Isco', min: "70'", kind: 'pen' }, { side: 'home', player: 'Oihan Sancet', min: "112'" }] })],
    ['ger.1', event({ id: '401006', at: now - 3.2 * h, home: T.fre, away: T.uni, status: 'ft', score: [2, 0], goals: [{ side: 'home', player: 'Rani Khedira', min: "55'", kind: 'og' }, { side: 'home', player: null, min: "67'" }] })],
    ['eng.1', event({ id: '401007', at: now - 1 * h, home: T.ars, away: T.che, status: 'second', score: [1, 1], clock: "67'", goals: [{ side: 'home', player: 'Bukayo Saka', min: "12'" }, { side: 'away', player: 'Cole Palmer', min: "44'", kind: 'pen' }] })],
    ['esp.1', event({ id: '401008', at: now - 0.8 * h, home: T.rma, away: T.bar, status: 'half', score: [0, 1], clock: 'HT', goals: [{ side: 'away', player: 'Lamine Yamal', min: "38'" }] })],
    ['eng.1', event({ id: '401009', at: now + 2 * h, home: T.liv, away: T.mci })],
    ['usa.1', event({ id: '401010', at: now + 5 * h, home: T.lag, away: T.sea })],
    ['esp.1', event({ id: '401011', at: now + 26 * h, home: T.bar, away: T.ath })],
    ['eng.1', event({ id: '401012', at: now + 28 * h, home: T.che, away: T.eve })],
    ['ger.1', event({ id: '401013', at: now - 6 * h, home: T.uni, away: T.fre, status: 'postponed' })],
    ['eng.w.1', event({ id: '409999', at: now + 3 * h, home: T.ars, away: T.che })],
  ];
}

export async function mockEspn({ events = null } = {}) {
  let base = '';
  const store = new Map(); // id → [code, event]
  const hits = [];
  const put = (code, ev) => store.set(ev.id, [code, ev]);
  const crest = (abbr, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path d="M100 10 L180 40 L170 130 Q150 175 100 195 Q50 175 30 130 L20 40 Z" fill="#${color}" stroke="#ffffff" stroke-width="8"/><text x="100" y="122" font-size="${abbr.length > 3 ? 40 : 52}" font-family="Arial" font-weight="bold" fill="#ffffff" stroke="#000" stroke-width="2" text-anchor="middle">${abbr}</text></svg>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    const send = (code, body, type = 'application/json') => { res.statusCode = code; res.setHeader('content-type', type); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    let m;
    if ((m = u.pathname.match(/^\/logo\/(\w+)\.svg$/))) {
      const ev = [...store.values()].map(([, e]) => e.competitions[0].competitors.map(c => c.team)).flat().find(t => t.abbreviation === m[1]);
      return send(200, crest(m[1], ev?.color || '444444'), 'image/svg+xml');
    }
    if (u.pathname === '/still.png') { res.setHeader('content-type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')); }
    if ((m = u.pathname.match(/^\/league\/(\d+)\.svg$/))) return send(200, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="46" fill="#3d195b"/></svg>`, 'image/svg+xml');
    if ((m = u.pathname.match(/^\/soccer\/([\w.]+)\/scoreboard$/))) {
      const code = m[1], day = u.searchParams.get('dates');
      if (day && day.includes('-')) return send(400, { code: 400, message: 'Failed to get events endpoint.' });
      const lg = LEAGUES[code] || ['1', code, code, 1];
      const evs = [...store.values()].filter(([c, e]) => c === code && (!day || nyDay(e.date) === day)).map(([, e]) => e);
      return send(200, { leagues: [{ id: lg[0], uid: `s:600~l:${lg[0]}`, name: lg[1], abbreviation: lg[2], slug: code, logos: [{ href: `${base}/league/${lg[3]}.svg`, rel: ['full', 'default'] }] }], events: evs });
    }
    if ((m = u.pathname.match(/^\/soccer\/([\w.]+)\/summary$/))) {
      const hit = store.get(u.searchParams.get('event'));
      if (!hit) return send(404, { code: 404 });
      const e = hit[1], c = e.competitions[0];
      const keyEvents = c.details.map((x, i) => ({ id: String(i), type: { id: x.type.id, text: x.type.text, type: x.ownGoal ? 'own-goal' : x.penaltyKick ? 'penalty---scored' : 'goal' }, period: { number: 1 }, clock: x.clock, scoringPlay: x.scoringPlay, shootout: x.shootout, team: { id: x.team.id }, participants: (x.athletesInvolved || []).map(a => ({ athlete: { displayName: a.displayName } })) }));
      return send(200, { header: { competitions: [{ competitors: c.competitors.map(k => ({ id: k.id, homeAway: k.homeAway, score: k.score, shootoutScore: k.shootoutScore, team: { id: k.team.id, displayName: k.team.displayName } })), status: c.status }], league: { id: '1' } }, keyEvents: hit[1].summaryKeyEvents || keyEvents, videos: hit[1].videos || [] });
    }
    send(404, { code: 404 });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [code, ev] of (events || seed()).map(([c, e]) => [c, { ...e }])) put(code, JSON.parse(JSON.stringify(ev).replaceAll('${base}', base)));
  // Events built before the server knew its address get their image URLs now.
  for (const [, [, e]] of store) for (const c of e.competitions[0].competitors) c.team.logo = `${base}/logo/${c.team.abbreviation}.svg`;
  return {
    base, hits, store, env: { ESPN_SITE: `${base}/soccer` },
    put: (code, ev) => { for (const c of ev.competitions[0].competitors) c.team.logo = `${base}/logo/${c.team.abbreviation}.svg`; put(code, ev); },
    update(id, fn) { const [code, e] = store.get(id); store.set(id, [code, fn(e) || e]); },
    remove: id => store.delete(id),
    close: () => new Promise(r => server.close(r)),
  };
}
