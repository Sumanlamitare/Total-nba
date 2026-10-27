// Sharing a night or one performance: the words, and the page that link previews (X, iMessage, WhatsApp...) read.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = d => `${MONTHS[+d.slice(4, 6) - 1]} ${+d.slice(6, 8)}, ${d.slice(0, 4)}`;
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th'}`;

export const statline = l => {
  const s = [`${l.pts} pts`, `${l.reb} reb`, `${l.ast} ast`];
  if (l.stl >= 3) s.push(`${l.stl} stl`);
  if (l.blk >= 3) s.push(`${l.blk} blk`);
  return `${s.join(', ')} on ${l.fgm}-${l.fga} shooting`;
};
// "a 141-135 OT win over NO" / "a 120-124 loss to WSH"
const outcome = p => {
  const m = String(p.result || '').match(/^([WL]) (\d+-\d+)(.*)$/);
  if (!m) return '';
  return `a ${m[2]}${m[3]} ${m[1] === 'W' ? `win over ${p.opp?.abbr}` : `loss to ${p.opp?.abbr}`}`;
};

// One performance: "Nikola Jokic was the Performance of the Night (Oct 24, 2026): 35 pts, 15 reb, 10 ast on 12-23
// shooting in a 141-135 OT win over NO. POTN score 65.9/100"
export function perfText(p, date) {
  const who = p.rank === 1 ? `${p.name} was the Performance of the Night` : `${p.name} had the ${ordinal(p.rank)}-best performance of the night`;
  return `${who} (${dayLabel(date)}): ${statline(p.line)}${outcome(p) ? ` in ${outcome(p)}` : ''}. POTN score ${p.score.toFixed(1)}/100`;
}
// The night: its top five.
export function nightText(night, date) {
  const top = (night.top || []).slice(0, 5);
  if (!top.length) return `Performance of the Night, ${dayLabel(date)}`;
  return `Top performances of ${dayLabel(date)}: ${top.map((p, i) => `${i + 1}. ${p.name} ${p.score.toFixed(1)}`).join(' · ')}`;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The page a shared link lands on: the preview card's tags, then straight on to the night in the app.
export function sharePage({ origin, date, perf, night }) {
  const to = `${origin}/night/${date}${perf ? `?p=${encodeURIComponent(perf.id)}` : ''}`;
  const title = perf ? `${perf.name}: ${perf.score.toFixed(1)} · Performance of the Night` : `Performance of the Night · ${dayLabel(date)}`;
  const text = perf ? perfText(perf, date) : nightText(night, date);
  const image = `${origin}/api/og?date=${date}${perf ? `&p=${encodeURIComponent(perf.id)}` : ''}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(text)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Performance of the Night">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(text)}">
<meta property="og:url" content="${esc(to)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(text)}"><meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(to)}">
<meta http-equiv="refresh" content="0;url=${esc(to)}">
<style>body{background:#0d0f12;color:#e7e9ec;font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#f28b30}</style>
</head><body><p><a href="${esc(to)}">${esc(text)}</a></p><script>location.replace(${JSON.stringify(to)})</script></body></html>`;
}
