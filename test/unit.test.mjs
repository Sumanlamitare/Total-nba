// Unit tests on real ESPN responses (trimmed, in test/fixtures/espn) and the real catalog snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseStats, compose, foldGamelog, scrub, statRow, isoDate, parseHonors } from '../lib/book.js';
import { foldSeason, awardRows, countHonors, finishSpans, foldCareer, publicRecord, entry, sortKey, currentSeason, leaderOf } from '../lib/catalog.js';
import { shelve, span, seasonLabel, spineOf, spineColor, inkOn, luminance, contrast, RETIRED } from '../client/src/shelves.js';
import { assignTeam, rosterAthletes } from '../lib/catalog.js';
import { localSearch } from '../client/src/search.js';
import { perSeason, byTeam, best, coverageGap } from '../client/src/bookdata.js';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const fixture = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const catalog = fixture('catalog.json');

test('statRow splits made-attempted pairs and reads numbers', () => {
  assert.deepEqual(statRow(['avgPoints', 'avgFieldGoalsMade-avgFieldGoalsAttempted', 'x'], ['27.1', '9.8-19.4', '--']),
    { avgPoints: 27.1, avgFieldGoalsMade: 9.8, avgFieldGoalsAttempted: 19.4, x: null });
});

test('parseStats: LeBron James regular season', () => {
  const s = parseStats(raw('stats_lebron'));
  assert.equal(s.rows[0].label, '2003-04');
  assert.equal(s.rows[0].team, 'CLE');
  assert.equal(s.rows[0].avg.avgPoints, 20.9);
  assert.equal(s.rows[0].tot.points, 1654);
  assert.equal(s.career.tot.points, 43440);
  assert.equal(s.first, 2004);
  assert.ok(s.seasons >= 22);
});

test('parseStats: traded seasons keep team rows and a combined row, counted once', () => {
  const s = parseStats(raw('stats_harden'));
  const y2021 = s.rows.filter(r => r.season === 2021);
  assert.deepEqual(y2021.map(r => r.combined ? 'total' : r.team), ['HOU', 'BKN', 'total']);
  assert.equal(y2021[2].avg.gamesPlayed, y2021[0].avg.gamesPlayed + y2021[1].avg.gamesPlayed);
  assert.equal(perSeason(s).filter(r => r.season === 2021).length, 1);
  assert.equal(perSeason(s).find(r => r.season === 2021).combined, true);
  // Per-team sums never double count the combined row.
  const games = byTeam(s).reduce((a, t) => a + t.games, 0);
  assert.equal(games, s.career.avg.gamesPlayed);
});

test('scrub: zeros for stats not yet recorded become null; real zeros stay', () => {
  const old = scrub({ avgSteals: 0, avgBlocks: 0, avgRebounds: 0, avgThreePointFieldGoalsMade: 0, avgPoints: 14.7, gamesStarted: 0 }, 1957, 48);
  assert.deepEqual(old, { avgSteals: null, avgBlocks: null, avgRebounds: null, avgThreePointFieldGoalsMade: null, avgPoints: 14.7, gamesStarted: null });
  const modern = scrub({ avgSteals: 0, avgThreePointFieldGoalsMade: 0, gamesStarted: 0 }, 2016, 60);
  assert.deepEqual(modern, { avgSteals: 0, avgThreePointFieldGoalsMade: 0, gamesStarted: 0 });
});

test('parseStats: a career line is blank when some seasons lack the stat', () => {
  const j = raw('stats_lebron');
  const avg = j.categories.find(c => c.name === 'averages');
  // Pretend the first season is from 1972, before steals were recorded.
  avg.statistics[0].season.year = 1972;
  const i = avg.names.indexOf('avgSteals');
  avg.statistics[0].stats[i] = '0.0';
  const s = parseStats(j);
  assert.equal(s.rows[0].avg.avgSteals, null);
  assert.equal(s.career.avg.avgSteals, null);
  assert.ok(s.career.avg.avgPoints > 0);
});

test('compose: a full book from athlete, bio and stats', () => {
  const b = compose({ id: '1966', web: raw('athlete_lebron'), bioJson: raw('bio_lebron'), reg: raw('stats_lebron'), post: raw('stats_post_lebron'), leaders: [{ season: 2008, stat: 'pts', value: 30 }] });
  assert.equal(b.name, 'LeBron James');
  assert.equal(b.born, '1984-12-30');
  assert.equal(b.debut, 2003);
  assert.ok(b.honors.length > 5);
  assert.equal(b.honors[0].key, 'mvp');
  assert.ok(b.playoffs.seasons > 10);
  assert.equal(b.leaders[0].label, '2007-08');
  assert.ok(b.teams.length >= 3);
});

test('compose: a player with no stats still gets a book (no invented numbers)', () => {
  const b = compose({ id: '2335', core: { displayName: 'Larry Bird', firstName: 'Larry', lastName: 'Bird', debutYear: '1978', position: { abbreviation: 'NA' }, dateOfBirth: '1956-12-07T08:00Z' }, bioJson: null, reg: null, post: null, awardRows: [{ season: 1984, name: 'MVP' }, { season: 1985, name: 'MVP' }] });
  assert.equal(b.regular, null);
  assert.equal(b.pos, null);
  assert.equal(b.born, '1956-12-07');
  assert.deepEqual(b.honors.map(h => [h.name, h.count]), [['MVP', 2]]);
  assert.equal(b.teams.length, 0);
});

test('isoDate reads ESPN day/month/year', () => {
  assert.equal(isoDate('17/2/1963'), '1963-02-17');
  assert.equal(isoDate(''), null);
});

test('parseHonors prefers the bio and drops other leagues', () => {
  const h = parseHonors({ awards: [{ league: 'nba', name: 'MVP', displayCount: '3x', seasons: ['1986', '1984', '1985'] }, { league: 'ncaam', name: 'Wooden Award', displayCount: '1x' }] });
  assert.deepEqual(h, [{ name: 'MVP', count: 3, seasons: [1984, 1985, 1986], key: 'mvp' }]);
});

test('foldGamelog: highs, 40-point games and preseason ignored', () => {
  const acc = { highs: { regular: {}, playoffs: {} }, games: { regular: 0, playoffs: 0 }, forty: { regular: 0, playoffs: 0 }, fifty: { regular: 0, playoffs: 0 }, tripleDoubles: { regular: 0, playoffs: 0 } };
  const n = foldGamelog(acc, 2016, raw('gamelog_lebron_2016'));
  // ESPN logs 71 of the 76 regular-season games that season; the reader reports logged games, not games played.
  assert.equal(acc.games.regular, 71);
  assert.equal(acc.games.playoffs, 21);
  assert.equal(n, 92);
  assert.equal(acc.highs.playoffs.points.value, 41);
  assert.equal(acc.highs.regular.points.games[0].season, 2016);
  assert.ok(acc.highs.regular.points.games[0].opp);
});

test('catalog: season lists, awards, spans and the public record', () => {
  const players = new Map();
  const season = { categories: [{ name: 'general', names: ['gamesPlayed'] }], athletes: [
    { athlete: { id: '1', displayName: 'Ann Able', firstName: 'Ann', lastName: 'Able', debutYear: 2014, position: { abbreviation: 'G' }, teams: [{ id: '2', abbreviation: 'BOS' }] }, categories: [{ name: 'general', values: [70] }] },
  ] };
  assert.equal(foldSeason(players, 2016, season), 1);
  foldSeason(players, 2017, { ...season, athletes: [{ ...season.athletes[0], athlete: { ...season.athletes[0].athlete, teams: [{ id: '18', abbreviation: 'NYK' }] } }] });
  const rows = awardRows(1960, { id: '33', name: 'MVP', winners: [{ athlete: { $ref: 'http://x/seasons/1960/athletes/4142?lang=en' }, team: { $ref: 'http://x/seasons/1960/teams/9' } }] });
  assert.deepEqual(rows[0], { _id: '1960-33-4142', season: 1960, award: '33', name: 'MVP', id: '4142', team: '9' });
  players.set('4142', entry({ id: '4142', name: 'Wilt Chamberlain', debut: 1959, src: 'awards' }));
  countHonors(players, rows);
  finishSpans(players, rows);
  const a = players.get('1'), w = players.get('4142');
  assert.deepEqual([a.y0, a.y1, a.g, a.t, a.ls], [2015, 2017, 140, ['BOS', 'NYK'], '18'], 'the latest season\'s team');
  assert.equal(w.la, '9', 'the team on the latest award');
  assert.deepEqual([w.y0, w.y1, w.y1min, w.h], [1960, 1960, true, { mvp: 1 }]);
  assert.deepEqual(publicRecord(w), { i: '4142', n: 'Wilt Chamberlain', l: 'Chamberlain', k: 'chamberlain wilt', y0: 1960, y1: 1960, y1m: 1, h: { mvp: 1 } });
});

test('catalog: career stats give exact spans and clear the lower-bound flag', () => {
  const p = entry({ id: '3992', name: 'James Harden', src: 'seasons' });
  p.y1 = 2000; p.y1min = true;
  assert.equal(foldCareer(p, raw('stats_harden')), true);
  assert.equal(p.y0, 2010); assert.equal(p.y1min, false);
  assert.ok(p.t.includes('OKC') && p.t.includes('HOU'));
});

test('leaderOf reads the leader value from the right column', () => {
  const l = leaderOf(2016, 'reb', { categories: [{ name: 'general', names: ['gamesPlayed', 'avgRebounds'] }], athletes: [{ athlete: { id: '9', displayName: 'X' }, categories: [{ name: 'general', values: [81, 14.78] }] }] });
  assert.deepEqual(l, { _id: '2016-reb', season: 2016, stat: 'reb', id: '9', name: 'X', value: 14.8 });
});

test('sortKey, seasons and the current season', () => {
  assert.equal(sortKey('Dončić', 'Luka'), 'doncic luka');
  assert.equal(seasonLabel(2000), '1999-00');
  assert.equal(currentSeason(new Date('2026-10-15')), 2027);
  assert.equal(currentSeason(new Date('2026-06-01')), 2026);
});

test('shelving: active players on their team\'s shelf, every retired player on one shelf, A to Z', () => {
  const players = catalog.players, teams = catalog.meta.teams || [];
  assert.ok(players.length > 5000);
  const lib = shelve(players, teams);
  const all = [...lib.retired, ...lib.teams.flatMap(t => t.books)];
  assert.equal(all.length, players.length, 'one book per player');
  assert.equal(new Set(all).size, players.length);
  assert.ok(lib.retired.every(i => !players[i].a), 'the retired shelf holds only retired players');
  for (const t of lib.teams) {
    assert.ok(t.books.every(i => players[i].a), 'team shelves hold only active players');
    if (t.id !== 'none') assert.ok(t.books.every(i => players[i].tm === t.id), `${t.name}: its own players`);
  }
  for (const list of [lib.retired, ...lib.teams.map(t => t.books)]) {
    for (let n = 1; n < list.length; n++) assert.ok(players[list[n - 1]].k <= players[list[n]].k, 'A to Z');
  }
  const named = lib.teams.filter(t => t.id !== 'none');
  assert.deepEqual(named.map(t => t.name), [...named.map(t => t.name)].sort((x, y) => x.localeCompare(y)));
  const russell = players.find(p => p.n === 'Bill Russell');
  assert.equal(lib.placeOf.get(russell.i).shelf, RETIRED);
  // Without team data every active player still has a place.
  const flat = shelve(players.slice(0, 500), []);
  assert.equal(flat.retired.length + flat.teams.reduce((n, t) => n + t.books.length, 0), 500);
});

test('team assignment: the latest team — current roster, then latest season, last-team field, latest award', () => {
  const fr = new Set(['2', '13', '25']);
  const p = { rt: '13', lg: '2', ls: '25', lt: '25', la: '2' };
  assert.equal(assignTeam(p, fr), '13'); assert.equal(p.tms, 'roster');
  const q = { rt: null, lg: '2', ls: '25', lt: '13' }; assert.equal(assignTeam(q, fr), '2'); assert.equal(q.tms, 'career');
  assert.equal(assignTeam({ ls: '25', lt: '13', la: '2' }, fr), '25');
  const r = { lt: '13', la: '2' }; assert.equal(assignTeam(r, fr), '13'); assert.equal(r.tms, 'last');
  assert.equal(assignTeam({ la: '2' }, fr), '2');
  assert.equal(assignTeam({ lg: '99' }, fr), null, 'unknown team ids are not shelved under a franchise');
});

test('team assignment: a traded season ends with the team he finished with', () => {
  const p = entry({ id: '3992', name: 'James Harden', src: 'seasons' });
  assert.equal(foldCareer(p, raw('stats_harden')), true);
  assert.equal(p.lg, '5', 'traded from the Clippers to Cleveland in 2025-26');
});

test('rosters: flat and grouped responses', () => {
  assert.deepEqual(rosterAthletes({ athletes: [{ id: '1' }, { id: '2' }] }).map(a => a.id), ['1', '2']);
  assert.deepEqual(rosterAthletes({ athletes: [{ position: 'G', items: [{ id: '3' }] }, { items: [{ id: '4' }] }] }).map(a => a.id), ['3', '4']);
  assert.deepEqual(rosterAthletes(null), []);
});

test('spine colours: the team colour, darker for earlier decades, with readable lettering', () => {
  const celtics = { color: '#008348', alt: '#ffffff' };
  const old = spineColor({ i: '1', y0: 1960 }, celtics), recent = spineColor({ i: '1', y0: 2020 }, celtics);
  assert.ok(luminance(old) < luminance(recent));
  assert.equal(inkOn('#fdb927'), '#15161a');
  assert.equal(inkOn('#0e2240'), '#f6f4ef');
});

test('spines: thickness follows career length; MVPs get gold bands; lettering is readable', () => {
  const lakers = { color: '#552583', alt: '#fdb927' };
  assert.ok(spineOf({ i: '1', y0: 2004, y1: 2026 }, lakers).w > spineOf({ i: '1', y0: 2020, y1: 2021 }, lakers).w);
  const mvp = spineOf({ i: '2', y0: 2004, y1: 2026, h: { mvp: 4, fmvp: 4 } }, lakers);
  assert.deepEqual([mvp.deco, mvp.mvp, mvp.fmvp], ['bands', 4, 4]);
  for (const p of catalog.players.slice(0, 400)) {
    const sp = spineOf(p, (catalog.meta.teams || []).find(t => t.id === p.tm));
    assert.ok(contrast(sp.fg, sp.bg) >= 3, `${p.n}: lettering stands out`);
  }
});

test('span labels', () => {
  assert.equal(span({ y0: 1985, y1: 2003 }), '1984–2003');
  assert.equal(span({ y0: 2004, y1: 2026, a: 1 }), '2003–now');
  assert.equal(span({ y0: 1957, y1: 1960, y1m: 1 }), 'from 1956');
  assert.equal(span({ y0: 2000, y1: 2000 }), '1999-00');
  assert.equal(span({}), '');
});

test('search finds legends and moderns, accents ignored', () => {
  const names = q => localSearch(catalog.players, q, 5).map(p => p.n);
  assert.equal(names('bill russell')[0], 'Bill Russell');
  assert.equal(names('wemb')[0], 'Victor Wembanyama');
  assert.ok(names('doncic').includes('Luka Doncic') || names('doncic').includes('Luka Dončić'));
  assert.equal(names('jordan michael')[0], 'Michael Jordan');
  assert.deepEqual(names('zzzzqx'), []);
});

test('every snapshot book is consistent with what the reader shows', () => {
  for (const f of fs.readdirSync(new URL('./fixtures/books/', import.meta.url)).filter(f => !f.includes('highs'))) {
    const b = fixture(`books/${f}`);
    assert.ok(b.name, f);
    if (!b.regular) continue;
    for (const r of b.regular.rows) {
      for (const v of Object.values(r.avg || {})) assert.ok(v == null || Number.isFinite(v), `${b.name} ${r.label}`);
      // No zero rebounds over a real season: those are ESPN placeholders.
      if (r.avg?.gamesPlayed >= 5) assert.notEqual(r.avg.avgRebounds, 0, `${b.name} ${r.label} rebounds`);
    }
    const bs = best(b.regular, 'avgPoints');
    if (bs) assert.ok(bs.games >= 20);
    const gap = coverageGap(b);
    if (gap) assert.ok(gap.recordFrom > gap.from);
  }
});
