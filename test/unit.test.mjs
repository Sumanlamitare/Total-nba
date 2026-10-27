// Unit tests: reading ESPN's game summaries (real, in test/fixtures/espn) and the POTN score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  gameOf, linesOf, readPlays, foulKind, leverage, decided, isClutch, gameScore, trueShooting, usageRate, offense, defense, possession, result, clutch,
  padding, fouls, standardize, reference, scoreGame, rank, explainNight, strength, parseRecord, stageOf, milestonesOf, WEIGHTS, CAPS,
} from '../lib/night.js';
import { seasonLabel, isDate, ymd } from '../lib/nights.js';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const knicks = raw('summary_401705127'), raptors = raw('summary_401705128');
const L = o => ({ min: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, oreb: 0, dreb: 0, pf: 0, pm: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, ...o });
const sum = c => c.items.reduce((s, i) => s + i.value, 0);

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

test('box score lines: every player who appeared, made-attempted split', () => {
  const lines = linesOf(knicks);
  const brunson = lines.find(p => p.name === 'Jalen Brunson');
  assert.deepEqual(brunson.line, { min: 45, pts: 38, reb: 5, ast: 4, stl: 2, blk: 0, to: 5, oreb: 1, dreb: 4, pf: 1, pm: 7, fgm: 14, fga: 22, tpm: 3, tpa: 6, ftm: 7, fta: 9 });
  assert.equal(brunson.team, '18');
  assert.equal(brunson.ejected, false);
  assert.ok(!lines.some(p => p.name === 'Matt Ryan'), 'did not play');
  assert.ok(Math.abs(gameScore(brunson.line) - 28.7) < 0.05);
  assert.ok(Math.abs(trueShooting(brunson.line) - 0.73) < 0.01);
  const team = lines.filter(p => p.team === '18').reduce((t, p) => ({ min: t.min + p.line.min, fga: t.fga + p.line.fga, fta: t.fta + p.line.fta, to: t.to + p.line.to }), { min: 0, fga: 0, fta: 0, to: 0 });
  const u = usageRate(brunson.line, team);
  assert.ok(u > 0.25 && u < 0.4, `usage ${u}`);
});

test('opponent strength comes from the record before the game, pulled toward .500', () => {
  assert.deepEqual(parseRecord('27-15'), { w: 27, l: 15 });
  assert.equal(strength(null), 0.5);
  assert.ok(Math.abs(strength({ w: 27, l: 15 }, true) - 31 / 51) < 1e-9, 'this win taken out, 5-5 prior');
  assert.ok(strength({ w: 60, l: 10 }, false) > 0.8);
});

test('fouls are told apart from the play-by-play', () => {
  assert.equal(foulKind('Shooting Foul', 'x shooting foul'), 'shooting');
  assert.equal(foulKind('Personal Foul'), 'personal');
  assert.equal(foulKind('Loose Ball Foul'), 'personal');
  assert.equal(foulKind('Personal Take Foul'), 'take');
  assert.equal(foulKind('Offensive Charge'), 'offensive');
  assert.equal(foulKind('Offensive Foul'), 'offensive');
  assert.equal(foulKind('Offensive Foul Turnover'), null, 'the turnover, not the foul');
  assert.equal(foulKind('Technical Foul', 'x technical foul'), 'technical');
  assert.equal(foulKind('Defensive 3-Seconds Technical'), 'def3');
  assert.equal(foulKind('Flagrant Foul Type 1'), 'flagrant1');
  assert.equal(foulKind('Flagrant Foul Type 2'), 'flagrant2');
  assert.equal(foulKind('Free Throw - Technical', 'makes technical free throw'), null);
  assert.equal(foulKind('Jump Shot'), null);
});

test('the clock: clutch time, garbage time, leverage', () => {
  assert.equal(isClutch(4, 300, 5), true);
  assert.equal(isClutch(4, 301, 5), false);
  assert.equal(isClutch(5, 100, 2), true, 'overtime');
  assert.equal(isClutch(3, 10, 0), false);
  assert.equal(decided(4, 119, 15), true);
  assert.equal(decided(4, 120, 15), false);
  assert.equal(decided(4, 30, 14), false);
  assert.equal(decided(5, 60, 16), true, 'overtime counts');
  assert.equal(decided(3, 10, 30), false);
  assert.equal(leverage(4, 60, 2), 2);
  assert.equal(leverage(4, 500, 8), 1.5);
  assert.equal(leverage(2, 300, 3), 1);
  assert.equal(leverage(4, 60, 20), 0.5);
});

test('the play-by-play of a real game: turnovers, fouls, lineups, win probability', () => {
  const g = gameOf(knicks), lines = linesOf(knicks);
  const r = readPlays(knicks, g, lines);
  const of = n => r.players.get(lines.find(p => p.name === n).id);
  // Every turnover and personal foul in the box score is found.
  for (const p of lines) {
    assert.equal(r.players.get(p.id).tos.length, p.line.to, `${p.name} turnovers`);
    assert.equal(r.players.get(p.id).fouls.filter(f => f.kind !== 'technical' && f.kind !== 'def3').length, p.line.pf, `${p.name} fouls`);
  }
  assert.equal(of('Jalen Brunson').tos.reduce((s, t) => s + t.pts, 0), 9, 'opponent points off his turnovers');
  // Lineups from the substitutions match the box score minutes.
  assert.ok(r.lineups.get('18') && r.lineups.get('20'));
  for (const p of lines) assert.ok(Math.abs(r.players.get(p.id).on.secs / 60 - p.line.min) <= 3, p.name);
  // Win probability: the winners' star added the most, split into before and during crunch time.
  assert.ok(of('Jalen Brunson').wpa + of('Jalen Brunson').wpaClutch > 0.15);
  assert.ok(of('Josh Hart').clutchPlays > 0);
  // Shooting fouls: the free throws they gave.
  const given = lines.flatMap(p => r.players.get(p.id).fouls).filter(f => f.kind === 'shooting').reduce((s, f) => s + f.ftPts, 0);
  assert.ok(given > 10, `free-throw points from shooting fouls: ${given}`);
});

test('a technical: the free throw that went in is charged with it, once', () => {
  const g = gameOf(raptors), lines = linesOf(raptors);
  const r = readPlays(raptors, g, lines);
  const mitchell = lines.find(p => p.name === 'Davion Mitchell');
  const t = r.players.get(mitchell.id).fouls.find(f => f.kind === 'technical');
  assert.deepEqual([t.ftPts, t.ftAtt, t.period, t.margin], [1, 1, 1, 9]);
  // The personal foul at the same moment gave no free throws: the technical's isn't counted twice.
  assert.equal(r.players.get(mitchell.id).fouls.find(f => f.kind === 'personal' && f.left === t.left).ftPts, 0);
  const made = fouls({ fouls: [t], share: 0.2, min: 30 });
  assert.equal(made.items[0].value, -1.3);
  assert.match(made.items[0].label, /up 9.*the free throw went in/);
  // Missed: the misconduct only. In a close game late: the point costs more.
  assert.equal(fouls({ fouls: [{ ...t, ftPts: 0 }], share: 0.2, min: 30 }).items[0].value, -0.8);
  assert.match(fouls({ fouls: [{ ...t, ftPts: 0 }], share: 0.2, min: 30 }).items[0].label, /missed/);
  assert.equal(fouls({ fouls: [{ ...t, lev: 2, margin: 1, period: 4, left: 90 }], share: 0.2, min: 30 }).items[0].value, -1.8);
  // Capped at 3.
  assert.equal(fouls({ fouls: [t, t, t], share: 0.2, min: 30 }).items[0].value, -CAPS.technical);
});

test('turnovers cost more when the opponent scored off them, and more in a close game late', () => {
  const l = L({ pts: 20, fga: 15, fgm: 8, fta: 4, ftm: 4, ast: 5, to: 2 });
  const quiet = possession(l, [{ pts: 0, lev: 1 }, { pts: 0, lev: 1 }]);
  const costly = possession(l, [{ pts: 3, lev: 1 }, { pts: 2, lev: 1 }]);
  const late = possession(l, [{ pts: 3, lev: 2 }, { pts: 2, lev: 2 }]);
  const blowout = possession(l, [{ pts: 3, lev: 0.5 }, { pts: 2, lev: 0.5 }]);
  assert.ok(quiet.raw > costly.raw && costly.raw > late.raw && blowout.raw > costly.raw);
  assert.equal(costly.pointsOff, 5);
  assert.match(costly.items.at(-1).label, /2 turnovers \(5 opponent points off them\)/);
  // A point guard's turnovers are judged against how much he had the ball.
  const busy = possession(L({ fga: 25, fta: 10, ast: 12, to: 3 }), [{ pts: 0, lev: 1 }, { pts: 0, lev: 1 }, { pts: 0, lev: 1 }]);
  const idle = possession(L({ fga: 4, to: 3 }), [{ pts: 0, lev: 1 }, { pts: 0, lev: 1 }, { pts: 0, lev: 1 }]);
  assert.ok(busy.raw > idle.raw);
});

test('turnovers and fouls carry no win probability: they are charged in their own categories', () => {
  const home = 'H', away = 'A';
  const game = { teams: [{ id: home, home: true, winner: true }, { id: away, home: false, winner: false }] };
  const lines = [{ id: 'h1', team: home, starter: true, line: L({}) }, { id: 'a1', team: away, starter: true, line: L({}) }];
  const pl = (id, team, type, text, ids, extra = {}) => ({ id, team: { id: team }, type: { text: type }, text, period: { number: 4 }, clock: { displayValue: '0:30' }, participants: ids.map(i => ({ athlete: { id: i } })), homeScore: 100, awayScore: 99, ...extra });
  const s = {
    plays: [
      pl('1', away, 'Bad Pass\nTurnover', 'a1 bad pass', ['a1']),
      pl('2', home, 'Shooting Foul', 'h1 shooting foul', ['h1']),
      pl('3', away, 'Free Throw - 1 of 2', 'a1 makes free throw 1 of 2', ['a1'], { scoringPlay: true, shootingPlay: true, scoreValue: 1, awayScore: 100 }),
    ],
    winprobability: [{ playId: '1', homeWinPercentage: 0.9 }, { playId: '2', homeWinPercentage: 0.7 }, { playId: '3', homeWinPercentage: 0.6 }],
  };
  const r = readPlays(s, game, lines);
  assert.equal(r.players.get('h1').wpaClutch, 0, 'his foul');
  assert.ok(Math.abs(r.players.get('a1').wpaClutch - 0.1) < 1e-9, 'only the free throw, not the turnover');
  assert.equal(r.players.get('a1').tos[0].lev, 2);
  assert.deepEqual([r.players.get('h1').fouls[0].ftPts, r.players.get('h1').fouls[0].ftAtt], [1, 1]);
});

test('fouling out: by how close it was, how much was left and how much he mattered', () => {
  const at = (period, left, margin) => fouls({ fouls: [], fouledOut: { period, left, margin }, share: 0.3, min: 30 }).items[0].value;
  assert.equal(at(4, 360, 2), -CAPS.foulOut, 'close, six minutes left, a key player');
  assert.ok(at(4, 30, 2) > at(4, 360, 2), 'less time left, less lost');
  assert.ok(at(4, 30, 25) > -0.5, 'late in a decided game: low impact');
  assert.ok(fouls({ fouls: [], fouledOut: { period: 4, left: 360, margin: 2 }, share: 0.05, min: 20 }).items[0].value > at(4, 360, 2), 'a minor player matters less');
});

test('flagrant fouls, ejections and the foul cap', () => {
  const f2 = { kind: 'flagrant2', period: 2, left: 300, margin: 0, lev: 1, ftPts: 2, ftAtt: 2 };
  const ej = fouls({ fouls: [f2], ejected: true, ejection: { period: 2, left: 300, margin: 0 }, share: 0.3, min: 18 });
  assert.equal(ej.items.find(i => i.k === 'flagrant').value, -CAPS.flagrant);
  const tech = { kind: 'technical', period: 2, left: 300, margin: 0, lev: 1, ftPts: 1, ftAtt: 1 };
  const all = fouls({ fouls: [f2, tech, tech, tech], ejected: true, ejection: { period: 2, left: 300, margin: 0 }, fouledOut: null, share: 0.3, min: 18 });
  assert.equal(all.value, -CAPS.fouls);
  // Fouling on purpose late while trailing costs nothing.
  const take = fouls({ fouls: [1, 2, 3].map(() => ({ kind: 'personal', period: 4, left: 40, margin: -4, lev: 2, ftPts: 2, ftAtt: 2 })), share: 0.2, min: 30 });
  assert.equal(take.items.length, 0);
  // Early foul trouble that cost him minutes.
  const early = [1, 1, 2].map(p => ({ kind: 'personal', period: p, left: 400, margin: 0, lev: 1, ftPts: 0, ftAtt: 0 }));
  assert.ok(fouls({ fouls: early, share: 0.2, min: 22, avgMin: 34 }).items.some(i => i.k === 'trouble'));
  assert.ok(!fouls({ fouls: early, share: 0.2, min: 33, avgMin: 34 }).items.some(i => i.k === 'trouble'));
});

test('stat padding: only for box scores that look impressive, except garbage time; capped', () => {
  const chucker = L({ pts: 30, fgm: 11, fga: 33, tpm: 3, tpa: 12, ftm: 5, fta: 6, ast: 2, to: 6 });
  const p = padding({ line: chucker, usage: 0.38 });
  assert.deepEqual(p.items.map(i => i.k), ['volume', 'usage', 'turnovers']);
  assert.ok(p.value < -4 && p.value >= -CAPS.padding);
  // The same shooting on a quiet night is already in the offense score: no padding.
  assert.equal(padding({ line: L({ pts: 12, fgm: 5, fga: 18, ast: 1, to: 2 }), usage: 0.3 }).items.length, 0);
  // Efficient volume isn't padding.
  assert.equal(padding({ line: L({ pts: 40, fgm: 15, fga: 24, ftm: 8, fta: 9, ast: 6, to: 2 }), usage: 0.35 }).items.length, 0);
  // Garbage time: starters only.
  const g = { pts: 4, fgm: 2, fga: 3, tpm: 0, ftm: 0, fta: 0, reb: 3, oreb: 0, ast: 1, stl: 0, blk: 0, to: 0 };
  assert.equal(padding({ line: L({ pts: 10 }), garbage: g, starter: true, garbageCost: 2.2 }).value, -2.2);
  assert.equal(padding({ line: L({ pts: 10 }), garbage: g, starter: true, garbageCost: 9 }).value, -CAPS.garbage);
  assert.equal(padding({ line: L({ pts: 10 }), garbage: g, starter: false, garbageCost: 2.2 }).value, 0);
});

test('garbage time in the play-by-play: the last two minutes with a 15-point lead', () => {
  const game = { teams: [{ id: 'A', home: true, winner: true }, { id: 'B', home: false, winner: false }] };
  const lines = ['a0', 'a1', 'a2', 'b1'].map(id => ({ id, team: id[0].toUpperCase(), starter: true, line: L({}) }));
  const pl = (id, team, type, text, extra = {}) => ({ id, team: { id: team }, type: { text: type }, text, period: { number: 4 }, clock: { displayValue: '1:40' }, ...extra });
  const plays = [
    pl('0', 'B', 'Defensive Rebound', 'b1 defensive rebound', { homeScore: 110, awayScore: 98, participants: [{ athlete: { id: 'b1' } }] }),
    pl('1', 'A', 'Three Point Jumper', 'a0 makes three point jumper', { homeScore: 113, awayScore: 98, scoringPlay: true, shootingPlay: true, scoreValue: 3, participants: [{ athlete: { id: 'a0' } }] }),
    pl('2', 'A', 'Three Point Jumper', 'a1 makes three point jumper (a2 assists)', { homeScore: 116, awayScore: 98, scoringPlay: true, shootingPlay: true, scoreValue: 3, participants: [{ athlete: { id: 'a1' } }, { athlete: { id: 'a2' } }] }),
    pl('3', 'A', 'Defensive Rebound', 'a1 defensive rebound', { homeScore: 116, awayScore: 98, participants: [{ athlete: { id: 'a1' } }] }),
    pl('4', 'B', 'Lost Ball Turnover', 'b1 lost ball turnover (a2 steals)', { homeScore: 116, awayScore: 98, participants: [{ athlete: { id: 'b1' } }, { athlete: { id: 'a2' } }] }),
  ];
  const gb = s => new Map([...readPlays(s, game, lines).players].filter(([, r]) => r.garbage).map(([id, r]) => [id, r.garbage]));
  const g = gb({ plays });
  assert.equal(g.get('a0'), undefined, 'the three that made it 113-98 started from a 12-point lead');
  assert.deepEqual([g.get('a1').pts, g.get('a1').tpm, g.get('a1').reb, g.get('a1').fga], [3, 1, 1, 1]);
  assert.deepEqual([g.get('a2').ast, g.get('a2').stl], [1, 1]);
  assert.equal(gb({ plays: plays.map(x => ({ ...x, clock: { displayValue: '2:30' } })) }).size, 0, 'two and a half minutes left: comebacks happen');
  assert.equal(gb({ plays: plays.map(x => ({ ...x, period: { number: 3 } })) }).size, 0);
});

test('the result: a win by his share of it, a loss by his minutes, and a close loss costs half', () => {
  const base = { margin: 8, ot: 0, road: false, stage: 'regular', oppRecord: { w: 20, l: 20 }, oppStrength: 0.5, minFrac: 0.75, pm: 0, wpa: null };
  const star = result({ ...base, won: true, share: 0.35 }), role = result({ ...base, won: true, share: 0.08 });
  assert.ok(star.raw > role.raw * 2);
  const close = result({ ...base, won: false, margin: 3, share: 0.35 }), blowout = result({ ...base, won: false, margin: 25, share: 0.35 });
  assert.ok(Math.abs(close.raw - blowout.raw / 2) < 0.06);
  assert.ok(close.raw < 0 && close.raw > -2, 'a loss costs something, never everything');
  assert.ok(result({ ...base, won: true, share: 0.35, road: true, ot: 1 }).raw > star.raw);
  assert.ok(result({ ...base, won: true, share: 0.35, stage: 'finals' }).raw > star.raw);
  assert.ok(result({ ...base, won: true, share: 0.35, oppStrength: 0.8 }).raw > result({ ...base, won: true, share: 0.35, oppStrength: 0.2 }).raw);
});

test('offense: volume and efficiency together; defense; crunch time', () => {
  const eff = offense(L({ pts: 30, fgm: 12, fga: 18, ftm: 6, fta: 6, ast: 4 })), chuck = offense(L({ pts: 30, fgm: 11, fga: 30, ftm: 8, fta: 10, ast: 4 }));
  assert.ok(eff.raw > chuck.raw + 5);
  assert.ok(chuck.raw > offense(L({ pts: 10, fgm: 4, fga: 6, ftm: 2, fta: 2, ast: 4 })).raw, 'volume still counts');
  assert.ok(Math.abs(sum(eff) - eff.raw) < 0.05);
  assert.ok(offense(L({ pts: 30, fgm: 12, fga: 18, ftm: 6, fta: 6 }), 0.8).raw > offense(L({ pts: 30, fgm: 12, fga: 18, ftm: 6, fta: 6 }), 0.2).raw);
  assert.equal(defense(L({ stl: 2, blk: 1, dreb: 10 })).raw, 2.6 + 0.8 + 3);
  // Crunch time: a miss in a loss costs half; the game-winner adds a fixed 2; no crunch time is neutral.
  assert.equal(clutch({ won: false, wpa: -0.2, stats: null, plays: 3 }).raw, -2);
  assert.equal(clutch({ won: true, wpa: -0.2, stats: null, plays: 3 }).raw, -4);
  assert.equal(clutch({ won: true, wpa: 0.1, stats: null, plays: 3, gameWinner: { period: 4, left: 3 } }).raw, 4);
  assert.equal(clutch({ won: true, wpa: 0, stats: null, plays: 0 }).raw, 0);
});

test('the 0..100 scale: robust z against the reference, capped', () => {
  const ref = reference([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
  assert.equal(ref.median, 5.5);
  assert.ok(ref.scale > 3 && ref.scale < 6, 'one outlier hardly moves it');
  assert.equal(standardize(5.5, ref), 50);
  assert.equal(standardize(1000, ref), 100);
  assert.equal(standardize(-1000, ref), 0);
  const most0 = reference([...Array(90).fill(0), 1, 2, -1, 3, -2, 4, 1, 1, 2, 5]);
  assert.ok(most0.scale > 0.05, 'a spread even when most values are the same');
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((s, w) => s + w, 0) - 1) < 1e-9);
});

test('stages from ESPN season types and game notes', () => {
  assert.equal(stageOf(2), 'regular');
  assert.equal(stageOf(5, ''), 'playin');
  assert.equal(stageOf(3, 'East 1st Round - Game 3'), 'playoffs');
  assert.equal(stageOf(3, 'East Finals - Game 7'), 'conf');
  assert.equal(stageOf(3, 'NBA Finals - Game 4'), 'finals');
  assert.deepEqual(milestonesOf(L({ pts: 12, reb: 11, ast: 10 })).map(m => m.k), ['td']);
});

test('a whole night: every player who appeared, scored 0..100 and explained', () => {
  const games = [knicks, raptors].map(s => scoreGame(s));
  const all = rank(games.flatMap(x => x.perfs));
  assert.equal(all.length, linesOf(knicks).length + linesOf(raptors).length, 'every player, not a shortlist');
  for (const p of all) {
    assert.ok(p.score >= 0 && p.score <= 100, `${p.name} ${p.score}`);
    assert.equal(p.confidence.level, 'high', p.name);
    const base = Object.values(p.categories).reduce((s, c) => s + c.weight * c.score, 0);
    assert.ok(Math.abs(base - p.base) < 0.2, `${p.name}: the categories add up to the base`);
    assert.ok(Math.abs(Math.max(0, Math.min(100, p.base + p.padding.value + p.fouls.value)) - p.score) < 0.15, `${p.name}: base minus deductions`);
  }
  const top = all.slice(0, 5).map(p => p.name);
  assert.ok(top.includes('Jalen Brunson') && top.includes('Josh Hart'), top.join(', '));
  const mitchell = all.find(p => p.name === 'Davion Mitchell');
  assert.equal(mitchell.line.tech, 1);
  assert.ok(mitchell.fouls.items.some(i => i.k === 'technical'));
  const ex = explainNight(all);
  assert.equal(ex.name, all[0].name);
  assert.ok(ex.why.length >= 2);
  assert.equal(ex.competitors.length, 2);
  assert.ok(ex.competitors.every(c => c.gap >= 0 && c.text));
  // Without play-by-play: lower confidence, the crunch-time weight goes to the other categories.
  const bare = scoreGame({ ...knicks, plays: [], winprobability: [] }).perfs.find(p => p.name === 'Jalen Brunson');
  assert.equal(bare.confidence.level, 'low');
  assert.equal(bare.categories.clutch, null);
  assert.ok(Math.abs(Object.values(bare.categories).filter(Boolean).reduce((s, c) => s + c.weight, 0) - 1) < 0.02);
});

test('dates and seasons', () => {
  assert.equal(seasonLabel(2025), '2024-25');
  assert.equal(ymd('2024-10-04T07:00Z'), '20241004');
  assert.ok(isDate('20250115') && !isDate('2025-01-15'));
});
