import React, { useMemo, useRef, useState } from 'react';

// Small hand-drawn SVG charts for the reader. One series each (so no legend box: the caption names it),
// recessive grid, a direct label on the peak only, a hover/focus tooltip, and the numbers are always in the
// statistical record chapter as a table.

const INK = 'var(--ink-chart)';
const narrow = () => typeof innerWidth === 'number' && innerWidth < 600;
const ACCENT = 'var(--oxblood)';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

// Columns, one per season. data: [{ key, label, value, note }]
export function SeasonColumns({ data, format = v => v, caption, height = 200 }) {
  const [hi, setHi] = useState(-1);
  const box = useRef(null);
  const W = narrow() ? 400 : 640, H = narrow() ? height * 0.8 : height, L = 34, B = 26, T = 18;
  const vals = data.map(d => d.value).filter(v => v != null);
  const max = niceMax(Math.max(...vals, 0));
  const peak = vals.length ? data.findIndex(d => d.value === Math.max(...vals)) : -1;
  const step = (W - L - 4) / Math.max(data.length, 1);
  const bw = Math.max(2, Math.min(28, step - 2));
  const y = v => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / (narrow() ? 5 : 8));
  const tip = hi >= 0 ? data[hi] : null;
  return (
    <figure className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption} onMouseLeave={() => setHi(-1)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 4} className="tick" textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {data.map((d, k) => {
          const x = L + k * step + (step - bw) / 2;
          const v = d.value;
          return (
            <g key={d.key} onMouseEnter={() => setHi(k)} onFocus={() => setHi(k)} onBlur={() => setHi(-1)} tabIndex={0} aria-label={`${d.label}: ${v == null ? 'no figure' : format(v)}${d.note ? `, ${d.note}` : ''}`}>
              <rect x={L + k * step} y={T} width={step} height={H - T - B} fill="transparent" />
              {v != null && v > 0 && <path d={bar(x, y(v), bw, y(0) - y(v))} fill={k === peak ? ACCENT : INK} opacity={hi < 0 || hi === k ? 1 : 0.55} />}
              {k % every === 0 && <text x={x + bw / 2} y={H - 8} className="tick" textAnchor="middle">{d.short || d.label}</text>}
            </g>
          );
        })}
        {peak >= 0 && <text x={Math.min(W - 30, L + peak * step + step / 2)} y={y(data[peak].value) - 5} className="peak" textAnchor="middle">{format(data[peak].value)}</text>}
        <line x1={L} x2={W} y1={y(0)} y2={y(0)} className="axis" />
      </svg>
      {tip && (
        <div className="tip" style={{ left: `${((L + hi * step + step / 2) / W) * 100}%` }} role="presentation">
          <strong>{tip.label}</strong> {tip.value == null ? 'no figure' : format(tip.value)}{tip.note ? <span>{tip.note}</span> : null}
        </div>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Rounded top corners only (4px), square at the baseline.
function bar(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// A running total over seasons, drawn as a stepped line with a light fill.
export function Accumulation({ data, format = v => v, caption, height = 180 }) {
  const [hi, setHi] = useState(-1);
  const W = narrow() ? 400 : 640, H = narrow() ? height * 0.8 : height, L = 46, B = 26, T = 18;
  const pts = useMemo(() => { let s = 0; return data.map(d => ({ ...d, total: (s += d.value || 0) })); }, [data]);
  const max = niceMax(pts.length ? pts[pts.length - 1].total : 1);
  const x = k => L + (pts.length < 2 ? (W - L) / 2 : (k / (pts.length - 1)) * (W - L - 8));
  const y = v => T + (H - T - B) * (1 - v / max);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(k)},${y(p.total)}`).join('');
  const every = Math.ceil(pts.length / (narrow() ? 5 : 8));
  const tip = hi >= 0 ? pts[hi] : null;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption} onMouseLeave={() => setHi(-1)}>
        {[0, max / 2, max].map(t => (
          <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 6} y={y(t) + 4} className="tick" textAnchor="end">{format(t)}</text></g>
        ))}
        {pts.length > 1 && <path d={`${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} className="area" />}
        <path d={line} className="line" />
        {pts.map((p, k) => (
          <g key={p.key} onMouseEnter={() => setHi(k)} onFocus={() => setHi(k)} onBlur={() => setHi(-1)} tabIndex={0} aria-label={`${p.label}: ${format(p.total)} in total`}>
            <rect x={x(k) - (W - L) / pts.length / 2} y={T} width={(W - L) / pts.length} height={H - T - B} fill="transparent" />
            <circle cx={x(k)} cy={y(p.total)} r={hi === k ? 5 : 0} className="dot" />
            {k % every === 0 && <text x={x(k)} y={H - 8} className="tick" textAnchor="middle">{p.short || p.label}</text>}
          </g>
        ))}
        {pts.length > 0 && <text x={x(pts.length - 1) - 4} y={y(pts[pts.length - 1].total) - 8} className="peak" textAnchor="end">{format(pts[pts.length - 1].total)}</text>}
        <line x1={L} x2={W} y1={y(0)} y2={y(0)} className="axis" />
      </svg>
      {tip && <div className="tip" style={{ left: `${(x(hi) / W) * 100}%` }}><strong>{tip.label}</strong> {format(tip.total)} <span>+{format(tip.value || 0)} that season</span></div>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
