// The statistical engine: which criteria each player meets, and the regions (intersections) they fall in. It knows
// nothing about drawing: colors, circle positions and visualization styles never change its results.
//
// criteria: [{ id, stat, op: '>=' | '>' | '<=' | '<', value }]
// rows: [{ id, name, short, team: { id, abbr, color }, headshot, v: { stat: value }, n: sample }]
// A player is placed by his mask: bit i set when he meets criterion i. Players meeting none are left out. A statistic
// he lacks the sample for (a 1-for-1 free-throw night, say) counts as not met, and he's listed as short of the sample.
import { statMap } from './stats/catalog.js';
import { hasSample, DEFAULT_MINIMUMS } from './stats/compute.js';

export const OPS = { '>=': '≥', '>': '>', '<=': '≤', '<': '<' };
const EPS = 1e-9;
export function compare(v, op, t) {
  if (op === '>=') return v >= t - EPS;
  if (op === '>') return v > t + EPS;
  if (op === '<=') return v <= t + EPS;
  if (op === '<') return v < t - EPS;
  return false;
}

export const maskList = n => Array.from({ length: (1 << n) - 1 }, (_, i) => i + 1);
export const bits = mask => { const out = []; for (let i = 0; mask >> i; i++) if ((mask >> i) & 1) out.push(i); return out; };
export const degree = mask => bits(mask).length;

// -> { players: [{ ...row, mask, values: [v per criterion], shortOf: [criteria he lacks the sample for] }], regions: [{ mask,
// players }] for every mask (empty ones too), setSizes: [count per criterion], total, maxGames, smallSample: n }
export function evaluate(rows, criteria, { mode = 'daily', minimums = DEFAULT_MINIMUMS, exclude = [], teams = [], players = [] } = {}) {
  const stats = statMap(mode);
  const maxGames = mode === 'season' ? Math.max(1, ...rows.map(r => r.n?.gp || 0)) : 1;
  const skip = new Set(exclude.map(String)), onlyTeams = new Set(teams.map(String)), only = new Set(players.map(String));
  const out = [];
  let smallSample = 0;
  for (const r of rows) {
    if (skip.has(String(r.id))) continue;
    if (onlyTeams.size && !onlyTeams.has(String(r.team?.id))) continue;
    if (only.size && !only.has(String(r.id))) continue;
    let mask = 0, shortOf = [];
    const values = criteria.map((c, i) => {
      const s = stats.get(c.stat), v = r.v?.[c.stat];
      if (!s || v == null || !Number.isFinite(v)) return null;
      if (!hasSample(s, r.n, mode, minimums, maxGames)) { shortOf.push(i); return v; }
      if (compare(v, c.op, +c.value)) mask |= 1 << i;
      return v;
    });
    if (shortOf.length && !mask) smallSample++;
    if (mask) out.push({ ...r, mask, values, shortOf });
  }
  // Within a region, the strongest first: by how far past the first criterion it meets (then by name).
  const strength = p => bits(p.mask).reduce((s, i) => {
    const c = criteria[i], st = stats.get(c.stat), scale = Math.max(Math.abs(+c.value), st?.kind === 'percentage' ? 10 : 1);
    return s + ((c.op[0] === '>' ? 1 : -1) * (p.values[i] - c.value)) / scale;
  }, 0);
  out.sort((a, b) => degree(b.mask) - degree(a.mask) || strength(b) - strength(a) || a.name.localeCompare(b.name));
  const regions = maskList(criteria.length).map(mask => ({ mask, players: out.filter(p => p.mask === mask) }));
  const setSizes = criteria.map((_, i) => out.filter(p => p.mask & (1 << i)).length);
  return { players: out, regions, setSizes, total: out.length, maxGames, smallSample };
}

// A stable key for a configuration (to avoid duplicate diagrams of the same date and setup).
export function configKey(cfg) {
  const crit = (cfg.criteria || []).map(c => `${c.stat}${c.op}${+c.value}`).join('|');
  const scope = cfg.mode === 'daily' ? `d:${cfg.date}` : `s:${cfg.season}:${cfg.stype || 2}:${cfg.from || ''}:${cfg.to || ''}`;
  const filt = `${(cfg.teams || []).join(',')};${(cfg.exclude || []).join(',')}`;
  return `${scope}#${crit}#${filt}`;
}
