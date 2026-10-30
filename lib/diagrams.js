// Diagrams: a configuration evaluated on the data, stored with everything needed to show, recreate and share it.
// A diagram's key is its scope plus criteria and filters; the same key on unchanged data never makes a second copy, and
// changed data (a stat correction) makes a new version and marks the old one superseded.
import crypto from 'node:crypto';
import { evaluate, configKey } from './engine.js';
import { statMap, criterionLabel, catalog, availableStats } from './stats/catalog.js';
import { DEFAULT_MINIMUMS } from './stats/compute.js';
import { dailyRows, seasonRows, seasonInfo } from './data.js';

export const DEFAULTS = {
  daily: { criteria: [{ stat: 'reb', op: '>=', value: 10 }, { stat: 'ast', op: '>=', value: 6 }, { stat: 'ft_pct', op: '>=', value: 90 }] },
  season: { stype: 'regular', criteria: [{ stat: 'pts_pg', op: '>=', value: 25 }, { stat: 'reb_pg', op: '>=', value: 10 }, { stat: 'ast_pg', op: '>=', value: 5 }] },
  minimums: DEFAULT_MINIMUMS,
};
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

export async function getSettings(d) {
  const s = await d.collection('settings').findOne({ _id: 'defaults' });
  return { daily: s?.daily || DEFAULTS.daily, season: s?.season || DEFAULTS.season, minimums: { daily: { ...DEFAULTS.minimums.daily, ...s?.minimums?.daily }, season: { ...DEFAULTS.minimums.season, ...s?.minimums?.season } }, hasPasscode: !!s?.passcode };
}

const longDate = date => new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = date => new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
const STYPE = { regular: 'Regular Season', playoffs: 'Playoffs', all: 'Regular Season + Playoffs' };

// Title and period for a configuration.
export function describe(cfg) {
  if (cfg.mode === 'daily') return { title: longDate(cfg.date), period: 'Single night' };
  const range = cfg.from || cfg.to ? `${cfg.from ? shortDate(cfg.from) : 'Start'} – ${cfg.to ? shortDate(cfg.to) : 'today'}` : 'Season to date';
  return { title: `${seasonLabel(cfg.season)} ${STYPE[cfg.stype || 'regular']}`, period: range };
}

// The rows for a configuration's scope, with what the data says about it.
export async function rowsFor(d, cfg) {
  if (cfg.mode === 'daily') {
    const [rows, day] = await Promise.all([dailyRows(d, cfg.date), d.collection('days').findOne({ _id: cfg.date })]);
    return { rows, meta: { games: day?.games ?? 0, final: day?.final ?? 0, excluded: day?.excluded || [], pending: day?.pending ?? 0, complete: !!day?.complete, noGames: !!day?.noGames, checksum: day?.checksum || null, updated: day?.checkedAt || null } };
  }
  const rows = await seasonRows(d, cfg);
  const figs = await d.collection('meta').findOne({ _id: `figs:${cfg.season}:${cfg.stype === 'playoffs' ? 3 : 2}` });
  const last = rows.reduce((m, r) => (r.last > m ? r.last : m), '');
  return { rows, meta: { players: rows.length, through: last || null, maxGames: Math.max(0, ...rows.map(r => r.v.gp || 0)), complete: true, checksum: hash(`${rows.length}:${last}:${rows.reduce((s, r) => s + (r.v.pts_tot || 0), 0)}:${figs?.at || ''}`), updated: figs?.at || null } };
}

// Normalize criteria (known statistics, valid operators and numbers) and label them.
export function cleanCriteria(mode, criteria) {
  const stats = statMap(mode);
  return (criteria || []).filter(c => stats.has(c.stat) && ['>=', '>', '<=', '<'].includes(c.op) && Number.isFinite(+c.value)).slice(0, 12)
    .map((c, i) => ({ id: c.id ?? i, stat: c.stat, op: c.op, value: +c.value, label: criterionLabel(stats.get(c.stat), c.op, +c.value) }));
}

const compactPlayer = p => ({ id: p.id, name: p.name, short: p.short, headshot: p.headshot, team: p.team ? { id: p.team.id, abbr: p.team.abbr, color: p.team.color } : null, mask: p.mask, values: p.values.map(v => (v == null ? null : Math.round(v * 1000) / 1000)), shortOf: p.shortOf?.length ? p.shortOf : undefined, gp: p.v?.gp, min: p.v?.min ?? p.v?.min_pg });

// Evaluate and store. kind: 'daily' | 'season' | 'custom'. Returns the stored diagram (existing if nothing changed).
export async function generate(d, { kind, config, style = null, auto = false }) {
  const settings = await getSettings(d);
  const cfg = { ...config, criteria: cleanCriteria(config.mode, config.criteria) };
  if (!cfg.criteria.length) throw Object.assign(new Error('Pick at least one criterion'), { status: 400 });
  const { rows, meta } = await rowsFor(d, cfg);
  const minimums = cfg.minimums || settings.minimums;
  const result = evaluate(rows, cfg.criteria, { mode: cfg.mode, minimums, exclude: cfg.exclude, teams: cfg.teams, players: cfg.players });
  const key = `${kind}:${configKey(cfg)}`;
  const checksum = hash(`${meta.checksum}|${JSON.stringify(minimums)}|${JSON.stringify(style || {})}`);
  const latest = await d.collection('diagrams').findOne({ key, latest: true });
  if (latest && latest.checksum === checksum) return latest;
  const { title, period } = describe(cfg);
  const doc = {
    _id: kind === 'custom' ? crypto.randomBytes(6).toString('base64url') : `${kind}-${hash(key)}-v${(latest?.version || 0) + 1}`,
    key, kind, auto, date: cfg.mode === 'daily' ? cfg.date : cfg.to || meta.through || null, season: cfg.season || null, mode: cfg.mode,
    config: cfg, style, title, period, minimums,
    result: { players: result.players.map(compactPlayer), setSizes: result.setSizes, total: result.total, smallSample: result.smallSample, maxGames: result.maxGames },
    meta: { ...meta, rows: rows.length }, checksum, version: (latest?.version || 0) + 1, latest: true, createdAt: new Date(),
    ...(latest ? { corrects: latest._id } : {}),
  };
  await d.collection('diagrams').insertOne(doc);
  if (latest) await d.collection('diagrams').updateOne({ _id: latest._id }, { $set: { latest: false, supersededBy: doc._id } });
  return doc;
}

// The day's automatic diagrams: the default daily one, and the season to date through that day.
export async function ensureDefaults(d, date, season) {
  const s = await getSettings(d);
  const daily = await generate(d, { kind: 'daily', auto: true, config: { mode: 'daily', date, season, criteria: s.daily.criteria } });
  let seasonDia = null;
  const info = await seasonInfo(d, season).catch(() => null);
  const stype = info?.playoffStart && date >= info.playoffStart ? 'playoffs' : (s.season.stype || 'regular');
  const seasonCrit = s.season.criteria;
  if ((await d.collection('pgames').countDocuments({ season, stype: stype === 'playoffs' ? { $in: [3, 5] } : 2, date: { $lte: date } }, { limit: 1 })) > 0) {
    seasonDia = await generate(d, { kind: 'season', auto: true, config: { mode: 'season', season, stype, to: date, criteria: seasonCrit } });
  }
  return { daily, season: seasonDia };
}

// The statistics a scope can use (box-score and computed always; ESPN's season figures when they have real values).
export const statsFor = (mode, rows) => availableStats(mode, rows);
export const allStats = mode => catalog(mode);
