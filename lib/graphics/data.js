// Structured data for graphics, built from what the app detected or looked up. Templates only ever read this; the
// numbers come straight from verified box scores, record lists and career totals.
import { derive, STAT } from '../stats.js';
import { round, seasonLabel } from '../util.js';
import { fmtDate } from './templates.js';

// Statistics a graphic can show (every one the line provides), with graphic labels.
export const GRAPHIC_STATS = {
  pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tov: 'TOV', min: 'MIN', pm: '+/-', pf: 'FOULS',
  fg: 'FG', tp: '3PT', ft: 'FT', fgm: 'FGM', fga: 'FGA', tpm: '3PM', tpa: '3PA', ftm: 'FTM', fta: 'FTA',
  fg_pct: 'FG%', tp_pct: '3P%', ft_pct: 'FT%', ts_pct: 'TS%', efg_pct: 'eFG%', orb: 'OREB', drb: 'DREB', gmsc: 'GAME SCORE', stocks: 'STL+BLK', pra: 'PTS+REB+AST',
};

export function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return { first: '', last: parts[0] || '' };
  let lastStart = parts.length - 1;
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[lastStart]) && lastStart > 1) lastStart--;
  return { first: parts.slice(0, lastStart).join(' '), last: parts.slice(lastStart).join(' ') };
}

// Every statistic value from a box-score line, formatted for a graphic.
export function lineValues(line) {
  if (!line) return {};
  const l = derive(line);
  const p = v => (v == null ? null : `${round(v, 1)}%`.replace('.0%', '%'));
  return {
    pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, min: l.min, pm: l.pm > 0 ? `+${l.pm}` : l.pm, pf: l.pf,
    fg: `${l.fgm}-${l.fga}`, tp: `${l.tpm}-${l.tpa}`, ft: `${l.ftm}-${l.fta}`, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta,
    fg_pct: p(l.fg_pct), tp_pct: p(l.tp_pct), ft_pct: p(l.ft_pct), ts_pct: p(l.ts_pct), efg_pct: p(l.efg_pct), orb: l.orb, drb: l.drb,
    gmsc: round(l.gmsc, 1), stocks: l.stocks, pra: l.pra,
  };
}

// The chosen statistics, in order, skipping any the data doesn't have.
export const statsFor = (keys, values) => keys.filter(k => values?.[k] != null && values[k] !== '').map(k => ({ key: k, label: GRAPHIC_STATS[k] || STAT[k]?.short || k.toUpperCase(), value: values[k] }));

const gameOf = (teams, { status, live } = {}) => ({ teams: teams.map(t => ({ abbr: t.abbr, score: t.score, logo: t.logo, winner: !!t.winner, name: t.name, color: t.color, record: t.record })), status: status || 'FINAL', live: !!live });
const teamOf = t => (t ? { id: t.id, abbr: t.abbr, name: t.name, color: t.color, alt: t.alt, logo: t.logo } : null);

export function sourceText({ live = false, verify } = {}) {
  if (live) return 'Data: ESPN · live, not final';
  if (verify === 'verified') return 'Data: ESPN · verified with NBA.com';
  return 'Data: ESPN box scores';
}

// A performance (lib/detect.js) → graphic data.
export function fromPerformance(perf, { statKeys, kicker, headline, note, verify, brand } = {}) {
  const values = lineValues(perf.line);
  const live = perf.state === 'live';
  const keys = statKeys || defaultKeys(perf);
  const teams = [perf.home ? perf.opp : perf.team, perf.home ? perf.team : perf.opp].map(t => ({ ...t, winner: !live && t.score === Math.max(perf.team.score, perf.opp.score) && perf.team.score !== perf.opp.score }));
  return {
    kicker, headline: headline ?? null, note: note ?? perf.angle ?? null, date: perf.date,
    player: { id: perf.pid, name: perf.name, ...splitName(perf.name), headshot: perf.headshot, pos: perf.pos },
    team: teamOf(perf.team), opp: teamOf(perf.opp),
    game: gameOf(teams, { status: live ? perf.clock : 'FINAL', live }),
    values, statKeys: keys, stats: statsFor(keys, values),
    source: sourceText({ live, verify }), brand, refs: { gid: perf.gid, pid: perf.pid, perf: perf._id },
  };
}
function defaultKeys(perf) {
  const l = perf.line || {};
  const keys = ['pts'];
  if (l.reb >= 8 || l.reb >= l.ast) keys.push('reb');
  if (l.ast >= 6 || keys.length < 3) keys.push('ast');
  if (l.stl + l.blk >= 5) keys.push(l.blk >= l.stl ? 'blk' : 'stl');
  if (keys.length < 4) keys.push(l.tpm >= 5 ? 'tpm' : 'fg');
  return keys.slice(0, 4);
}

// A record, career-high or milestone event (lib/events.js) → graphic data.
export function fromEvent(e, { line, brand } = {}) {
  const values = lineValues(line);
  const live = e.game.status !== 'final';
  const prev = e.previous || {};
  const holders = (prev.holders || []).filter(h => h.name);
  const stat = STAT[e.stat]?.label.toLowerCase() || e.stat;
  const prevText = e.type === 'milestone'
    ? `${(prev.value ?? 0).toLocaleString('en-US')} career ${stat} before tonight`
    : holders.length ? `${prev.value} — ${holders.slice(0, 3).map(h => `${h.name}${h.date ? ` (${fmtDate(h.date)}${h.opp ? ` vs ${h.opp}` : ''})` : ''}`).join(', ')}${holders.length > 3 ? ` and ${holders.length - 3} more` : ''}` : prev.value != null ? String(prev.value) : null;
  const togo = e.target - e.value;
  const progress = e.state === 'approaching' ? (e.type === 'milestone' ? `${togo.toLocaleString('en-US')} to go` : `${togo} to tie · ${togo + 1} to break${e.projection != null ? ` · on pace for about ${e.projection}` : ''}`) : e.type === 'milestone' && e.state === 'reached' ? 'Milestone reached' : null;
  const g = e.game;
  return {
    kicker: null, date: g.date,
    player: { id: e.player.id, name: e.player.name, ...splitName(e.player.name), headshot: e.player.headshot },
    team: { id: e.player.teamId, abbr: e.player.team, color: e.player.color, alt: e.player.alt },
    game: gameOf(g.teams.map(t => ({ ...t, winner: g.status === 'final' && t.score === Math.max(...g.teams.map(x => x.score)) })), { status: live ? g.clock : 'FINAL', live }),
    hero: { value: e.type === 'milestone' ? (e.state === 'reached' ? e.target : e.value).toLocaleString('en-US') : e.value, label: e.type === 'milestone' ? `career ${stat}` : stat },
    record: { title: e.title, scope: e.scopeLabel, value: e.value, target: e.target, state: e.state, previousText: prevText, progress, category: e.category },
    values, statKeys: [], stats: [],
    source: e.source?.provider === 'Reference record' ? `Record source: ${e.source.url || 'reference'} · Data: ESPN` : sourceText({ live, verify: e.verification?.status === 'verified' ? 'verified' : null }),
    brand, refs: { event: e._id, gid: g.id, pid: e.player.id },
  };
}

// A game (games collection doc) with its best performers → graphic data.
export function fromGame(game, performers = [], { brand } = {}) {
  const live = game.status !== 'final';
  return {
    kicker: live ? `LIVE · ${game.detail || ''}` : 'FINAL', date: game.date,
    game: gameOf(game.teams, { status: live ? game.detail : game.ot ? `FINAL/${game.ot > 1 ? game.ot : ''}OT` : 'FINAL', live }),
    team: teamOf(game.teams.find(t => t.winner) || game.teams[1]),
    performers: performers.map(p => ({ name: p.name, headshot: p.headshot, color: p.color, line: p.statLine, team: p.team })),
    note: null, source: sourceText({ live, verify: game.verify?.status }), brand, refs: { gid: game._id },
  };
}

export function fromLeaderboard({ title, subhead, rows, kicker, limit = 10, brand, source }) {
  return { kicker: kicker || 'LEADERS', headline: title, subhead, rows: rows.slice(0, limit), limit, source: source || 'Data: ESPN box scores', brand };
}

export function fromCompare({ a, b, rows, period, brand }) {
  return { kicker: 'HEAD TO HEAD', compare: { a, b, rows, period }, source: 'Data: ESPN', brand };
}

export function fromSeason({ player, team, season, values, statKeys, brand }) {
  const keys = statKeys || ['pts', 'reb', 'ast', 'fg_pct', 'tp_pct', 'ts_pct'];
  return { kicker: `${seasonLabel(season)} SEASON`, season: `${seasonLabel(season)} SEASON`, player: { ...player, ...splitName(player.name) }, team, values, statKeys: keys, stats: statsFor(keys, values), source: 'Data: ESPN box scores', brand };
}

// Refresh the stats list after the editor picks different statistics.
export const withStats = (data, keys) => ({ ...data, statKeys: keys, stats: statsFor(keys, data.values || {}) });

// A feed entry → graphic data (the template follows the story: a player, a team, or the game itself).
const TEAM_STORIES = new Set(['comeback', 'comeback-done', 'run', 'streak', 'collapse', 'blowout']);
const GAME_STORIES = new Set(['close', 'overtime']);
export function fromFeed(e, { brand } = {}) {
  const g = e.game || {};
  const teams = (g.teams || []).map(t => ({ ...t, winner: !!t.winner }));
  const game = gameOf(teams, { status: g.live ? (g.label || 'LIVE') : (g.label || 'FINAL').toUpperCase(), live: !!g.live });
  const source = e.verification?.status === 'verified' ? 'Data: ESPN · verified with NBA.com' : e.status === 'developing' ? 'Data: ESPN · live, not final' : 'Data: ESPN';
  const stats = (e.stats || []).map((s, i) => ({ key: `s${i}`, label: String(s.label).toUpperCase(), value: s.value }));
  const values = Object.fromEntries(stats.map(s => [s.key, s.value]));
  const base = { kicker: (e.categoryLabel || e.category || '').toUpperCase(), headline: e.headline, note: e.body, date: g.date, game, stats, values, statKeys: stats.map(s => s.key), statKeysLocked: true, source, brand, refs: { feed: e._id, gid: g.id } };
  if (GAME_STORIES.has(e.category)) return { template: 'game-situation', data: { ...base, kicker: e.headline, note: e.body, performers: [] } };
  if (TEAM_STORIES.has(e.category) || !e.players?.length) return { template: 'team-story', data: { ...base, team: e.team } };
  const p = e.players[0];
  return { template: 'player-story', data: { ...base, player: { id: p.id, name: p.name, ...splitName(p.name), headshot: p.headshot }, team: e.team } };
}
