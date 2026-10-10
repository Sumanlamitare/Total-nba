// Betting math: odds, removing the vig, distributions, expected value, Kelly. Pure functions, no I/O.

// ---- odds ----
export const toDecimal = am => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
export const implied = am => 1 / toDecimal(am);
export const toAmerican = p => (p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100));

// Two-way market with the bookmaker's margin removed: multiplicative (default) or power method
export function devig(amA, amB, method = 'mult') {
  const a = implied(amA), b = implied(amB);
  if (method === 'power') {
    let lo = 1, hi = 3; // k with a^k + b^k = 1
    for (let i = 0; i < 60; i++) { const k = (lo + hi) / 2; if (a ** k + b ** k > 1) lo = k; else hi = k; }
    const k = (lo + hi) / 2;
    return [a ** k, b ** k];
  }
  return [a / (a + b), b / (a + b)];
}
export const ev = (p, am) => p * toDecimal(am) - 1; // return per 1 unit staked
// Kelly stake as a share of bankroll: quarter Kelly, capped (research: 1/4 Kelly, 1-2% cap)
export function kelly(p, am, frac = 0.25, cap = 0.02) {
  const b = toDecimal(am) - 1, f = (b * p - (1 - p)) / b;
  return Math.max(0, Math.min(cap, f * frac));
}
const clamp = p => Math.min(0.995, Math.max(0.005, p));
const logit = p => Math.log(p / (1 - p));
const sigmoid = x => 1 / (1 + Math.exp(-x));
// Blend the model toward the market in log-odds; w = weight on the model
export const blend = (pModel, pMarket, w) => sigmoid(w * logit(clamp(pModel)) + (1 - w) * logit(clamp(pMarket)));

// ---- distributions ----
// standard normal CDF
export function phi(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
// Normal for whole-number stats (points, yards) with a continuity correction; whole lines can push
export function normalLine(mu, sd, line) {
  sd = Math.max(sd, 0.5);
  const F = x => phi((x - mu) / sd);
  if (Number.isInteger(line)) {
    const under = F(line - 0.5), push = F(line + 0.5) - under;
    return { over: 1 - under - push, under, push };
  }
  const under = F(line);
  return { over: 1 - under, under, push: 0 };
}
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
// Count stats: negative binomial with mean mu and variance v; Poisson when v <= mu
export function countPmf(mu, v) {
  mu = Math.max(mu, 0.01);
  const out = [], top = Math.ceil(mu * 5 + 20);
  if (v <= mu * 1.02) {
    let p = Math.exp(-mu);
    for (let k = 0; k <= top; k++) { out.push(p); p *= mu / (k + 1); }
    return out;
  }
  const r = (mu * mu) / (v - mu), q = r / (r + mu);
  for (let k = 0; k <= top; k++) out.push(Math.exp(logGamma(k + r) - logGamma(r) - logGamma(k + 1) + r * Math.log(q) + k * Math.log(1 - q)));
  return out;
}
export function countLine(mu, v, line) {
  const pmf = countPmf(mu, v), tot = pmf.reduce((a, b) => a + b, 0);
  let under = 0, push = 0;
  pmf.forEach((p, k) => { if (k < line) under += p; else if (k === line) push += p; });
  under /= tot; push /= tot;
  return { over: Math.max(0, 1 - under - push), under, push };
}
// P(over) among decided bets (pushes are refunded)
export const decided = r => (r.over + r.under > 0 ? r.over / (r.over + r.under) : 0.5);

// ---- small-sample helpers ----
// exponentially weighted mean of values ordered newest first; halfLife in games
export function ewMean(values, halfLife) {
  let s = 0, w = 0;
  values.forEach((x, i) => { const wi = 0.5 ** (i / halfLife); s += wi * x; w += wi; });
  return w ? s / w : 0;
}
export const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const variance = a => { if (a.length < 2) return 0; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
// Wilson 95% interval for a hit rate
export function wilson(hits, n) {
  if (!n) return [0, 1];
  const z = 1.96, p = hits / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
