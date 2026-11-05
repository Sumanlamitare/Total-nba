// Automation settings and thresholds, stored in one document and merged over these defaults.
export const DEFAULTS = {
  detection: {
    live: true, records: true, milestones: true,
    points: [20, 30, 40, 50, 60],
    efficient: { minPts: 25, ts: 70 },
    poorShooting: { fga: 15, fgPct: 30 },
    threeBrick: { tpa: 8 },
    turnovers: 7,
    defense: { stocks: 7, blk: 6, stl: 5 },
    clutch: { pts: 8, seconds: 300, margin: 5 },
    rolePlayer: { avgMax: 12, minPts: 20 },
    outlierZ: 2.5,
    disappointment: { minAvg: 20, ratio: 0.45 },
    minScore: 30, // significance needed to appear as a notable performance
  },
  records: {
    approach: { pts: 6, reb: 4, ast: 4, stl: 2, blk: 2, tpm: 2, fgm: 2, ftm: 3 }, // live: within this of a record or career high
    careerHighStats: ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'],
    topRank: 5, // a game that enters a list at this rank or better is notable
  },
  milestones: {
    steps: { pts: 1000, reb: 1000, ast: 1000, stl: 500, blk: 500, tpm: 500, gp: 100 },
    approach: { pts: 100, reb: 50, ast: 50, stl: 15, blk: 15, tpm: 25, gp: 3 },
  },
  intel: {
    run: { min: 8, oppShare: 0.25, minQ4: 8, minEarly: 12 },
    solo: { consecutive: 10, consecutiveLate: 8, share: 0.7, sharePts: 14, window: 360 },
    close: { clutchMargin: 5, clutchSeconds: 300 },
    comeback: { minDeficit: 15, cut: 10 },
    blowout: { lead: 25 },
    collapse: { lead: 15, drop: 12 },
  },
  feed: {
    minScore: 50, perGameRunCap: 3, boostFavorites: 10,
    categories: Object.fromEntries(['record', 'milestone', 'game-winner', 'defensive-winner', 'comeback', 'comeback-done', 'close', 'overtime', 'run', 'solo-run', 'role-player', 'breakout', 'rookie', 'triple-double', 'scoring', 'defense', 'clutch', 'streak', 'blowout', 'collapse', 'disappointment', 'potn'].map(k => [k, true])),
    streaks: { win: 4, loss: 5, endedFrom: 5 },
    scope: 'all', // all | teams | players (the watchlists below)
  },
  ai: { writing: true, style: 'balanced', maxPerTick: 4 }, // balanced | straight | lively
  // Graphics are made automatically for critical entries, and for high ones in these categories only.
  graphics: { auto: true, formats: ['x_landscape', 'ig_portrait'], high: ['record', 'milestone', 'game-winner', 'defensive-winner', 'comeback-done', 'breakout', 'role-player', 'rookie', 'triple-double', 'potn', 'streak'] },
  notifications: { critical: true, favorites: true, records: true, comebacks: true, gameWinners: true },
  watch: { teams: [], players: [] },
  brand: { name: 'Around the NBA', handle: '@AroundTheNBA', accent: '#ff5a1f' },
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function merge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = k in a ? merge(a[k], v) : v;
  return o;
}

export async function getSettings(d) {
  const s = await d.collection('settings').findOne({ _id: 'main' });
  return merge(DEFAULTS, s?.value || {});
}

// Only keys that exist in DEFAULTS, with the same types, are accepted.
export function sanitize(input, base = DEFAULTS) {
  if (!isObj(input)) return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!(k in base) && base !== DEFAULTS.watch && !isObj(base)) continue;
    const ref = base[k];
    if (ref === undefined) continue;
    if (isObj(ref)) out[k] = sanitize(v, ref);
    else if (Array.isArray(ref)) { if (Array.isArray(v)) out[k] = v.filter(x => typeof x === typeof (ref[0] ?? x)).slice(0, 50).map(x => (typeof x === 'string' ? x.slice(0, 80) : x)); }
    else if (typeof ref === 'number') { const n = Number(v); if (Number.isFinite(n)) out[k] = n; }
    else if (typeof ref === 'boolean') out[k] = !!v;
    else if (typeof ref === 'string') out[k] = String(v).slice(0, 200);
  }
  return out;
}

export async function saveSettings(d, patch, user) {
  const cur = await getSettings(d);
  const next = merge(cur, sanitize(patch));
  await d.collection('settings').updateOne({ _id: 'main' }, { $set: { value: next, updatedAt: new Date(), updatedBy: user?.email || null } }, { upsert: true });
  return next;
}
