// Storing games. A final game's player lines go into pgames only once its box score passes the checks (both teams,
// players' points adding up to each score, minutes and quarters adding up) — and, for recent games, once NBA.com's box
// score agrees on the scores and every player's points, rebounds and assists. A game still failing after GIVE_UP_HOURS
// is stored as "unverified": it never feeds records or graphics.
import { data, verifier } from './providers/index.js';
import { LINE } from './stats.js';

export const GIVE_UP_HOURS = 36;
export const USABLE = new Set(['verified', 'consistent']);

// Team statistics kept with each game (team records, game result graphics); the rest is fetched live when shown.
const KEEP_TEAM = new Set(['fg', 'tp', 'ft', 'reb', 'orb', 'ast', 'stl', 'blk', 'tov', 'paint', 'fast_break', 'largest_lead']);
const lineFields = l => Object.fromEntries(LINE.map(k => [k, l[k] ?? 0]));

// The game document (no play-by-play: that stays with the provider and is fetched on demand).
export function gameDoc(c, verify) {
  const g = c.game;
  return {
    _id: g.id, date: g.date, start: g.start ? new Date(g.start) : null, season: g.season, stype: g.stype, status: g.status, period: g.period, clock: g.clock, detail: g.detail, ot: g.ot,
    note: g.note || null, venue: g.venue || null,
    teams: g.teams.map(t => ({ id: t.id, abbr: t.abbr, name: t.name, short: t.short, color: t.color, alt: t.alt, logo: t.logo, score: t.score, home: t.home, winner: t.winner, record: t.record, linescores: t.linescores,
      stats: Object.fromEntries(Object.entries(c.teamStats?.[t.id] || {}).filter(([k]) => KEEP_TEAM.has(k)).map(([k, v]) => [k, v.value])) })),
    verify, source: { provider: c.source, url: c.url, fetchedAt: c.fetchedAt },
  };
}

// Player lines for pgames.
export function pgameDocs(c) {
  const g = c.game, ymd = +g.date;
  const won = Object.fromEntries(g.teams.map(t => [t.id, t.winner]));
  const opp = Object.fromEntries(g.teams.map(t => [t.id, g.teams.find(o => o.id !== t.id)?.id]));
  return c.players.filter(p => p.line && !(p.line.min <= 0 && !p.line.pts && !p.line.fga && !p.line.fta && !p.line.reb && !p.line.ast && !p.line.stl && !p.line.blk && !p.line.tov && !p.line.pf))
    .map(p => ({ g: g.id, p: p.id, t: p.team, o: opp[p.team], d: ymd, s: g.season, st: g.stype, w: !!won[p.team], gs: p.starter, ...lineFields(p.line) }));
}

// Verify a final game: the provider's own consistency checks, then the second source (recent games only — NBA.com's
// CDN covers the current season).
export async function verifyGame(c, { crossCheck = true } = {}) {
  const problems = c.problems || [];
  let cross = null;
  if (crossCheck && c.game.status === 'final') cross = await verifier.crossCheck(c.game, c.players).catch(e => ({ status: 'unavailable', detail: e.message, source: 'NBA.com' }));
  // verified: consistent and confirmed by NBA.com; consistent: passes every check with one source (historical games,
  // or NBA.com silent past the wait); pending: waiting for NBA.com; problems / mismatch: not usable.
  const status = problems.length ? 'problems' : !cross ? 'consistent' : cross.status === 'match' ? 'verified' : cross.status === 'mismatch' ? 'mismatch' : 'pending';
  return { status, problems, cross, at: new Date(),
    checks: [
      { name: 'Both teams with at least five players', ok: !problems.some(p => /players with statistics|not two teams/.test(p)) },
      { name: "Players' points add up to each team's score", ok: !problems.some(p => /players' points/.test(p)) },
      { name: 'Player minutes add up to the game length', ok: !problems.some(p => /player minutes/.test(p)) },
      { name: 'Quarter scores add up to the final', ok: !problems.some(p => /quarter scores/.test(p)) },
      { name: 'NBA.com agrees on the score and every player\'s points, rebounds, assists', ok: cross ? cross.status === 'match' : null, detail: cross ? cross.status === 'match' ? `${cross.matched} players matched` : cross.detail || cross.diffs?.slice(0, 4).join('; ') : 'not checked' },
    ] };
}

export async function upsertPlayers(d, c) {
  const ops = c.players.filter(p => p.id && p.id !== 'undefined').map(p => ({ updateOne: { filter: { _id: p.id }, upsert: true,
    update: { $set: { name: p.name, short: p.short, headshot: p.headshot, ...(p.pos ? { pos: p.pos } : {}), ...(p.jersey ? { jersey: p.jersey } : {}) }, $max: { lastGame: +c.game.date }, $setOnInsert: { firstSeen: +c.game.date } } } }));
  // The team a player most recently played for.
  for (const p of c.players) ops.push({ updateOne: { filter: { _id: p.id, $or: [{ teamDate: { $exists: false } }, { teamDate: { $lte: +c.game.date } }] }, update: { $set: { team: p.team, teamDate: +c.game.date } } } });
  if (ops.length) await d.collection('players').bulkWrite(ops, { ordered: false }).catch(() => {});
}

// Store one game from its game center. Returns { stored, verify, fresh } — fresh: player lines written for the first
// time or changed (a stat correction).
export async function storeGame(d, c, { crossCheck = true, now = new Date(), force = false } = {}) {
  const g = c.game;
  const prev = await d.collection('games').findOne({ _id: g.id }, { projection: { verify: 1, firstSeenFinal: 1, checksum: 1 } });
  if (g.status !== 'final') {
    const { _id, ...live } = gameDoc(c, prev?.verify || null);
    await d.collection('games').updateOne({ _id: g.id }, { $set: live }, { upsert: true });
    return { stored: false, verify: null, fresh: false };
  }
  let verify = await verifyGame(c, { crossCheck });
  const firstSeenFinal = prev?.firstSeenFinal || now;
  // Give up waiting on a box score that keeps failing: keep it, marked unverified (never used for records or graphics).
  if (!USABLE.has(verify.status) && now - new Date(firstSeenFinal) > GIVE_UP_HOURS * 3600e3) verify = { ...verify, status: verify.status === 'pending' ? 'consistent' : 'unverified' };
  const rows = pgameDocs(c);
  const checksum = JSON.stringify(rows.map(r => [r.p, ...LINE.map(k => r[k])]));
  const usable = USABLE.has(verify.status);
  const { _id, ...doc } = gameDoc(c, verify);
  await d.collection('games').updateOne({ _id: g.id }, { $set: { ...doc, firstSeenFinal, ...(usable ? { checksum } : {}) } }, { upsert: true });
  await upsertPlayers(d, c);
  if (!usable) return { stored: false, verify, fresh: false };
  const fresh = force || prev?.checksum !== checksum;
  if (fresh) {
    await d.collection('pgames').deleteMany({ g: g.id });
    if (rows.length) await d.collection('pgames').insertMany(rows, { ordered: false });
  }
  return { stored: true, verify, fresh, corrected: !!prev?.checksum && prev.checksum !== checksum };
}

// Fetch and store one game by id.
export async function ingestGame(d, gid, opts = {}) {
  const c = await data.game(gid, { ttl: 0 });
  if (!c) return { stored: false, missing: true };
  return { ...(await storeGame(d, c, opts)), center: c };
}
