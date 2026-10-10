// One game, fully analysed: game lines (spread / total / moneyline), the user's context views (team last 5,
// last 5 meetings, each player's last 5 games and last game vs this opponent), and every player prop priced
// by the model: projection -> probability vs the line -> blended with the market -> edge, EV, stake.
import * as E from './espn.js';
import * as M from './math.js';
import { SPORTS, MODEL, parseGamelog } from './sports.js';

const r1 = x => Math.round(x * 10) / 10;
const r3 = x => Math.round(x * 1000) / 1000;
const day = s => (s || '').slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

// ---- teams ---------------------------------------------------------------------------------
function teamGames(sched, teamId) {
  return (sched?.events || []).map(e => {
    const c = e.competitions?.[0];
    if (!c?.status?.type?.completed) return null;
    const me = c.competitors.find(x => x.team?.id === teamId), op = c.competitors.find(x => x.team?.id !== teamId);
    const pts = x => +(x?.score?.value ?? x?.score?.displayValue ?? x?.score ?? NaN);
    if (!me || !op || Number.isNaN(pts(me))) return null;
    return { id: e.id, date: day(e.date), oppId: op.team.id, opp: op.team.abbreviation, home: me.homeAway === 'home', pf: pts(me), pa: pts(op),
      post: e.seasonType?.type === 3 || /post/i.test(e.seasonType?.name || '') };
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Team strength: points for/against this season, padded with a regressed version of last season
function rating(cur, prev, cfg, league) {
  const k = cfg.game.priorGames, avg = (g, f) => (g.length ? M.mean(g.map(x => x[f])) : league);
  const prior = f => (prev.length ? league + 0.5 * (avg(prev, f) - league) : league);
  const pf = (cur.reduce((s, g) => s + g.pf, 0) + prior('pf') * k) / (cur.length + k);
  const pa = (cur.reduce((s, g) => s + g.pa, 0) + prior('pa') * k) / (cur.length + k);
  return { pf, pa, net: pf - pa, n: cur.length };
}

function sideOf(pModel, pMarket, price, w, minEdge) {
  const p = M.blend(pModel, pMarket, w), be = M.implied(price);
  return { pModel: r3(pModel), pMarket: r3(pMarket), p: r3(p), price, edge: r3(p - be), ev: r3(M.ev(p, price)),
    stake: r3(M.kelly(p, price, MODEL.kellyFrac, MODEL.kellyCap)), qualifies: p - be >= minEdge };
}

function gameLines(pc, home, away, rH, rA, cfg, league, b2b) {
  if (!pc) return null;
  const g = cfg.game;
  const margin = rH.net - rA.net + g.hfa - (b2b.home ? 1.5 : 0) + (b2b.away ? 1.5 : 0); // home margin
  const total = rH.pf + rA.pa - league + rA.pf + rH.pa - league;
  const out = { projMargin: r1(margin), projTotal: r1(total), sides: [] };
  const spread = Math.abs(+pc.spread || 0), homeFav = pc.homeTeamOdds?.favorite;
  const homeLine = pc.spread == null ? null : homeFav ? -spread : spread;
  if (homeLine != null && pc.homeTeamOdds?.spreadOdds && pc.awayTeamOdds?.spreadOdds) {
    const pH = M.decided(M.normalLine(margin, g.sdMargin, -homeLine));
    const [mH, mA] = M.devig(pc.homeTeamOdds.spreadOdds, pc.awayTeamOdds.spreadOdds);
    out.sides.push({ market: 'Spread', pick: `${home.abbr} ${homeLine > 0 ? '+' : ''}${homeLine}`, ...sideOf(pH, mH, pc.homeTeamOdds.spreadOdds, MODEL.wGame, MODEL.minEdgeGame) });
    out.sides.push({ market: 'Spread', pick: `${away.abbr} ${-homeLine > 0 ? '+' : ''}${-homeLine}`, ...sideOf(1 - pH, mA, pc.awayTeamOdds.spreadOdds, MODEL.wGame, MODEL.minEdgeGame) });
  }
  if (pc.overUnder && pc.overOdds && pc.underOdds) {
    const pO = M.decided(M.normalLine(total, g.sdTotal, +pc.overUnder));
    const [mO, mU] = M.devig(pc.overOdds, pc.underOdds);
    out.sides.push({ market: 'Total', pick: `Over ${pc.overUnder}`, ...sideOf(pO, mO, pc.overOdds, MODEL.wGame, MODEL.minEdgeGame) });
    out.sides.push({ market: 'Total', pick: `Under ${pc.overUnder}`, ...sideOf(1 - pO, mU, pc.underOdds, MODEL.wGame, MODEL.minEdgeGame) });
  }
  const mlH = pc.homeTeamOdds?.moneyLine, mlA = pc.awayTeamOdds?.moneyLine;
  if (mlH && mlA) {
    const pH = M.decided(M.normalLine(margin, g.sdMargin, 0));
    const [mH, mA] = M.devig(mlH, mlA);
    out.sides.push({ market: 'Moneyline', pick: home.abbr, ...sideOf(pH, mH, mlH, MODEL.wGame, MODEL.minEdgeGame) });
    out.sides.push({ market: 'Moneyline', pick: away.abbr, ...sideOf(1 - pH, mA, mlA, MODEL.wGame, MODEL.minEdgeGame) });
  }
  out.lines = { spread: homeLine, total: pc.overUnder ?? null, mlHome: mlH ?? null, mlAway: mlA ?? null, provider: pc.provider?.name || 'DraftKings' };
  return out;
}

// ---- players --------------------------------------------------------------------------------
const pick = (s, cands) => { for (const c of cands) if (s[c] != null) return s[c]; return 0; };
function valueFn(sport, mk) {
  const cfg = SPORTS[sport];
  if (sport === 'nba') return r => mk.stats.reduce((t, p) => t + pick(r.s, cfg.keys[p] || [p]), 0);
  return r => mk.stats.reduce((t, p) => t + (r.s[p] || 0), 0);
}
const minutesOf = r => pick(r.s, ['minutes']);

function projectNBA(cur, prev, mk, ctx) {
  const cfg = SPORTS.nba;
  const played = rows => rows.filter(r => minutesOf(r) > 0);
  const c = played(cur), p = played(prev), all = [...c, ...p];
  if (!all.length) return null;
  const mpg = rows => M.mean(rows.map(minutesOf));
  const season = c.length >= 5 ? mpg(c) : (c.reduce((t, r) => t + minutesOf(r), 0) + (p.length ? mpg(p) : mpg(c)) * 5) / (c.length + 5);
  const l5 = mpg(all.slice(0, 5));
  let m0 = cfg.minutesBlend * season + (1 - cfg.minutesBlend) * l5;
  const adj = [];
  if (ctx.b2b) { m0 *= cfg.backToBackCut; adj.push('back-to-back'); }
  if (Math.abs(ctx.spread || 0) >= cfg.blowoutSpread) { m0 *= cfg.blowoutCut; adj.push('blowout risk'); }
  let mu = 0, vPrior = 0;
  const w = all.slice(0, 40).map((_, i) => 0.5 ** (i / cfg.rateHalfLife));
  for (const part of mk.stats) {
    const val = r => pick(r.s, cfg.keys[part] || [part]);
    const priorRows = p.length >= 10 ? p : all;
    const prior = priorRows.reduce((t, r) => t + val(r), 0) / Math.max(1, priorRows.reduce((t, r) => t + minutesOf(r), 0));
    let ws = 0, wm = 0;
    all.slice(0, 40).forEach((r, i) => { ws += w[i] * val(r); wm += w[i] * minutesOf(r); });
    const k = cfg.padMinutes[part] || 300, rate = (ws + prior * k) / (wm + k), m = m0 * rate;
    mu += m; vPrior += (cfg.vmr[part] || 1.3) * m;
  }
  const f = valueFn('nba', mk), obs = all.slice(0, 20).map(f), n = obs.length;
  const v = Math.max(mu * 1.02, (n * M.variance(obs) + 10 * vPrior) / (n + 10));
  return { mu, v, sd: Math.sqrt(v), minutes: m0, n: c.length, adj };
}

function projectNFL(cur, prev, mk) {
  const cfg = SPORTS.nfl, f = valueFn('nfl', mk);
  const c = cur.map(f), p = prev.map(f);
  if (!c.length && !p.length) return null;
  const prior = p.length >= 4 ? M.mean(p) : c.length ? M.mean(c) : M.mean(p);
  const n = c.length, mu = n ? (n * M.ewMean(c, cfg.halfLife) + cfg.padGames * prior) / (n + cfg.padGames) : prior;
  const obs = [...c, ...p].slice(0, 16), no = obs.length, vo = M.variance(obs);
  if (mk.dist === 'normal') {
    const cv = Math.max(...mk.stats.map(s => cfg.cv[s] || 0.5));
    const v = (no * vo + 6 * (cv * mu) ** 2) / (no + 6);
    return { mu, v, sd: Math.sqrt(v), n };
  }
  const vmr = Math.max(...mk.stats.map(s => cfg.vmr[s] || 1.2));
  return { mu, v: Math.max(mu * 0.9, (no * vo + 6 * vmr * mu) / (no + 6)), n };
}

function hitRate(rows, f, line) {
  let o = 0, u = 0;
  for (const r of rows) { const x = f(r); if (x > line) o++; else if (x < line) u++; }
  const n = o + u, [lo, hi] = M.wilson(o, n);
  return { over: o, n, rate: n ? r3(o / n) : null, lo: r3(lo), hi: r3(hi) };
}

// ---- the game -------------------------------------------------------------------------------
export async function analyzeGame(sport, eventId) {
  const cfg = SPORTS[sport];
  if (!cfg) throw Object.assign(new Error('unknown sport'), { status: 400 });
  const sum = await E.summary(sport, eventId);
  if (!sum?.header) throw Object.assign(new Error('game not found'), { status: 404 });
  const comp = sum.header.competitions[0], year = sum.header.season?.year;
  const team = c => ({ id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName, logo: c.team.logos?.[0]?.href || c.team.logo,
    record: c.record?.find(x => x.type === 'total')?.summary || c.record?.[0]?.summary || '' });
  const home = team(comp.competitors.find(c => c.homeAway === 'home')), away = team(comp.competitors.find(c => c.homeAway === 'away'));
  const date = comp.date, status = comp.status?.type || {};

  // team schedules: this season and three before (last 5 meetings can go back years)
  const seasons = [year, year - 1, year - 2, year - 3];
  const [sH, sA] = await Promise.all([home, away].map(t => E.pool(seasons, 4, (y, i) => E.schedule(sport, t.id, y, i > 0))));
  const gH = sH.map(s => teamGames(s, home.id)), gA = sA.map(s => teamGames(s, away.id));
  const before = g => g.filter(x => x.date < day(date));
  const curH = before(gH[0] || []), curA = before(gA[0] || []);
  const allPts = [...curH, ...curA, ...(gH[1] || []), ...(gA[1] || [])];
  const league = allPts.length ? M.mean(allPts.flatMap(x => [x.pf, x.pa])) : sport === 'nba' ? 114 : 22;
  const rH = rating(curH.filter(x => !x.post), (gH[1] || []).filter(x => !x.post), cfg, league);
  const rA = rating(curA.filter(x => !x.post), (gA[1] || []).filter(x => !x.post), cfg, league);
  const b2b = { home: sport === 'nba' && curH[0]?.date === addDays(day(date), -1), away: sport === 'nba' && curA[0]?.date === addDays(day(date), -1) };

  // context: last 5 games (ESPN's own list) and last 5 meetings
  const lastFive = (sum.lastFiveGames || []).map(t => {
    const events = (t.events || []).map(e => ({ date: day(e.gameDate), opp: e.opponent?.abbreviation, home: e.atVs === 'vs', result: e.gameResult, score: e.score }));
    return { teamId: t.team?.id, abbr: t.team?.abbreviation, events, record: `${events.filter(e => e.result === 'W').length}-${events.filter(e => e.result === 'L').length}` };
  });
  const meetings = gH.flat().filter(x => x.oppId === away.id && x.date < day(date)).slice(0, 5)
    .map(x => ({ date: x.date, home: x.home, score: `${x.pf}-${x.pa}`, result: x.pf > x.pa ? 'W' : 'L', post: x.post }));
  const h2h = { team: home.abbr, record: `${meetings.filter(m => m.result === 'W').length}-${meetings.filter(m => m.result === 'L').length}`, meetings };

  const pc = (sum.pickcenter || []).find(p => p.provider?.id === '100') || sum.pickcenter?.[0];
  const lines = gameLines(pc, home, away, rH, rA, cfg, league, b2b);

  // injuries by athlete id
  const injury = {};
  for (const t of sum.injuries || []) for (const i of t.injuries || []) injury[i.athlete?.id] = { status: i.status, detail: i.details?.type || i.shortComment || '' };

  // props: group the sportsbook's items by player + market
  const items = await E.propBets(sport, eventId).catch(() => []);
  const groups = new Map();
  for (const it of items) {
    const aid = it.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1];
    const mk = aid && cfg.market(it.type?.name || '');
    if (!mk) continue;
    const key = aid + '|' + it.type.id;
    const g = groups.get(key) || { aid, ref: it.athlete.$ref, mk, type: it.type.name, line: null, open: null, prices: [] };
    g.line = it.current?.target?.value ?? it.odds?.total?.value ?? g.line ?? (mk.dist === 'td' ? 0.5 : null);
    g.open = it.open?.target?.value ?? it.odds?.total?.open ?? g.open;
    if (it.odds?.american?.value) g.prices.push(+it.odds.american.value);
    groups.set(key, g);
  }
  const players = [...new Set([...groups.values()].map(g => g.aid))];
  const info = new Map(), logs = new Map();
  await E.pool(players, 8, async aid => {
    const ref = [...groups.values()].find(g => g.aid === aid).ref.replace('http:', 'https:');
    const a = await E.get(ref, 86400 * 3);
    const teamId = a?.team?.$ref?.match(/teams\/(\d+)/)?.[1];
    info.set(aid, { name: a?.displayName || a?.fullName || aid, pos: a?.position?.abbreviation || '', teamId, headshot: a?.headshot?.href || '' });
    const [c, p] = await Promise.all([E.gamelog(sport, aid, null, false), E.gamelog(sport, aid, year - 1, true)]);
    logs.set(aid, { cur: parseGamelog(c, year).filter(r => r.date < day(date)), prev: parseGamelog(p, year - 1) });
  });

  const props = [];
  for (const g of groups.values()) {
    const who = info.get(g.aid), lg = logs.get(g.aid);
    if (!who || !lg || g.line == null) continue;
    const inj = injury[g.aid];
    if (/^out$/i.test(inj?.status || '')) continue;
    const isHome = who.teamId === home.id, opp = isHome ? away : home;
    const homeLine = lines?.lines?.spread;
    const proj = sport === 'nba'
      ? projectNBA(lg.cur, lg.prev, g.mk, { b2b: isHome ? b2b.home : b2b.away, spread: homeLine })
      : projectNFL(lg.cur, lg.prev, g.mk);
    if (!proj) continue;
    const f = valueFn(sport, g.mk);
    let pOver, pushProb = 0;
    if (g.mk.dist === 'td') pOver = 1 - Math.exp(-proj.mu);
    else {
      const r = g.mk.dist === 'normal' ? M.normalLine(proj.mu, proj.sd, g.line) : M.countLine(proj.mu, proj.v, g.line);
      pOver = M.decided(r); pushProb = r.push;
    }
    // market: two-way props come without prices from ESPN, so both sides are assumed at -110
    let side, price, pMarket, priced = false;
    if (g.mk.dist === 'td') {
      price = g.prices[0] ?? null;
      if (price == null) continue;
      pMarket = M.implied(price) / 1.05; priced = true; // one-sided market: assume ~5% margin
      side = 'Yes';
    } else {
      priced = g.prices.length >= 2;
      const [po, pu] = priced ? M.devig(g.prices[0], g.prices[1]) : [0.5, 0.5];
      const pFinalOver = M.blend(pOver, po, MODEL.wProp);
      side = pFinalOver >= 0.5 ? 'Over' : 'Under';
      price = priced ? (side === 'Over' ? g.prices[0] : g.prices[1]) : MODEL.assumedPrice;
      pMarket = side === 'Over' ? po : pu;
    }
    const pModel = side === 'Under' ? 1 - pOver : pOver;
    const s = sideOf(pModel, pMarket, price, MODEL.wProp, MODEL.minEdgeProp);
    const flags = [];
    if (!priced) flags.push('price assumed −110');
    if (inj) flags.push(`${inj.status}${inj.detail ? ' (' + inj.detail + ')' : ''}`);
    const minGames = sport === 'nba' ? 5 : 3, thin = proj.n < minGames;
    if (thin) flags.push(`only ${proj.n} games this season — leans on last season`);
    // a model far from the line usually means the book knows something (injury, role change) the stats don't
    const far = pModel > MODEL.maxModel || pModel < 1 - MODEL.maxModel;
    if (far) flags.push('model far from the line — check news (injury / role change) before betting');
    if (proj.adj?.length) flags.push(...proj.adj);
    const moved = g.open != null && g.open !== g.line ? r1(g.line - g.open) : 0;
    // with no posted price the market can't check the model, so ask for twice the edge
    const qualifies = s.qualifies && (priced || s.edge >= MODEL.minEdgeAssumed) && !inj && !thin && !far;
    const vsOpp = [...lg.cur, ...lg.prev].filter(r => r.oppId === opp.id);
    props.push({
      key: `${g.aid}|${g.type}`, aid: g.aid, player: who.name, pos: who.pos, team: isHome ? home.abbr : away.abbr, opp: opp.abbr, headshot: who.headshot,
      market: g.mk.label, type: g.type, line: g.line, open: g.open, moved, side, ...s, qualifies, flags,
      proj: { mu: r1(proj.mu), sd: proj.sd ? r1(proj.sd) : null, minutes: proj.minutes ? r1(proj.minutes) : null, n: proj.n, push: r3(pushProb), pOver: r3(pOver) },
      context: {
        last5: lg.cur.concat(lg.prev).slice(0, 5).map(r => ({ date: r.date, opp: r.opp, home: r.home, result: r.result, value: f(r), line: cfg.lastFiveLine.reduce((o, k) => { const v = sport === 'nba' ? pick(r.s, cfg.keys[k] || [k]) : r.s[k]; if (v) o[k] = v; return o; }, {}) })),
        lastVsOpp: vsOpp[0] ? { date: vsOpp[0].date, value: f(vsOpp[0]), result: vsOpp[0].result, score: vsOpp[0].score } : null,
        hit: {
          l5: hitRate(lg.cur.concat(lg.prev).slice(0, 5), f, g.line), l10: hitRate(lg.cur.concat(lg.prev).slice(0, 10), f, g.line),
          season: hitRate(lg.cur, f, g.line), vsOpp: hitRate(vsOpp, f, g.line),
        },
      },
    });
  }
  // one bet per player-game: only each player's best qualifying prop counts as a pick
  const best = new Map();
  for (const p of props) if (p.qualifies && (!best.has(p.aid) || p.ev > best.get(p.aid).ev)) best.set(p.aid, p);
  for (const p of props) p.pick = best.get(p.aid) === p;
  props.sort((a, b) => (b.pick - a.pick) || b.ev - a.ev);

  return {
    sport, id: eventId, date, status: { state: status.state, detail: status.shortDetail || status.detail || '' }, home, away,
    ratings: { home: { ...rH, pf: r1(rH.pf), pa: r1(rH.pa), net: r1(rH.net) }, away: { ...rA, pf: r1(rA.pf), pa: r1(rA.pa), net: r1(rA.net) }, league: r1(league) },
    b2b, lines, lastFive, h2h,
    injuries: (sum.injuries || []).map(t => ({ abbr: t.team?.abbreviation, list: (t.injuries || []).map(i => ({ name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation, status: i.status })) })),
    predictor: sum.predictor ? { home: +sum.predictor.homeTeam?.gameProjection || null, away: +sum.predictor.awayTeam?.gameProjection || null } : null,
    props, model: MODEL, at: new Date().toISOString(),
  };
}
