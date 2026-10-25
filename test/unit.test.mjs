// Unit tests: reading ESPN's game summaries (real, in test/fixtures/espn) and the performance score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameOf, linesOf, gameScore, trueShooting, winProbabilityAdded, clutchPoints, milestonesOf, scorePerformance, scoreGame, rank, strength, parseRecord, stageOf, STAGE, MIN_MINUTES } from '../lib/night.js';
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
