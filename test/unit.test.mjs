// Unit tests: ESPN parsing on real responses (trimmed, in test/fixtures/espn), the rating engine, and the game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseStats, scrub, statRow } from '../lib/stats.js';
import { foldSeason, entry, sortKey, currentSeason, seasonLabel } from '../lib/catalog.js';
import { buildEras, buildDynasty, assignSlots, gameScore, ratingOf, totals, sum, decadeOf, positionOf, slotsFor, LADDER } from '../lib/dynasty.js';
import { rng, spin, eligible, fits, openSlots, fitOf, rateSeries, winProb, gameProb, seriesOdds, simulate, daily, shareText, topScorer, SLOTS } from '../client/src/game.js';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const gamePath = new URL('./fixtures/game.json', import.meta.url);

test('statRow splits made-attempted pairs and reads numbers', () => {
  assert.deepEqual(statRow(['avgPoints', 'avgFieldGoalsMade-avgFieldGoalsAttempted', 'x'], ['27.1', '9.8-19.4', '--']),
    { avgPoints: 27.1, avgFieldGoalsMade: 9.8, avgFieldGoalsAttempted: 19.4, x: null });
});

test('parseStats: LeBron James, rows by team with team ids', () => {
  const s = parseStats(raw('stats_lebron'));
  assert.equal(s.rows[0].label, '2003-04');
  assert.equal(s.rows[0].team, 'CLE');
  assert.equal(s.rows[0].teamId, '5');
  assert.equal(s.rows[0].avg.avgPoints, 20.9);
  assert.equal(s.rows[0].tot.points, 1654);
  assert.equal(s.career.tot.points, 43440);
  assert.equal(s.first, 2004);
});

test('parseStats: traded seasons keep team rows and a combined row without a team', () => {
  const s = parseStats(raw('stats_harden'));
  const y2021 = s.rows.filter(r => r.season === 2021);
  assert.deepEqual(y2021.map(r => r.combined ? 'total' : r.team), ['HOU', 'BKN', 'total']);
  assert.equal(y2021[2].teamId, null);
  assert.equal(y2021[2].avg.gamesPlayed, y2021[0].avg.gamesPlayed + y2021[1].avg.gamesPlayed);
});

test('scrub: zeros for stats not yet recorded become null; real zeros stay', () => {
  const old = scrub({ avgSteals: 0, avgBlocks: 0, avgRebounds: 0, avgThreePointFieldGoalsMade: 0, avgPoints: 14.7, gamesStarted: 0 }, 1957, 48);
  assert.deepEqual(old, { avgSteals: null, avgBlocks: null, avgRebounds: null, avgThreePointFieldGoalsMade: null, avgPoints: 14.7, gamesStarted: null });
  const modern = scrub({ avgSteals: 0, avgThreePointFieldGoalsMade: 0, gamesStarted: 0 }, 2016, 60);
  assert.deepEqual(modern, { avgSteals: 0, avgThreePointFieldGoalsMade: 0, gamesStarted: 0 });
});

test('catalog helpers: season lists, sort keys, seasons', () => {
  const players = new Map();
  assert.equal(foldSeason(players, 2016, { athletes: [{ athlete: { id: 1966, displayName: 'LeBron James', position: { abbreviation: 'F' } } }] }), 1);
  assert.deepEqual(players.get('1966'), { ...entry({ id: 1966, name: 'LeBron James', src: 'seasons' }), p: 'F' });
  assert.equal(sortKey('Dončić', 'Luka'), 'doncic luka');
  assert.equal(seasonLabel(2000), '1999-00');
  assert.equal(currentSeason(new Date('2026-10-15')), 2027);
  assert.equal(currentSeason(new Date('2026-06-01')), 2026);
});

// ---- Ratings ----------------------------------------------------------------------------------------------------
const lebron = () => parseStats(raw('stats_lebron')).rows;
const harden = () => parseStats(raw('stats_harden')).rows;
const players = new Map([['1966', { _id: '1966', n: 'LeBron James', p: 'F' }], ['3992', { _id: '3992', n: 'James Harden', p: 'G' }]]);
const franchises = new Set(['5', '14', '13', '10', '25', '17', '20', '12']);

test('decades and game score', () => {
  assert.equal(decadeOf(1990), 1980);
  assert.equal(decadeOf(1991), 1990);
  assert.equal(decadeOf(2020), 2010);
  const t = sum([totals(lebron().find(r => r.season === 2013))]);
  const g = gameScore(t);
  assert.ok(g > 20 && g < 30, `game score ${g}`);
  assert.equal(ratingOf(0), 60);
  assert.equal(ratingOf(100), 99);
});

test('player-eras: one per franchise and decade, rated from that stretch only', () => {
  const eras = buildEras(players, new Map([['1966', lebron()], ['3992', harden()]]), franchises);
  const of = (team, decade, id) => eras.find(e => e.team === team && e.decade === decade)?.players.find(p => p.i === id);
  const mia = of('14', 2010, '1966');
  assert.ok(mia && mia.ovr >= 90, `LeBron MIA ${mia?.ovr}`);
  assert.equal(mia.from, 2011); assert.equal(mia.to, 2014);
  assert.ok(mia.ppg > 25 && mia.ppg < 28);
  const okc = of('25', 2000, '3992');
  const hou = of('10', 2010, '3992');
  assert.ok(okc.ovr < hou.ovr, 'rookie Harden rates below MVP Harden');
  // Combined (traded) rows never count.
  assert.ok(eras.every(e => e.players.every(p => p.gp >= 25)));
});

test('positions: listed role blended with the numbers', () => {
  assert.deepEqual(slotsFor('F', { rpg: 6.3, apg: 12.2, bpg: 0.5 }), ['PG', 'SG'], 'Magic Johnson runs the point');
  assert.deepEqual(slotsFor('', { rpg: 6.7, apg: 2.6, bpg: 1.2 }), ['PF', 'C']);
  assert.deepEqual(slotsFor('C', { rpg: 12.7, apg: 3.7, bpg: 2.8 }), ['PF', 'C']);
  assert.deepEqual(slotsFor('F', { rpg: 8, apg: 7.3, bpg: 0.9 }), ['SF', 'PF']);
  assert.ok(positionOf('G', { rpg: 1.3, apg: 2.3, bpg: 0 }) < 2);
  const five = [5, 1.2, 3.1, 2.2, 4].map((x, k) => ({ n: `p${k}`, x }));
  assert.deepEqual(assignSlots(five).map(p => p.n), ['p1', 'p3', 'p2', 'p4', 'p0']);
});

test('dynasty: the named starting five, rated on that season', () => {
  const entryHeat = { ...LADDER.find(x => x.key === 'mia13') };
  const d = buildDynasty(entryHeat, '14', players, new Map([['1966', lebron()], ['3992', harden()]]));
  // Only LeBron of the five is in the fixture, so the others are filled by whoever played; with one player there
  // aren't five, so no dynasty.
  assert.equal(d, null);
  const many = new Map([['1966', lebron()]]);
  const pl = new Map(players);
  for (let k = 0; k < 5; k++) {
    const id = `x${k}`;
    pl.set(id, { _id: id, n: `Bench ${k}`, p: 'G' });
    many.set(id, [{ season: 2013, teamId: '14', combined: false, avg: { gamesPlayed: 60, avgMinutes: 20 - k, avgPoints: 8 } }]);
  }
  const d2 = buildDynasty(entryHeat, '14', pl, many);
  assert.equal(d2.five.length, 5);
  assert.equal(d2.five[2].n, 'LeBron James');
  assert.equal(d2.five[2].slot, 'SF');
  assert.ok(d2.missing.includes('Dwyane Wade'));
});

// ---- Game rules -------------------------------------------------------------------------------------------------
const P = (i, ovr, slots, extra = {}) => ({ i, n: `Player ${i}`, ovr, slots, ppg: 15, rpg: 5, apg: 3, ...extra });
const eraA = { key: 'a', team: '1', decade: 1990, players: [P('1', 90, ['PG', 'SG']), P('2', 80, ['C'])] };
const eraB = { key: 'b', team: '2', decade: 2000, players: [P('3', 85, ['C'])] };

test('rng: seeded streams repeat', () => {
  const a = rng('daily:2026-10-19'), b = rng('daily:2026-10-19'), c = rng('daily:2026-10-20');
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every(x => x >= 0 && x < 1));
});

test('draft: spins only land on eras with someone who fits an open spot', () => {
  const lineup = { C: P('9', 70, ['C']) };
  assert.deepEqual(openSlots(lineup), ['PG', 'SG', 'SF', 'PF']);
  assert.deepEqual(eligible(eraB, lineup), []);
  assert.deepEqual(eligible(eraA, lineup).map(p => p.i), ['1']);
  assert.deepEqual(fits(eraA.players[0], lineup), ['PG', 'SG']);
  const r = rng('x');
  for (let k = 0; k < 20; k++) assert.equal(spin([eraA, eraB], lineup, r).key, 'a');
  assert.equal(spin([eraB], lineup, r), null);
  // A player already signed can't be signed again from another era.
  assert.deepEqual(eligible({ players: [P('9', 70, ['PF'])] }, lineup), []);
});

test('fit: the bonus, the penalties and same-era chemistry', () => {
  const handler = P('h', 80, ['PG'], { apg: 8, tpm: 2 });
  const shooter = P('s', 80, ['SG'], { tpm: 2.5 });
  const wing = P('w', 80, ['SF'], { tpm: 0.3 });
  const big = P('b', 80, ['PF'], { tpm: 0, bpg: 0.5 });
  const rim = P('r', 80, ['C'], { bpg: 2.4, p: 'C' });
  assert.deepEqual(fitOf([handler, shooter, wing, big, rim]).map(f => f.value), [2]);
  // Three-pointers weren't recorded: free throws stand in for shooting, rebounds for rim protection.
  const old = [P('1', 80, ['PG'], { apg: 9, tpm: null, ftp: 85 }), P('2', 80, ['SG'], { tpm: null, ftp: 88 }), wing, big, P('5', 80, ['C'], { bpg: null, rpg: 13 })];
  assert.deepEqual(fitOf(old).map(f => f.value), [2]);
  const centers = [rim, { ...rim, i: 'r2' }, { ...rim, i: 'r3' }, handler, shooter];
  assert.ok(fitOf(centers).some(f => f.value === -3 && /centers/.test(f.label)));
  const noPG = [shooter, wing, big, rim, { ...wing, i: 'w2' }].map(p => ({ ...p, apg: 2 }));
  assert.ok(fitOf(noPG).some(f => f.value === -3 && /offense/.test(f.label)));
  const era = [handler, shooter, wing, big, rim].map((p, k) => ({ ...p, decade: k < 3 ? 1990 : 2000 }));
  assert.ok(fitOf(era).some(f => f.value === 1));
});

const lineupOf = (ovr, extra = {}) => Object.fromEntries(SLOTS.map((s, k) => [s, P(`${s}${ovr}${extra.tag || ''}`, ovr, [s], { apg: s === 'PG' ? 6 : 2, ...extra })]));

test('rating: average, fit and matchup wins', () => {
  const r = rateSeries(lineupOf(85), lineupOf(80));
  assert.equal(r.matchups.filter(m => m.winner === 'mine').length, 5);
  assert.equal(r.mine.base, 85);
  assert.equal(r.mine.boost, 2.5);
  assert.equal(r.theirs.boost, 0);
  assert.equal(r.mine.rating, 85 + 2.5 + r.mine.fit.reduce((s, f) => s + f.value, 0));
});

test('odds: even 50%, +5 about 65%, -10 about 22-25%; home court and a wilder Game 7', () => {
  assert.equal(winProb(0), 0.5);
  assert.ok(Math.abs(winProb(5) - 0.65) < 0.01);
  assert.ok(winProb(-10) > 0.2 && winProb(-10) < 0.26);
  assert.ok(gameProb(0, 0) < 0.5 && gameProb(0, 2) > 0.5, 'dynasty home in Game 1, you in Game 3');
  assert.ok(Math.abs(gameProb(20, 6) - 0.5) < Math.abs(gameProb(20, 4) - 0.5), 'Game 7 is closer to a coin flip');
  assert.ok(seriesOdds(0) < 0.5, 'home court makes an even series a little worse than even');
  assert.ok(seriesOdds(10) > 0.85 && seriesOdds(-10) < 0.15);
});

test('series: best of seven, winners outscore losers, box scores add up, headlines every game', () => {
  const mine = lineupOf(85), theirs = lineupOf(85, { tag: 't' });
  let wins = 0;
  for (let k = 0; k < 200; k++) {
    const s = simulate({ mine, theirs, gap: 3, names: { mine: 'Your Five', theirs: 'Bulls' }, seed: `t${k}` });
    assert.ok(s.games.length >= 4 && s.games.length <= 7);
    assert.ok((s.w === 4) !== (s.l === 4));
    assert.equal(s.won, s.w === 4);
    for (const g of s.games) {
      assert.equal(g.won, g.mine.total > g.theirs.total);
      for (const side of [g.mine, g.theirs]) {
        assert.equal(side.rows.reduce((a, r) => a + r.pts, 0) + side.bench, side.total);
        assert.ok(side.bench >= 0);
        assert.ok(side.rows.every(r => r.pts >= 0));
      }
      assert.ok(g.headline.length > 5);
      assert.ok(topScorer(g.mine).pts >= 0);
    }
    if (s.won) wins++;
  }
  assert.ok(wins > 90 && wins < 160, `a +3 team wins most series: ${wins}/200`);
  // The same seed gives the same series.
  const a = simulate({ mine, theirs, gap: 0, names: { mine: 'A', theirs: 'B' }, seed: 'same' });
  const b = simulate({ mine, theirs, gap: 0, names: { mine: 'A', theirs: 'B' }, seed: 'same' });
  assert.deepEqual(a, b);
});

test('daily: everyone gets the same opponent and seed for a day', () => {
  const ds = LADDER.map(x => ({ ...x }));
  assert.deepEqual(daily(ds, '2026-10-19'), daily(ds, '2026-10-19'));
  const seen = new Set(Array.from({ length: 40 }, (_, k) => daily(ds, `2026-11-${String(k % 28 + 1).padStart(2, '0')}`).dynasty.key));
  assert.ok(seen.size >= 4);
});

test('share text: result, games and lineup', () => {
  const mine = lineupOf(85);
  const s = simulate({ mine, theirs: lineupOf(80, { tag: 't' }), gap: 6, names: { mine: 'Your Five', theirs: 'Bulls' }, seed: 's' });
  const text = shareText({ lineup: mine, eraOf: () => 'CHI \'90s', dynasty: { label: "'96 Bulls" }, series: s, rating: 87.5, daily: '2026-10-19' });
  assert.match(text, /Beat the Dynasty · Daily 2026-10-19/);
  assert.match(text, /'96 Bulls/);
  assert.equal(text.split('\n').length, 3 + 5);
});

// ---- The real data snapshot (test/fixtures/game.json) ----------------------------------------------------------
test('snapshot: every era rated 60-99 and playable, the ladder complete', { skip: !fs.existsSync(gamePath) && 'no snapshot' }, () => {
  const g = JSON.parse(fs.readFileSync(gamePath));
  assert.equal(g.teams.length, 30);
  assert.equal(g.dynasties.length, LADDER.length);
  assert.ok(g.eras.length >= 140);
  for (const e of g.eras) for (const p of e.players) {
    assert.ok(p.ovr >= 60 && p.ovr <= 99, `${p.n} ${p.ovr}`);
    assert.ok(p.slots.length === 2 && p.slots.every(s => SLOTS.includes(s)));
    assert.ok(p.gp >= 25);
  }
  for (const d of g.dynasties) {
    assert.deepEqual(d.five.map(p => p.slot), SLOTS);
    assert.equal(new Set(d.five.map(p => p.i)).size, 5);
  }
  const bulls = g.dynasties.find(d => d.key === 'chi96');
  assert.ok(bulls.five.some(p => p.n === 'Michael Jordan' && p.ovr >= 90));
});
