// Game intelligence: reads a game's play-by-play from the first play to the latest and finds the stories in it —
// team scoring runs, one player's solo runs, close finishes, comebacks (developing, completed, failed), blowouts and
// collapses, overtime, clutch scoring, offensive and defensive game winners. Walking the whole game every time makes it
// idempotent: each story has a stable key (the play that started it), so a tick that comes late still finds a run that
// started and ended in between, and the feed updates a story instead of duplicating it. "Momentum" is never claimed as
// a measurement: stories describe scoring and possession patterns.
//
// Stories from a game in progress are "developing"; outcomes (game winners, completed comebacks) are only created from a
// final game whose box score has been verified.
import { pick, possessive } from './voice.js';

const secs = c => { const m = String(c || '').match(/^(\d+):(\d+(?:\.\d+)?)$/); return m ? +m[1] * 60 + +m[2] : Number.isFinite(parseFloat(c)) ? parseFloat(c) : 0; };
const periodLen = p => (p <= 4 ? 720 : 300);
const elapsed = (p, c) => (p <= 4 ? (p - 1) * 720 : 2880 + (p - 5) * 300) + (periodLen(p) - secs(c));
const qName = p => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);
const clockLabel = (p, c) => `${qName(p)} ${c}`;
const art = n => (/^(8|11|18)$/.test(String(n)) || /^8/.test(String(n)) ? 'an' : 'a');
const fmtDur = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);

export const INTEL_DEFAULTS = {
  run: { min: 8, oppShare: 0.25, minQ4: 8, minEarly: 12 },
  solo: { consecutive: 10, consecutiveLate: 8, share: 0.7, sharePts: 14, window: 360 },
  close: { clutchMargin: 5, clutchSeconds: 300 },
  comeback: { minDeficit: 15, cut: 10 },
  blowout: { lead: 25 },
  collapse: { lead: 15, drop: 12 },
  clutchPoints: 8,
};

export function analyze(center, opts = {}) {
  const O = { ...INTEL_DEFAULTS, ...opts };
  const g = center.game, plays = center.plays || [];
  if (!plays.length || g.teams.length !== 2) return [];
  const home = g.teams.find(t => t.home) || g.teams[1], away = g.teams.find(t => !t.home) || g.teams[0];
  const T = { [home.id]: home, [away.id]: away };
  const other = tid => (tid === home.id ? away.id : home.id);
  const P = new Map(center.players.map(p => [p.id, p]));
  const byName = new Map(center.players.map(p => [p.name?.toLowerCase(), p]));
  const final = g.status === 'final';
  const stories = [];
  const base = (key, category, idx, extra = {}) => {
    const p = plays[idx];
    return { key: `${g.id}:${key}`, category, gid: g.id, occurredAt: p?.wall ? new Date(p.wall) : null, period: p?.period, clock: p?.clock,
      score: p ? { [away.abbr]: p.away, [home.abbr]: p.home } : null, scoreLine: p ? `${away.abbr} ${p.away} – ${home.abbr} ${p.home} · ${clockLabel(p.period, p.clock)}` : null, ...extra };
  };
  const margin = (p, tid) => (tid === home.id ? p.home - p.away : p.away - p.home); // tid's lead after play p
  const short = tid => T[tid]?.short || T[tid]?.abbr;
  const name = pid => P.get(pid)?.name || 'Unknown player';
  const lastName = pid => { const n = name(pid).split(' '); return n.length > 1 ? n.slice(1).join(' ') : n[0]; };

  // Scoring plays with their team, points and shooter.
  const scoring = [];
  plays.forEach((p, i) => { if (p.scoring && p.value > 0 && p.team) scoring.push({ i, team: p.team, pts: p.value, shooter: p.players[0] || null, assister: p.players[1] && !/free throw/i.test(p.type + p.text) && /assist/i.test(p.text) ? p.players[1] : null, ft: /free throw/i.test(p.type + ' ' + p.text), three: p.value === 3, t: elapsed(p.period, p.clock), period: p.period, clock: p.clock }); });

  // ── Team scoring runs ─────────────────────────────────────────────────────────────────────────────────────────
  const runs = new Map();
  for (let k = 0; k < scoring.length; k++) {
    const end = scoring[k], team = end.team;
    let a = 0, b = 0, best = null;
    for (let j = k; j >= 0; j--) {
      const s = scoring[j];
      if (s.team === team) a += s.pts; else b += s.pts;
      if (s.team !== team) continue; // a run starts with the running team's basket
      if (j > 0 && scoring[j - 1].team === team) continue; // …right after the opponent's last score (or the tip)
      if (b <= Math.floor(a * O.run.oppShare) && (!best || a - b > best.a - best.b)) best = { j, a, b };
    }
    if (!best) continue;
    const startP = plays[scoring[best.j].i], endP = plays[end.i];
    const late = endP.period >= 4, early = endP.period <= 2;
    const min = late ? O.run.minQ4 : early ? O.run.minEarly : O.run.min;
    if (best.a < min) continue;
    const before = scoring[best.j].i > 0 ? plays[scoring[best.j].i - 1] : { home: 0, away: 0 };
    const mBefore = margin(before, team), mAfter = margin(endP, team);
    const flipped = mBefore < 0 && mAfter > 0, erased = mBefore < 0 && mAfter >= 0;
    const contrib = {};
    for (let j = best.j; j <= k; j++) if (scoring[j].team === team && scoring[j].shooter) contrib[scoring[j].shooter] = (contrib[scoring[j].shooter] || 0) + scoring[j].pts;
    const leaders = Object.entries(contrib).sort((x, y) => y[1] - x[1]);
    let sig = 28 + (best.a - best.b) * 2.4 + (best.b === 0 ? 5 : 0) + (flipped ? 15 : erased ? 10 : 0) + (mBefore <= -10 && erased ? 10 : 0) + (late ? 12 : 0) + (late && Math.abs(mAfter) <= 5 ? 8 : 0);
    if (Math.abs(mAfter) >= 25 && !flipped) sig -= 15; // padding a blowout
    if (!late && !flipped && !erased) sig -= 10; // mid-game runs that don't change who leads are rarely the story
    const key = `run:${team}:${plays[scoring[best.j].i].id}`;
    const runLabel = `${best.a}–${best.b}`;
    const dur = Math.max(0, end.t - scoring[best.j].t);
    const story = base(key, 'run', end.i, {
      team: team, significance: Math.round(sig), span: [scoring[best.j].i, end.i], diff: best.a - best.b, status: final ? 'final' : 'developing',
      facts: { run: runLabel, a: best.a, b: best.b, unanswered: best.b === 0, start: clockLabel(startP.period, startP.clock), end: clockLabel(endP.period, endP.clock), duration: fmtDur(dur),
        before: `${away.abbr} ${before.away} – ${home.abbr} ${before.home}`, after: `${away.abbr} ${endP.away} – ${home.abbr} ${endP.home}`, marginBefore: mBefore, marginAfter: mAfter, flipped, erased,
        contributors: leaders.slice(0, 4).map(([pid, pts]) => ({ pid, name: name(pid), pts })) },
      players: leaders.slice(0, 2).map(([pid]) => pid),
      stats: [{ label: 'Run', value: runLabel }, { label: 'Span', value: fmtDur(dur) }, ...(leaders[0] ? [{ label: lastName(leaders[0][0]), value: `${leaders[0][1]} pts` }] : [])],
    });
    story.headline = pick(key, best.b === 0 ? [`${runLabel} RUN`, `${best.a} UNANSWERED`] : [`${runLabel} RUN`]);
    story.body = `The ${T[team].name} ${best.b === 0 ? `have scored ${best.a} straight` : `are on ${art(best.a)} ${runLabel} run`} against the ${T[other(team)].name}${flipped ? ', flipping the lead' : erased ? `, erasing a ${-mBefore}-point deficit` : mAfter >= 10 ? `, pushing the lead to ${mAfter}` : ''}. ${leaders[0] ? `${name(leaders[0][0])} has ${leaders[0][1]} in the stretch.` : ''}`.trim();
    if (final || k < scoring.length - 1) story.body = story.body.replace(/ have scored | are on an? /, m => (m.includes('scored') ? ' scored ' : ` went on ${m.trim().split(' ').pop()} `)).replace(' has ', ' had ');
    runs.set(key, story);
  }
  // Keep each run's largest version (the same key appears as the run grows), and of overlapping runs by the same team
  // only the biggest: one stretch is one story.
  const kept = [];
  for (const r of [...runs.values()].sort((a, b) => b.diff - a.diff || b.significance - a.significance)) {
    if (kept.some(k => k.team === r.team && k.span[0] <= r.span[1] && r.span[0] <= k.span[1])) continue;
    kept.push(r);
  }
  stories.push(...kept.map(({ span, diff, ...r }) => r));

  // ── Solo runs: consecutive team points by one player, and one player carrying a stretch ───────────────────────
  for (const tid of [home.id, away.id]) {
    const ts = scoring.filter(s => s.team === tid);
    const solo = new Map();
    for (let k = 0; k < ts.length; k++) {
      const pid = ts[k].shooter; if (!pid) continue;
      let n = 0, j = k;
      while (j >= 0 && ts[j].shooter === pid) { n += ts[j].pts; j--; }
      const startIdx = j + 1;
      const endP = plays[ts[k].i];
      const need = endP.period >= 4 ? O.solo.consecutiveLate : O.solo.consecutive;
      if (n < need) continue;
      const startP = plays[ts[startIdx].i];
      const before = ts[startIdx].i > 0 ? plays[ts[startIdx].i - 1] : { home: 0, away: 0 };
      const oppPts = scoring.filter(s => s.team !== tid && s.i > ts[startIdx].i && s.i < ts[k].i).reduce((a, s) => a + s.pts, 0);
      const shots = plays.slice(ts[startIdx].i, ts[k].i + 1).filter(p => p.shooting && p.players[0] === pid && !/free throw/i.test(p.type + ' ' + p.text));
      const fgm = shots.filter(p => p.scoring).length, fga = shots.length;
      const assisted = ts.slice(startIdx, k + 1).filter(s => s.assister).length;
      const key = `solo:${pid}:${startP.id}`;
      const late = endP.period >= 4;
      const sig = 42 + 2.6 * (n - 8) + (late ? 15 : 0) + (late && Math.abs(margin(endP, tid)) <= 6 ? 10 : 0) + (oppPts === 0 ? 5 : 0);
      const p = P.get(pid);
      const st = base(key, 'solo-run', ts[k].i, {
        team: tid, significance: Math.round(sig), status: final ? 'final' : 'developing', players: [pid],
        facts: { consecutive: n, player: name(pid), team: T[tid].name, oppPts, fgm, fga, assisted, start: clockLabel(startP.period, startP.clock), end: clockLabel(endP.period, endP.clock), before: `${away.abbr} ${before.away} – ${home.abbr} ${before.home}`, after: `${away.abbr} ${endP.away} – ${home.abbr} ${endP.home}` },
        stats: [{ label: 'Straight', value: `${n} pts` }, ...(fga ? [{ label: 'FG', value: `${fgm}-${fga}` }] : []), { label: 'Opp.', value: `${oppPts} pts` }],
      });
      st.headline = pick(key, late ? ['TAKING OVER', 'CAN\'T BE STOPPED', 'TAKEOVER MODE'] : ['ON A HEATER', 'CAN\'T MISS', 'SOLO RUN']);
      st.body = `${p?.name || name(pid)} has scored ${n} consecutive ${T[tid].short} points${oppPts === 0 ? ` while ${T[other(tid)].short} went scoreless` : ''}${fga ? ` (${fgm}-of-${fga} from the field${assisted ? `, ${assisted} assisted` : ''})` : ''}, ${clockLabel(startP.period, startP.clock)} to ${clockLabel(endP.period, endP.clock)}.`;
      if (final || k < ts.length - 1) st.body = st.body.replace(' has scored ', ' scored ');
      solo.set(key, st);
    }
    const soloKept = [];
    for (const st of [...solo.values()].sort((a, b) => b.facts.consecutive - a.facts.consecutive)) if (!soloKept.some(k => k.players[0] === st.players[0] && k.period === st.period)) soloKept.push(st);
    stories.push(...soloKept);
    // Share of a stretch (one per player per quarter): player scored most of the team's points over a few minutes.
    const share = new Map();
    for (let k = 0; k < ts.length; k++) {
      const endT = ts[k].t, win = ts.filter(s => s.t >= endT - O.solo.window && s.t <= endT && s.i <= ts[k].i);
      const teamPts = win.reduce((a, s) => a + s.pts, 0);
      const by = {};
      for (const s of win) if (s.shooter) by[s.shooter] = (by[s.shooter] || 0) + s.pts;
      const [pid, pts] = Object.entries(by).sort((x, y) => y[1] - x[1])[0] || [];
      if (!pid || teamPts < O.solo.sharePts || pts / teamPts < O.solo.share) continue;
      const endP = plays[ts[k].i];
      const key = `share:${pid}:${endP.period}`;
      const prev = share.get(key);
      if (prev && prev.facts.pts >= pts) continue;
      const late = endP.period >= 4;
      const st = base(key, 'solo-run', ts[k].i, {
        team: tid, significance: Math.round(36 + 2 * (pts - 10) + (late ? 14 : 0)), status: final ? 'final' : 'developing', players: [pid],
        facts: { pts, teamPts, player: name(pid), window: fmtDur(O.solo.window), quarter: qName(endP.period) },
        stats: [{ label: name(pid).split(' ').slice(-1)[0], value: `${pts} pts` }, { label: T[tid].abbr, value: `${teamPts} pts` }],
      });
      st.headline = pick(key, ['CARRYING THE LOAD', 'ONE-MAN SHOW']);
      st.body = `${name(pid)} has ${pts} of the ${possessive(T[tid].short)} last ${teamPts} points (${qName(endP.period)}).`;
      share.set(key, st);
    }
    // Drop a share story that a consecutive-points story already tells for the same player and quarter.
    for (const st of share.values()) { const pid = st.players[0]; if (!soloKept.some(s => s.players[0] === pid && s.period === st.period)) stories.push(st); }
  }

  // ── Close games, overtime, comebacks, blowouts, collapses (one pass over every play) ──────────────────────────────
  const maxLead = { [home.id]: 0, [away.id]: 0 }, maxLeadAt = {};
  let closeLevel = {}, leadChanges = 0, ties = 0, lastLeader = null;
  const comeback = {}, blow = {}, collapse = {};
  plays.forEach((p, i) => {
    if (!p.scoring && i < plays.length - 1 && !(p.period >= 5 && i > 0 && plays[i - 1].period < p.period)) return;
    const m = p.home - p.away;
    const leader = m > 0 ? home.id : m < 0 ? away.id : null;
    if (p.scoring) { if (leader && lastLeader && leader !== lastLeader) leadChanges++; if (!leader && lastLeader) ties++; if (leader) lastLeader = leader; }
    for (const tid of [home.id, away.id]) {
      const lead = margin(p, tid);
      if (lead > maxLead[tid]) { maxLead[tid] = lead; maxLeadAt[tid] = i; }
    }
    // Overtime.
    if (p.period >= 5 && !stories.some(s => s.key === `${g.id}:ot:${p.period}`)) {
      const n = p.period - 4;
      const st = base(`ot:${p.period}`, 'overtime', i, { significance: n === 1 ? 55 : 72 + 6 * n, status: 'developing', team: null, players: [],
        facts: { n }, stats: [{ label: 'Period', value: qName(p.period) }] });
      st.headline = n === 1 ? 'HEADED TO OVERTIME' : `${['', '', 'DOUBLE', 'TRIPLE', 'QUADRUPLE'][n] || `${n}X`} OVERTIME`;
      st.body = `The ${away.name} and ${home.name} ${n === 1 ? 'need extra time' : `are going to a ${n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`} overtime`}.`;
      stories.push(st);
    }
    // Close-game classes (fourth quarter and overtime only), escalating within a period.
    const rem = secs(p.clock), am = Math.abs(m);
    if (p.period >= 4) {
      const cls = rem <= 24 && am <= 2 ? 4 : rem <= 120 && am <= 3 ? 3 : rem <= 180 && am <= 6 ? 2 : rem <= O.close.clutchSeconds && am <= O.close.clutchMargin ? 1 : 0;
      if (cls && cls > (closeLevel[p.period] || 0)) {
        closeLevel[p.period] = cls;
        const label = ['', 'CLUTCH TIME', 'TWO-POSSESSION GAME', 'ONE-POSSESSION GAME', m === 0 ? 'TIED, FINAL POSSESSIONS' : 'GAME ON THE LINE'][cls];
        const st = base(`close:${p.period}`, 'close', i, { significance: [0, 40, 50, 62, 75][cls] + (p.period >= 5 ? 6 : 0), status: 'developing', team: null, players: [],
          facts: { cls, label, margin: am, remaining: p.clock, period: qName(p.period), leader: leader ? T[leader].abbr : null } });
        st.headline = label;
        st.body = m === 0 ? `${away.short} and ${home.short} are tied at ${p.home} with ${p.clock} left in ${qName(p.period) === 'Q4' ? 'the fourth' : qName(p.period)}.`
          : `${T[leader].short} lead ${T[other(leader)].short} by ${am} with ${p.clock} left${p.period >= 5 ? ` in ${qName(p.period)}` : ''}.`;
        st.stats = [{ label: 'Margin', value: am === 0 ? 'Tied' : String(am) }, { label: 'Left', value: p.clock }];
        const ix = stories.findIndex(s => s.key === st.key); if (ix >= 0) stories.splice(ix, 1);
        stories.push(st);
      }
    }
    // Comebacks: largest deficit so far, and how much of it is gone.
    for (const tid of [home.id, away.id]) {
      const def = -margin(p, tid);
      const c = comeback[tid] ||= { max: 0, at: 0, state: 0 };
      if (def > c.max) { c.max = def; c.at = i; c.state = 0; c.best = def; }
      if (def < c.best) c.best = def;
      if (c.max < O.comeback.minDeficit) continue;
      const cut = c.max - def;
      const state = def < 0 ? 4 : def === 0 ? 3 : def <= 5 && cut >= O.comeback.cut ? 2 : cut >= O.comeback.cut && def <= c.max / 2 ? 1 : 0;
      if (state > c.state) {
        c.state = state;
        const atP = plays[c.at];
        const run = scoring.filter(s => s.i > c.at && s.i <= i);
        const forPts = run.filter(s => s.team === tid).reduce((a, s) => a + s.pts, 0), againstPts = run.filter(s => s.team !== tid).reduce((a, s) => a + s.pts, 0);
        const scorers = {};
        for (const s of run) if (s.team === tid && s.shooter) scorers[s.shooter] = (scorers[s.shooter] || 0) + s.pts;
        const lead = Object.entries(scorers).sort((x, y) => y[1] - x[1]).slice(0, 3);
        const labels = ['', 'COMEBACK WATCH', 'COMEBACK UNDERWAY', 'ALL SQUARED UP', 'THEY\'RE IN FRONT'];
        const st = base(`comeback:${tid}`, 'comeback', i, {
          team: tid, significance: 38 + 1.6 * c.max + state * 6 + (p.period >= 4 ? 8 : 0), status: 'developing', players: lead.map(x => x[0]),
          facts: { deficit: c.max, deficitAt: clockLabel(atP.period, atP.clock), current: Math.max(0, def), lead: def < 0 ? -def : 0, forPts, againstPts, state, label: labels[state], scorers: lead.map(([pid, pts]) => ({ pid, name: name(pid), pts })) },
          stats: [{ label: 'Trailed by', value: String(c.max) }, { label: def <= 0 ? (def < 0 ? 'Lead' : 'Now') : 'Now down', value: def < 0 ? String(-def) : def === 0 ? 'Tied' : String(def) }, { label: 'Since', value: `${forPts}–${againstPts}` }],
        });
        st.headline = labels[state];
        st.body = `The ${T[tid].name} trailed by ${c.max} (${clockLabel(atP.period, atP.clock)}). ${def < 0 ? `They lead by ${-def}` : def === 0 ? 'It\'s tied' : `They've cut it to ${def}`} with ${p.clock} left in ${qName(p.period)} after a ${forPts}–${againstPts} stretch${lead[0] ? `, ${lead[0][1]} of those from ${name(lead[0][0])}` : ''}.`;
        // One story per team: replace the earlier stage.
        const ix = stories.findIndex(s => s.key === st.key); if (ix >= 0) stories.splice(ix, 1);
        stories.push(st);
      }
    }
    // Blowouts and collapses.
    for (const tid of [home.id, away.id]) {
      const lead = margin(p, tid);
      const b = blow[tid] ||= 0;
      const lvl = lead >= O.blowout.lead + 15 ? 3 : lead >= O.blowout.lead + 7 ? 2 : lead >= O.blowout.lead ? 1 : 0;
      if (lvl > b) {
        blow[tid] = lvl;
        const st = base(`blowout:${tid}`, 'blowout', i, { team: tid, significance: 26 + lvl * 9 + (lead >= 40 ? 10 : 0), status: 'developing', players: [],
          facts: { lead, level: lvl }, stats: [{ label: 'Lead', value: String(lead) }, { label: 'At', value: clockLabel(p.period, p.clock) }] });
        st.headline = lvl === 3 ? 'TOTAL ROUT' : lvl === 2 ? 'BLOWOUT' : 'RUNNING AWAY WITH IT';
        st.body = `The ${T[tid].name} lead the ${T[other(tid)].name} by ${lead} (${clockLabel(p.period, p.clock)}).`;
        const ix = stories.findIndex(s => s.key === st.key); if (ix >= 0) stories.splice(ix, 1);
        stories.push(st);
      }
      const ml = maxLead[tid];
      const cs = collapse[tid] ||= 0;
      const stage = ml >= O.collapse.lead && lead < 0 ? 2 : ml >= O.collapse.lead && ml - lead >= O.collapse.drop && lead <= 5 ? 1 : 0;
      if (stage > cs) {
        collapse[tid] = stage;
        const atP = plays[maxLeadAt[tid]];
        const st = base(`collapse:${tid}`, 'collapse', i, { team: tid, significance: 40 + ml * 1.3 + stage * 8 + (p.period >= 4 ? 8 : 0), status: 'developing', players: [],
          facts: { maxLead: ml, maxLeadAt: clockLabel(atP.period, atP.clock), lead, stage }, stats: [{ label: 'Led by', value: String(ml) }, { label: 'Now', value: lead < 0 ? `down ${-lead}` : lead === 0 ? 'tied' : `up ${lead}` }] });
        st.headline = stage === 2 ? 'LEAD IS GONE' : 'COLLAPSE WATCH';
        st.body = `The ${T[tid].name} led by ${ml} (${clockLabel(atP.period, atP.clock)}); ${stage === 2 ? `they now trail by ${-lead}` : `that's down to ${lead}`} with ${p.clock} left in ${qName(p.period)}.`;
        const ix = stories.findIndex(s => s.key === st.key); if (ix >= 0) stories.splice(ix, 1);
        stories.push(st);
      }
    }
  });

  // ── Final-only outcomes ─────────────────────────────────────────────────────────────────────────────────────────
  if (final) {
    const win = g.teams.find(t => t.winner), lose = g.teams.find(t => !t.winner);
    const last = plays.at(-1);
    if (win && lose) {
      // Completed or failed comebacks.
      for (const tid of [home.id, away.id]) {
        const c = comeback[tid]; if (!c || c.max < O.comeback.minDeficit) continue;
        const idx = stories.findIndex(s => s.key === `${g.id}:comeback:${tid}`);
        if (tid === win.id) {
          const atP = plays[c.at];
          const run = scoring.filter(s => s.i > c.at && s.team === tid);
          const scorers = {}; for (const s of run) if (s.shooter) scorers[s.shooter] = (scorers[s.shooter] || 0) + s.pts;
          const lead = Object.entries(scorers).sort((x, y) => y[1] - x[1]).slice(0, 3);
          const st = base(`comeback-done:${tid}`, 'comeback-done', plays.length - 1, { team: tid, significance: 55 + 1.8 * c.max + (atP.period >= 4 ? 10 : 0), status: 'final', players: lead.map(x => x[0]),
            facts: { deficit: c.max, deficitAt: clockLabel(atP.period, atP.clock), final: `${win.abbr} ${win.score} – ${lose.abbr} ${lose.score}`, scorers: lead.map(([pid, pts]) => ({ pid, name: name(pid), pts })) },
            stats: [{ label: 'Trailed by', value: String(c.max) }, { label: 'Final', value: `${win.score}–${lose.score}` }, ...(lead[0] ? [{ label: lastName(lead[0][0]), value: `${lead[0][1]} pts after` }] : [])] });
          st.headline = pick(st.key, [`DOWN ${c.max}. THEY DID IT.`, `FROM ${c.max} DOWN`, `${c.max}-POINT COMEBACK`]);
          st.body = `The ${win.name} trailed by ${c.max} (${clockLabel(atP.period, atP.clock)}) and beat the ${lose.name} ${win.score}–${lose.score}.${lead.length ? ` ${lead.map(([pid, pts]) => `${name(pid)} ${pts}`).join(', ')} after the low point.` : ''}`;
          stories.push(st);
          if (idx >= 0) stories[idx].status = 'final';
        } else if (idx >= 0) {
          const best = c.best;
          stories[idx] = { ...stories[idx], status: 'final', headline: 'COMEBACK FELL SHORT', significance: stories[idx].significance - 10,
            body: `The ${T[tid].name} trailed by ${c.max}, ${best < 0 ? `went ahead by ${-best}` : best === 0 ? 'tied it' : `got within ${best}`}, and still lost ${lose.score}–${win.score}${g.ot ? ` in ${g.ot > 1 ? `${g.ot} overtimes` : 'overtime'}` : ''}.` };
        }
      }
      // Collapses that ended in a loss are told by the comeback story; mark them final.
      for (const s of stories) if (s.category === 'collapse') s.status = 'final';
      for (const s of stories) if (s.category === 'close' || s.category === 'blowout' || s.category === 'overtime') s.status = 'final';
      // Offensive game winner: the basket that gave the winner the lead for good, late in the last period.
      const lastPeriod = last.period;
      let goAhead = null, prevLeader = null;
      for (const s of scoring) {
        const p = plays[s.i];
        const leader = p.home > p.away ? home.id : p.home < p.away ? away.id : null;
        if (leader === win.id && prevLeader !== win.id) goAhead = s;
        prevLeader = leader;
      }
      const gp = goAhead && plays[goAhead.i];
      if (gp && gp.period === lastPeriod && secs(gp.clock) <= 24 && goAhead.shooter) {
        const kind = goAhead.ft ? 'free throws' : goAhead.three ? 'three' : /dunk/i.test(gp.text) ? 'dunk' : /layup/i.test(gp.text) ? 'layup' : 'jumper';
        const buzzer = secs(gp.clock) <= 1;
        const st = base('gw', 'game-winner', goAhead.i, { team: win.id, significance: 80 + (buzzer ? 15 : 0) + (lastPeriod >= 5 ? 3 : 0), status: 'final', players: [goAhead.shooter],
          facts: { player: name(goAhead.shooter), kind, clock: gp.clock, period: qName(gp.period), text: gp.text, buzzer, final: `${win.abbr} ${win.score} – ${lose.abbr} ${lose.score}`, before: `${away.abbr} ${plays[goAhead.i - 1]?.away ?? 0} – ${home.abbr} ${plays[goAhead.i - 1]?.home ?? 0}` },
          stats: [{ label: 'Left', value: gp.clock }, { label: 'Shot', value: kind }, { label: 'Final', value: `${win.score}–${lose.score}` }] });
        st.headline = buzzer ? 'AT THE BUZZER' : kind === 'three' ? 'GAME-WINNING THREE' : kind === 'free throws' ? 'ICE IN THE VEINS' : 'GAME-WINNER';
        st.body = `${name(goAhead.shooter)}'s ${kind === 'free throws' ? 'free throws' : kind} with ${gp.clock} left in ${qName(gp.period) === 'Q4' ? 'the fourth' : qName(gp.period)} gave ${win.short} the lead for good. Final: ${win.short} ${win.score}, ${lose.short} ${lose.score}.`;
        stories.push(st);
      } else {
        // Sealed at the line: free throws in the last 15 seconds that turned a one-possession lead into more.
        const seal = scoring.filter(s => s.team === win.id && s.ft && plays[s.i].period === lastPeriod && secs(plays[s.i].clock) <= 15);
        const firstSeal = seal[0] && plays[seal[0].i];
        const prevP = firstSeal && plays[seal[0].i - 1];
        if (firstSeal && prevP && Math.abs(prevP.home - prevP.away) <= 3 && seal[0].shooter) {
          const pts = seal.filter(s => s.shooter === seal[0].shooter).reduce((a, s) => a + s.pts, 0);
          const st = base('seal', 'game-winner', seal.at(-1).i, { team: win.id, significance: 62, status: 'final', players: [seal[0].shooter],
            facts: { player: name(seal[0].shooter), pts, kind: 'free throws', clock: firstSeal.clock }, stats: [{ label: 'FTs', value: `${pts}` }, { label: 'Left', value: firstSeal.clock }] });
          st.headline = 'SEALED AT THE LINE';
          st.body = `${name(seal[0].shooter)} made ${pts} free throw${pts === 1 ? '' : 's'} in the final ${firstSeal.clock} to close out ${lose.short}. Final: ${win.score}–${lose.score}.`;
          stories.push(st);
        }
      }
      // Defensive game winner: in the last 10 seconds, with the loser within three, a block or steal by the winner — or
      // the defensive rebound of the loser's last miss.
      const tail = plays.filter(p => p.period === lastPeriod && secs(p.clock) <= 10);
      for (let j = tail.length - 1; j >= 0; j--) {
        const p = tail[j];
        const lm = (p.home - p.away) * (win.id === home.id ? 1 : -1); // winner's margin
        if (lm > 3 || lm < 0) continue;
        const blk = p.text.match(/^(.+?) blocks /i), stl = p.text.match(/\(([^)]+?) steals\)/i);
        const who = blk ? byName.get(blk[1].toLowerCase()) : stl ? byName.get(stl[1].toLowerCase()) : null;
        let kind = blk ? 'block' : stl ? 'steal' : null, player = who;
        if (!kind && /defensive rebound/i.test(p.text) && p.team === win.id) { const r = p.text.match(/^(.+?) defensive rebound/i); player = r ? byName.get(r[1].toLowerCase()) : null; kind = player ? 'rebound' : null; }
        if (!kind || !player || player.team !== win.id) continue;
        // The play must end the loser's last real chance: no loser score after it.
        if (scoring.some(s => s.i > plays.indexOf(p) && s.team === lose.id)) continue;
        const st = base('dgw', 'defensive-winner', plays.indexOf(p), { team: win.id, significance: kind === 'rebound' ? 55 : 82, status: 'final', players: [player.id],
          facts: { player: player.name, kind, clock: p.clock, text: p.text, margin: lm, final: `${win.abbr} ${win.score} – ${lose.abbr} ${lose.score}` },
          stats: [{ label: 'Play', value: kind }, { label: 'Left', value: p.clock }, { label: 'Final', value: `${win.score}–${lose.score}` }] });
        st.headline = kind === 'block' ? 'GAME-SAVING BLOCK' : kind === 'steal' ? 'GAME-SAVING STEAL' : 'SECURED IT';
        st.body = kind === 'rebound' ? `${player.name} grabbed the defensive rebound with ${p.clock} left, ending the ${possessive(lose.short)} last chance. Final: ${win.score}–${lose.score}.`
          : `${player.name}'s ${kind} with ${p.clock} left, ${lm === 0 ? 'in a tie game' : `${win.short} up ${lm}`}, ended the ${possessive(lose.short)} chance. Final: ${win.score}–${lose.score}.`;
        stories.push(st);
        break;
      }
    }
  }
  // A collapse and the opponent's comeback are one story: tell it once, from the comeback side.
  const told = new Set(stories.filter(s => s.category === 'comeback' || s.category === 'comeback-done').map(s => s.team));
  for (let i = stories.length - 1; i >= 0; i--) if (stories[i].category === 'collapse' && told.has(other(stories[i].team))) stories.splice(i, 1);
  return stories.map(s => ({ ...s, leadChanges, ties, significance: Math.max(0, Math.min(100, Math.round(s.significance))) }));
}

// The game's situation right now (for the Game Intelligence page): one label per live game, from the latest play.
export function situation(center) {
  const g = center.game, p = (center.plays || []).at(-1);
  if (!p) return null;
  const home = g.teams.find(t => t.home), away = g.teams.find(t => !t.home);
  const m = p.home - p.away, am = Math.abs(m), rem = secs(p.clock);
  const leader = m > 0 ? home : m < 0 ? away : null;
  let label = null, level = 0;
  if (g.status !== 'final' && p.period >= 4) {
    if (rem <= 24 && am <= 2) { label = 'Final possessions'; level = 4; } else if (rem <= 120 && am <= 3) { label = 'One-possession game'; level = 3; } else if (rem <= 180 && am <= 6) { label = 'Two-possession game'; level = 2; } else if (rem <= 300 && am <= 5) { label = 'Clutch time'; level = 1; }
  }
  if (!label && am >= 25) { label = 'Blowout'; level = 0; }
  return { label, level, margin: am, leader: leader?.abbr || null, period: p.period, clock: p.clock, score: `${away.abbr} ${p.away} – ${home.abbr} ${p.home}` };
}
