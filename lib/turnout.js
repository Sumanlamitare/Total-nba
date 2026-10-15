// Turnout's rules, kept pure so they can be tested without a database:
// who is in vs waitlisted, late drops, balanced teams, and group stats.

export const SPORTS = {
  basketball: { name: 'Basketball', icon: '🏀', size: 10 },
  soccer: { name: 'Soccer', icon: '⚽', size: 14 },
  volleyball: { name: 'Volleyball', icon: '🏐', size: 12 },
  pickleball: { name: 'Pickleball', icon: '🏓', size: 8 },
  tennis: { name: 'Tennis', icon: '🎾', size: 4 },
  ultimate: { name: 'Ultimate', icon: '🥏', size: 14 },
  football: { name: 'Flag football', icon: '🏈', size: 10 },
  hockey: { name: 'Hockey', icon: '🏒', size: 12 },
  softball: { name: 'Softball', icon: '🥎', size: 18 },
  badminton: { name: 'Badminton', icon: '🏸', size: 8 },
  running: { name: 'Running', icon: '🏃', size: 20 },
  other: { name: 'Other', icon: '🏅', size: 10 },
};

const bad = m => { throw Object.assign(new Error(m), { status: 400 }); };
const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const int = (v, lo, hi, label) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < lo || n > hi) bad(`${label} must be between ${lo} and ${hi}`);
  return n;
};

// ---- roster -----------------------------------------------------------------------------------
// Each RSVP: { userId, name, want: 'in' | 'maybe' | 'out', guests, at }.
// Players who want in are confirmed first come, first served while their party fits; once one
// party doesn't fit, everyone after them waits (strict order, so nobody skips the queue).
export function roster(game) {
  const list = game.rsvps || [];
  const wantIn = list.filter(r => r.want === 'in').sort((a, b) => new Date(a.at) - new Date(b.at));
  const confirmed = [], waitlist = [];
  let taken = 0, blocked = false;
  for (const r of wantIn) {
    const size = 1 + (r.guests || 0);
    if (!blocked && taken + size <= game.capacity) { confirmed.push(r); taken += size; } else { blocked = true; waitlist.push(r); }
  }
  return {
    confirmed, waitlist, taken,
    maybe: list.filter(r => r.want === 'maybe'), out: list.filter(r => r.want === 'out'),
    open: Math.max(0, game.capacity - taken), need: Math.max(0, (game.minPlayers || 0) - taken),
  };
}
export const statusOf = (game, userId) => {
  const r = roster(game);
  if (r.confirmed.some(x => x.userId === userId)) return 'in';
  if (r.waitlist.some(x => x.userId === userId)) return 'waitlist';
  return (game.rsvps || []).find(x => x.userId === userId)?.want || null;
};

// Apply one player's answer. Keeps their place in line unless they newly join or add guests.
export function answer(game, user, want, guests = 0, now = new Date()) {
  if (!['in', 'maybe', 'out'].includes(want)) bad('Answer in, maybe or out');
  guests = want === 'in' ? int(guests || 0, 0, 5, 'Guests') : 0;
  const before = statusOf(game, user.id);
  const prev = (game.rsvps || []).find(r => r.userId === user.id);
  const keepPlace = prev && prev.want === 'in' && want === 'in' && guests <= (prev.guests || 0);
  const entry = { userId: user.id, name: user.name, want, guests, at: keepPlace ? prev.at : now };
  const rsvps = [...(game.rsvps || []).filter(r => r.userId !== user.id), entry];
  const lateDrop = before === 'in' && want !== 'in' && +new Date(game.startsAt) - +now < 24 * 3600e3;
  return { rsvps, lateDrop };
}

// ---- teams ------------------------------------------------------------------------------------
// players: [{ id, name, skill }]. Shuffle (so "reshuffle" gives new teams), snake-draft by skill,
// then swap players between teams while it narrows the gap in total skill.
export function balance(players, nTeams = 2, rand = Math.random) {
  nTeams = Math.max(2, Math.min(4, nTeams | 0));
  const pool = [...players];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  pool.sort((a, b) => (b.skill ?? 3) - (a.skill ?? 3));
  const teams = Array.from({ length: nTeams }, () => []);
  pool.forEach((p, i) => { const round = Math.floor(i / nTeams), k = i % nTeams; teams[round % 2 ? nTeams - 1 - k : k].push(p); });
  const sum = t => t.reduce((s, p) => s + (p.skill ?? 3), 0);
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let a = 0; a < nTeams; a++) for (let b = a + 1; b < nTeams; b++) {
      for (let i = 0; i < teams[a].length; i++) for (let j = 0; j < teams[b].length; j++) {
        const sa = sum(teams[a]), sb = sum(teams[b]);
        const d = (teams[a][i].skill ?? 3) - (teams[b][j].skill ?? 3);
        if (d !== 0 && Math.abs(sa - d - (sb + d)) < Math.abs(sa - sb)) {
          [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]]; improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return teams;
}

// The confirmed players (and their guests) as team-pickable entries
export function teamPool(game, skills = {}) {
  const out = [];
  for (const r of roster(game).confirmed) {
    out.push({ id: r.userId, name: r.name, skill: skills[r.userId] ?? 3 });
    for (let g = 1; g <= (r.guests || 0); g++) out.push({ id: `${r.userId}+${g}`, name: `${r.name}'s guest${r.guests > 1 ? ' ' + g : ''}`, skill: 3, guest: true });
  }
  return out;
}

// ---- stats ------------------------------------------------------------------------------------
// From played games' final records: { players: [userId], noShows: [userId], teams?: [[id]], score?: [n, n] }
export function stats(games) {
  const by = {};
  const row = id => (by[id] ||= { userId: id, committed: 0, played: 0, noShows: 0, lateDrops: 0, wins: 0, losses: 0, draws: 0 });
  for (const g of games) {
    for (const d of g.lateDrops || []) row(d.userId).lateDrops++;
    const f = g.final;
    if (g.status !== 'played' || !f) continue;
    for (const id of f.players || []) { const r = row(id); r.committed++; if ((f.noShows || []).includes(id)) r.noShows++; else r.played++; }
    if (f.teams?.length && f.score?.length === f.teams.length) {
      const best = Math.max(...f.score), winners = f.score.filter(s => s === best).length;
      f.teams.forEach((team, k) => {
        for (const id of team) {
          if (!by[id] || (f.noShows || []).includes(id)) continue; // guests and no-shows don't get results
          if (winners === f.teams.length) by[id].draws++; else if (f.score[k] === best) by[id].wins++; else by[id].losses++;
        }
      });
    }
  }
  return Object.values(by).map(r => ({ ...r, reliability: r.committed + r.lateDrops ? r.played / (r.committed + r.lateDrops) : null }));
}

// ---- validation -------------------------------------------------------------------------------
export function cleanGroup(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) { out.name = text(b.name, 60); if (!out.name) bad('Give the group a name'); }
  if (!partial || b.sport !== undefined) { out.sport = SPORTS[b.sport] ? b.sport : bad('Pick a sport'); }
  if (b.location !== undefined) out.location = text(b.location, 120);
  if (b.about !== undefined) out.about = typeof b.about === 'string' ? b.about.trim().slice(0, 600) : '';
  return out;
}

export function cleanGame(b, partial = false) {
  const out = {};
  if (!partial || b.startsAt !== undefined) {
    const t = new Date(b.startsAt);
    if (Number.isNaN(+t)) bad('Pick a date and time');
    if (!partial && +t < Date.now() - 3600e3) bad('That time has already passed');
    out.startsAt = t;
  }
  if (!partial || b.duration !== undefined) out.duration = int(b.duration ?? 90, 15, 600, 'Length (minutes)');
  if (!partial || b.capacity !== undefined) out.capacity = int(b.capacity ?? 10, 2, 200, 'Spots');
  if (!partial || b.minPlayers !== undefined) out.minPlayers = int(b.minPlayers ?? 0, 0, 200, 'Players needed');
  if (out.minPlayers != null && out.capacity != null && out.minPlayers > out.capacity) bad('Players needed can’t be more than the spots');
  if (b.location !== undefined) out.location = text(b.location, 120);
  if (b.notes !== undefined) out.notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 1000) : '';
  if (b.cost !== undefined) { const c = Number(b.cost || 0); if (!Number.isFinite(c) || c < 0 || c > 10000) bad('Cost must be between 0 and 10,000'); out.cost = Math.round(c * 100) / 100; }
  return out;
}
