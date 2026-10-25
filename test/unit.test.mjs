// Unit tests: reading ESPN's game summaries (real, in test/fixtures/espn) and the performance score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameOf, linesOf, pointsOffTurnovers, garbageTime, decidedWithout, gameScore, trueShooting, winProbabilityAdded, clutchPoints, milestonesOf, scorePerformance, scoreGame, rank, strength, parseRecord, stageOf, STAGE, MIN_MINUTES } from '../lib/night.js';
import { seasonLabel, isDate, ymd } from '../lib/nights.js';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const knicks = raw('summary_401705127'), raptors = raw('summary_401705128');
const L = o => ({ min: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, oreb: 0, dreb: 0, pf: 0, pm: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, ...o });

test('a game: teams, score, overtime, records, stage', () => {
  const g = gameOf(knicks);
  assert.equal(g.completed, true);
  assert.equal(g.ot, 1);
  assert.equal(g.stage, 'regular');
  assert.equal(g.season, 2025);
  const ny = g.teams.find(t => t.abbr === 'NY'), phi = g.teams.find(t => t.abbr === 'PHI');
  assert.deepEqual([ny.score, ny.winner, ny.home, phi.home], [125, true, false, true]);
  assert.deepEqual(phi.record, { w: 15, l: 24 });
});

test('box score lines: only players who played, made-attempted split', () => {
  const lines = linesOf(knicks);
  const brunson = lines.find(p => p.name === 'Jalen Brunson');
  assert.deepEqual(brunson.line, { min: 45, pts: 38, reb: 5, ast: 4, stl: 2, blk: 0, to: 5, oreb: 1, dreb: 4, pf: 1, pm: 7, fgm: 14, fga: 22, tpm: 3, tpa: 6, ftm: 7, fta: 9 });
  assert.equal(brunson.team, '18');
  assert.ok(!lines.some(p => p.name === 'Matt Ryan'), 'did not play');
  assert.ok(Math.abs(gameScore(brunson.line) - 28.7) < 0.05);
  assert.ok(Math.abs(trueShooting(brunson.line) - 0.73) < 0.01);
});

test('opponent strength comes from the record before the game, pulled toward .500', () => {
  assert.deepEqual(parseRecord('27-15'), { w: 27, l: 15 });
  assert.equal(strength(null), 0.5);
  assert.ok(Math.abs(strength({ w: 27, l: 15 }, true) - 31 / 51) < 1e-9, 'this win taken out, 5-5 prior');
  assert.ok(strength({ w: 1, l: 0 }, true) === 0.5, 'one game tells little');
  assert.ok(strength({ w: 60, l: 10 }, false) > 0.8);
});

test('win probability added: credit adds up to the swing, from each player\'s side', () => {
  const g = gameOf(knicks), lines = linesOf(knicks);
  const w = winProbabilityAdded(knicks, g.teams.find(t => t.home).id, new Map(lines.map(p => [p.id, p.team])));
  const of = n => w.get(lines.find(p => p.name === n).id);
  assert.ok(of('Jalen Brunson') > 0.25, 'the winning team\'s star added the most');
  assert.ok(of('Paul George') < 0);
  const ny = lines.filter(p => p.team === '18').reduce((s, p) => s + (w.get(p.id) || 0), 0);
  assert.ok(ny > 0.5 && ny < 2, `the winners' total: ${ny}`);
  assert.equal(winProbabilityAdded({ plays: knicks.plays, winprobability: [] }, '20'), null);
});

test('clutch points when there is no win probability: last five minutes, within five', () => {
  const plays = [
    { period: { number: 4 }, clock: { displayValue: '4:10' }, scoringPlay: true, scoreValue: 3, participants: [{ athlete: { id: 'a' } }], homeScore: 100, awayScore: 99 },
    { period: { number: 4 }, clock: { displayValue: '3:00' }, scoringPlay: true, scoreValue: 2, participants: [{ athlete: { id: 'b' } }], homeScore: 100, awayScore: 101 },
    { period: { number: 3 }, clock: { displayValue: '1:00' }, scoringPlay: true, scoreValue: 3, participants: [{ athlete: { id: 'c' } }], homeScore: 60, awayScore: 60 },
  ];
  // The first basket comes when the game is 97-99 (the score before it), so it counts.
  const c = clutchPoints({ plays: [{ homeScore: 97, awayScore: 99, period: { number: 4 }, clock: { displayValue: '5:00' } }, ...plays] });
  assert.deepEqual(Object.fromEntries(c), { a: 3, b: 2 });
});

test('milestones', () => {
  const keys = l => milestonesOf(L(l)).map(m => m.k);
  assert.deepEqual(keys({ pts: 41 }), ['40']);
  assert.deepEqual(keys({ pts: 62 }), ['60']);
  assert.deepEqual(keys({ pts: 12, reb: 11, ast: 10 }), ['td']);
  assert.deepEqual(keys({ pts: 22, reb: 21 }), ['dd', '2020']);
  assert.deepEqual(keys({ pts: 10, reb: 10, ast: 10, stl: 10 }), ['qd', 'stocks']);
  assert.deepEqual(keys({ pts: 9, reb: 6, ast: 5, stl: 5, blk: 5 }), ['5x5', 'stocks']);
  assert.deepEqual(keys({ pts: 30, fgm: 12, fga: 12 }), ['perfect']);
  assert.deepEqual(keys({ pts: 33, tpm: 10 }), ['3s']);
});

const game = (over = {}) => ({ id: 'g', ot: 0, stage: 'regular', teams: [{ id: 'A', home: true, winner: true, record: { w: 20, l: 20 } }, { id: 'B', home: false, winner: false, record: { w: 20, l: 20 } }], ...over });
const P = l => ({ id: 'p', team: 'A', line: L(l) });

test('the score: production, efficiency, impact, result, opponent, breakout, stage', () => {
  const base = scorePerformance(P({ pts: 30, fgm: 11, fga: 20, ftm: 6, fta: 7, reb: 6, ast: 5, pm: 10 }), { game: game() });
  const k = Object.fromEntries(base.parts.map(p => [p.k, p.value]));
  assert.ok(k.production > 20 && k.efficiency > 0 && k.impact === 1.2 && k.result === 2.5);
  // A loss drops the result; a road win and overtime add to it.
  const loss = scorePerformance({ ...P({ pts: 30, fgm: 11, fga: 20 }), team: 'B' }, { game: game() });
  assert.ok(!loss.parts.some(p => p.k === 'result'));
  const road = scorePerformance({ ...P({ pts: 30, fgm: 11, fga: 20 }), team: 'B' }, { game: game({ ot: 2, teams: [{ id: 'A', home: true, winner: false }, { id: 'B', home: false, winner: true }] }) });
  assert.equal(road.parts.find(p => p.k === 'result').label, 'Win on the road in 2OT');
  // A better opponent makes the same line worth more.
  const strong = scorePerformance(P({ pts: 30, fgm: 11, fga: 20 }), { game: game({ teams: [{ id: 'A', home: true, winner: true }, { id: 'B', home: false, winner: false, record: { w: 50, l: 12 } }] }) });
  const weak = scorePerformance(P({ pts: 30, fgm: 11, fga: 20 }), { game: game({ teams: [{ id: 'A', home: true, winner: true }, { id: 'B', home: false, winner: false, record: { w: 10, l: 52 } }] }) });
  assert.ok(strong.score > weak.score + 2);
  // Far above his own average: a breakout.
  const brk = scorePerformance(P({ pts: 35, fgm: 13, fga: 20 }), { game: game(), seasonAvg: 8 });
  assert.ok(brk.parts.some(p => p.k === 'breakout') && brk.tags.includes('Breakout'));
  // The playoffs weigh more, the Finals most.
  const fin = scorePerformance(P({ pts: 30, fgm: 11, fga: 20 }), { game: game({ stage: 'finals' }) });
  const reg = scorePerformance(P({ pts: 30, fgm: 11, fga: 20 }), { game: game() });
  assert.ok(Math.abs(fin.score - reg.score * STAGE.finals.mult) < 0.2);
  // The parts always add up to the score.
  for (const s of [base, road, strong, brk, fin]) assert.ok(Math.abs(s.parts.reduce((a, p) => a + p.value, 0) - s.score) < 0.15);
});

test('points off turnovers: traced to the other team\'s next possession', () => {
  const lines = linesOf(knicks);
  const t = pointsOffTurnovers(knicks, new Map(lines.map(p => [p.id, p.team])));
  // Every turnover in the box score is found in the play-by-play.
  for (const p of lines.filter(x => x.line.to)) assert.equal(t.get(p.id)?.turnovers, p.line.to, p.name);
  assert.equal(t.get(lines.find(p => p.name === 'Jalen Brunson').id).points, 9);
  // A made-up sequence: a turnover, the other team scores 2 + 1 free throw, then his team rebounds; a later turnover
  // leads to nothing.
  const play = (team, type, extra = {}) => ({ team: { id: team }, type: { text: type }, period: { number: 1 }, ...extra });
  const plays = [
    play('A', 'Bad Pass\nTurnover', { participants: [{ athlete: { id: 'a1' } }] }),
    play('B', 'Driving Layup Shot', { scoringPlay: true, scoreValue: 2 }),
    play('A', 'Shooting Foul'),
    play('B', 'Free Throw - 1 of 1', { scoringPlay: true, scoreValue: 1 }),
    play('A', 'Jump Shot'),
    play('B', 'Jump Shot', { scoringPlay: true, scoreValue: 3 }),
    play('A', 'Traveling', { participants: [{ athlete: { id: 'a1' } }] }),
    play('A', 'Jump Shot', { scoringPlay: true, scoreValue: 2 }),
  ];
  assert.deepEqual(pointsOffTurnovers({ plays }, new Map([['a1', 'A']])).get('a1'), { turnovers: 2, points: 3 });
});

test('a loss: no result bonus, no penalty for the result; negative win probability not held against him', () => {
  const g = game({ teams: [{ id: 'A', home: true, winner: true, score: 110 }, { id: 'B', home: false, winner: false, score: 107 }] });
  const loser = { ...P({ pts: 40, fgm: 15, fga: 26, ftm: 8, fta: 9 }), team: 'B' };
  const wpa = new Map([['p', -0.3]]);
  const s = scorePerformance(loser, { game: g, wpa });
  assert.ok(!s.parts.some(p => p.k === 'clutch'), 'his team\'s chances ending at zero aren\'t counted');
  assert.equal(s.parts.find(p => p.k === 'result').value, 1, 'a close loss he kept competitive');
  const blowout = scorePerformance(loser, { game: game({ teams: [{ id: 'A', home: true, winner: true, score: 130 }, { id: 'B', home: false, winner: false, score: 100 }] }), wpa });
  assert.ok(!blowout.parts.some(p => p.k === 'result'));
  assert.ok(blowout.score > 30, 'a 40-point game still scores highly');
  // The same game in a win scores more, but not by a different league.
  const win = scorePerformance({ ...loser, team: 'A' }, { game: g, wpa: new Map([['p', 0.3]]) });
  assert.ok(win.score > s.score && win.score - s.score < 10);
  // Points given away off turnovers.
  const gv = scorePerformance(loser, { game: g, giveaways: new Map([['p', { turnovers: 4, points: 9 }]]) });
  assert.equal(gv.parts.find(p => p.k === 'giveaways').value, -3.6);
});

test('garbage time: stats after the game was decided', () => {
  // A blowout: A leads by 22 with 1:40 left (win probability 99.9%); then a close game: B up 4 with 10 seconds left
  // (also 99%+, but not a 15-point lead, so clutch free throws are not padding).
  const pl = (id, team, type, text, extra = {}) => ({ id, team: { id: team }, type: { text: type }, text, period: { number: 4 }, clock: { displayValue: '1:40' }, ...extra });
  const blowout = {
    winprobability: [{ playId: '1', homeWinPercentage: 0.999 }, { playId: '2', homeWinPercentage: 0.999 }, { playId: '3', homeWinPercentage: 0.999 }, { playId: '4', homeWinPercentage: 0.999 }],
    plays: [
      pl('1', 'A', 'Jump Shot', 'a1 makes 18-foot jumper', { homeScore: 112, awayScore: 90, scoringPlay: true, scoreValue: 2, participants: [{ athlete: { id: 'a0' } }] }),
      pl('2', 'A', 'Three Point Jumper', 'a1 makes three point jumper (a2 assists)', { homeScore: 115, awayScore: 90, scoringPlay: true, scoreValue: 3, participants: [{ athlete: { id: 'a1' } }, { athlete: { id: 'a2' } }] }),
      pl('3', 'A', 'Defensive Rebound', 'a1 defensive rebound', { homeScore: 115, awayScore: 90, participants: [{ athlete: { id: 'a1' } }] }),
      pl('4', 'B', 'Lost Ball Turnover', 'b1 lost ball turnover (a2 steals)', { homeScore: 115, awayScore: 90, participants: [{ athlete: { id: 'b1' } }, { athlete: { id: 'a2' } }] }),
    ],
  };
  const g = garbageTime(blowout, new Map([['a0', 'A'], ['a1', 'A'], ['a2', 'A'], ['b1', 'B']]));
  assert.equal(g.get('a0'), undefined, 'the basket that made it 112-90 started from 20, before the win probability said decided');
  assert.deepEqual([g.get('a1').pts, g.get('a1').tpm, g.get('a1').reb], [3, 1, 1]);
  assert.deepEqual([g.get('a2').ast, g.get('a2').stl], [1, 1]);
  const close = { winprobability: [{ playId: '9', homeWinPercentage: 0.995 }, { playId: '10', homeWinPercentage: 0.999 }],
    plays: [pl('9', 'A', 'Free Throw - 1 of 2', 'a1 makes free throw 1 of 2', { homeScore: 100, awayScore: 96, scoringPlay: true, scoreValue: 1, participants: [{ athlete: { id: 'a1' } }] }),
      pl('10', 'A', 'Free Throw - 2 of 2', 'a1 makes free throw 2 of 2', { homeScore: 101, awayScore: 96, scoringPlay: true, scoreValue: 1, participants: [{ athlete: { id: 'a1' } }] })] };
  assert.equal(garbageTime(close).size, 0);
  // A 30-point lead in the third quarter at 99.9%: still not garbage time.
  const early = { ...blowout, plays: blowout.plays.map(x => ({ ...x, period: { number: 3 } })) };
  assert.equal(garbageTime(early, new Map([['a1', 'A'], ['a2', 'A'], ['b1', 'B']])).size, 0);
  // Without win probability: the time-and-margin rule.
  assert.equal(decidedWithout(3, 30, 30), false, 'never before the fourth quarter');
  assert.equal(decidedWithout(4, 700, 25), true);
  assert.equal(decidedWithout(4, 600, 22), false);
  assert.equal(decidedWithout(4, 450, 20), true);
  assert.equal(decidedWithout(4, 200, 15), true);
  assert.equal(decidedWithout(4, 200, 12), false);
});

test('stat padding: garbage-time stats come off, and a milestone reached in garbage time doesn\'t count', () => {
  const g = game({ teams: [{ id: 'A', home: true, winner: true, score: 130 }, { id: 'B', home: false, winner: false, score: 104 }] });
  const p = P({ pts: 22, reb: 11, ast: 10, fgm: 9, fga: 17, ftm: 4, fta: 4 });
  const clean = scorePerformance(p, { game: g });
  assert.ok(clean.tags.includes('Triple-double'));
  const garbage = new Map([['p', { pts: 4, fgm: 2, tpm: 0, reb: 3, oreb: 0, ast: 1, stl: 0, blk: 0 }]]);
  const padded = scorePerformance(p, { game: g, garbage });
  const pad = padded.parts.find(x => x.k === 'padding');
  assert.match(pad.label, /4 pts, 3 reb, 1 ast after the game was decided; the triple-double came in garbage time/);
  assert.ok(Math.abs(pad.value + (4 + 0.8 + 0.9 + 0.7)) < 0.05);
  assert.ok(!padded.parts.some(x => x.k === 'm-td') && padded.tags.includes('Padded') && !padded.tags.includes('Triple-double'));
  assert.ok(clean.score - padded.score > 8);
});

test('stages from ESPN season types and game notes', () => {
  assert.equal(stageOf(2), 'regular');
  assert.equal(stageOf(5, ''), 'playin');
  assert.equal(stageOf(3, 'East 1st Round - Game 3'), 'playoffs');
  assert.equal(stageOf(3, 'East Finals - Game 7'), 'conf');
  assert.equal(stageOf(3, 'NBA Finals - Game 4'), 'finals');
});

test('a whole night ranked: the real top of 15 January 2025', () => {
  const all = [knicks, raptors].flatMap(s => scoreGame(s).perfs);
  assert.ok(all.every(p => p.line.min >= MIN_MINUTES));
  const top = rank(all).slice(0, 5);
  assert.equal(top[0].name, 'Jalen Brunson');
  assert.equal(top[0].result, 'W 125-119 OT');
  assert.ok(top.some(p => p.name === 'Josh Hart' && p.tags.includes('Triple-double')));
  assert.ok(top.some(p => p.name === 'Jakob Poeltl' && p.tags.some(t => /Perfect/.test(t))));
});

test('dates and seasons', () => {
  assert.equal(seasonLabel(2025), '2024-25');
  assert.equal(ymd('2024-10-04T07:00Z'), '20241004');
  assert.ok(isDate('20250115') && !isDate('2025-01-15'));
});
