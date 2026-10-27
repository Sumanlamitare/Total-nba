// The share graphics for a night or a performance (rendered with @vercel/og), in the app's quiet dark look: wide
// (1200×630, link previews and X) and square (1080×1080, Instagram and the like).
import React from 'react';
import { ImageResponse } from '@vercel/og';
import { dayLabel } from './share.js';

const h = React.createElement;
const C = { bg: '#0d0f12', surface: '#14171c', line: '#242932', text: '#e7e9ec', muted: '#8b929c', faint: '#5c636d', accent: '#f28b30', win: '#3fb27f', loss: '#e5636b' };
const CATS = [['result', 'Result'], ['offense', 'Offense'], ['defense', 'Defense'], ['possession', 'Possession'], ['clutch', 'Crunch time']];
const headshot = p => p.headshot || `https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`;
const box = (style, ...kids) => h('div', { style: { display: 'flex', ...style } }, ...kids);
const brand = date => box({ alignItems: 'center', gap: 14, fontSize: 26, color: C.muted },
  box({ width: 18, height: 18, borderRadius: 9, background: C.accent }), 'Performance of the Night', box({ color: C.faint }, `· ${dayLabel(date)}`));

function perfCard(p, date, withPhoto) {
  const l = p.line, w = String(p.result).startsWith('W');
  const stat = (k, v) => box({ flexDirection: 'column', gap: 2 }, box({ fontSize: 22, color: C.faint, letterSpacing: 2 }, k), box({ fontSize: 46, color: C.text, fontWeight: 600 }, String(v)));
  return box({ width: '100%', height: '100%', background: C.bg, padding: 56, flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'sans-serif' },
    brand(date),
    box({ alignItems: 'center', gap: 40 },
      withPhoto ? h('img', { src: headshot(p), width: 230, height: 168, style: { borderRadius: 16, background: C.surface, objectFit: 'cover' } }) : null,
      box({ flexDirection: 'column', gap: 10, flex: 1 },
        box({ fontSize: 28, color: p.rank === 1 ? C.accent : C.muted }, p.rank === 1 ? 'No. 1' : `No. ${p.rank}`),
        box({ fontSize: 68, color: C.text, fontWeight: 700, lineHeight: 1 }, p.name),
        box({ fontSize: 30, color: C.muted, gap: 14 }, `${p.team?.abbr || ''} ${p.home ? 'vs' : '@'} ${p.opp?.abbr || ''}`, box({ color: w ? C.win : C.loss }, p.result))),
      box({ flexDirection: 'column', alignItems: 'flex-end' }, box({ fontSize: 112, color: C.accent, fontWeight: 700, lineHeight: 1 }, p.score.toFixed(1)), box({ fontSize: 24, color: C.faint }, 'POTN score / 100'))),
    box({ justifyContent: 'space-between', alignItems: 'flex-end' },
      box({ gap: 44 }, stat('PTS', l.pts), stat('REB', l.reb), stat('AST', l.ast), stat('FG', `${l.fgm}-${l.fga}`), l.stl + l.blk >= 3 ? stat('STL+BLK', l.stl + l.blk) : null),
      box({ gap: 14, alignItems: 'flex-end' }, ...CATS.map(([k, name]) => box({ flexDirection: 'column', alignItems: 'center', gap: 8 },
        box({ width: 34, height: 110, background: C.line, borderRadius: 4, alignItems: 'flex-end' }, box({ width: 34, height: Math.round(1.1 * (p.categories?.[k]?.score ?? 0)), background: C.accent, borderRadius: 4 })),
        box({ fontSize: 18, color: C.faint }, name[0]))))));
}

function nightCard(night, date) {
  const top = (night.top || []).slice(0, 5);
  return box({ width: '100%', height: '100%', background: C.bg, padding: '44px 56px', flexDirection: 'column', gap: 20, fontFamily: 'sans-serif' },
    brand(date),
    box({ flexDirection: 'column', border: `2px solid ${C.line}`, borderRadius: 16, background: C.surface },
      ...top.map((p, i) => box({ alignItems: 'center', padding: '12px 28px', gap: 26, borderTop: i ? `2px solid ${C.line}` : 'none' },
        box({ width: 36, fontSize: 30, color: i ? C.faint : C.accent }, String(i + 1)),
        box({ flex: 1, flexDirection: 'column' }, box({ fontSize: 34, color: C.text, fontWeight: 600 }, p.name), box({ fontSize: 22, color: C.muted }, `${p.line.pts} pts · ${p.line.reb} reb · ${p.line.ast} ast · ${p.result}`)),
        box({ fontSize: 40, color: i ? C.text : C.accent, fontWeight: 700 }, p.score.toFixed(1))))));
}

function perfSquare(p, date, withPhoto) {
  const l = p.line, w = String(p.result).startsWith('W');
  const stat = (k, v) => box({ flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }, box({ fontSize: 26, color: C.faint, letterSpacing: 2 }, k), box({ fontSize: 64, color: C.text, fontWeight: 600 }, String(v)));
  return box({ width: '100%', height: '100%', background: C.bg, padding: 64, flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'sans-serif' },
    brand(date),
    box({ alignItems: 'center', gap: 36 },
      withPhoto ? h('img', { src: headshot(p), width: 260, height: 190, style: { borderRadius: 18, background: C.surface, objectFit: 'cover' } }) : null,
      box({ flexDirection: 'column', gap: 10, flex: 1 },
        box({ fontSize: 32, color: p.rank === 1 ? C.accent : C.muted }, `No. ${p.rank} of the night`),
        box({ fontSize: 76, color: C.text, fontWeight: 700, lineHeight: 1.05 }, p.name),
        box({ fontSize: 34, color: C.muted, gap: 16 }, `${p.team?.abbr || ''} ${p.home ? 'vs' : '@'} ${p.opp?.abbr || ''}`, box({ color: w ? C.win : C.loss }, p.result)))),
    box({ border: `2px solid ${C.line}`, borderRadius: 20, background: C.surface, padding: '28px 12px' },
      stat('PTS', l.pts), stat('REB', l.reb), stat('AST', l.ast), stat('FG', `${l.fgm}-${l.fga}`), l.stl + l.blk >= 3 ? stat('STL+BLK', l.stl + l.blk) : stat('3PT', `${l.tpm}-${l.tpa}`)),
    box({ justifyContent: 'space-between', alignItems: 'flex-end' },
      box({ flexDirection: 'column' }, box({ fontSize: 170, color: C.accent, fontWeight: 700, lineHeight: 1 }, p.score.toFixed(1)), box({ fontSize: 28, color: C.faint }, 'POTN score / 100')),
      box({ gap: 16, alignItems: 'flex-end' }, ...CATS.map(([k, name]) => box({ flexDirection: 'column', alignItems: 'center', gap: 10 },
        box({ width: 44, height: 150, background: C.line, borderRadius: 5, alignItems: 'flex-end' }, box({ width: 44, height: Math.round(1.5 * (p.categories?.[k]?.score ?? 0)), background: C.accent, borderRadius: 5 })),
        box({ fontSize: 22, color: C.faint }, name[0]))))));
}

function nightSquare(night, date) {
  const top = (night.top || []).slice(0, 5);
  return box({ width: '100%', height: '100%', background: C.bg, padding: 64, flexDirection: 'column', gap: 36, fontFamily: 'sans-serif' },
    brand(date),
    box({ fontSize: 64, color: C.text, fontWeight: 700 }, 'Top 5 of the night'),
    box({ flexDirection: 'column', border: `2px solid ${C.line}`, borderRadius: 20, background: C.surface },
      ...top.map((p, i) => box({ alignItems: 'center', padding: '22px 32px', gap: 28, borderTop: i ? `2px solid ${C.line}` : 'none' },
        box({ width: 40, fontSize: 38, color: i ? C.faint : C.accent }, String(i + 1)),
        box({ flex: 1, flexDirection: 'column' }, box({ fontSize: 42, color: C.text, fontWeight: 600 }, p.name), box({ fontSize: 26, color: C.muted }, `${p.line.pts} pts · ${p.line.reb} reb · ${p.line.ast} ast · ${p.result}`)),
        box({ fontSize: 52, color: i ? C.text : C.accent, fontWeight: 700 }, p.score.toFixed(1))))));
}

// A PNG. Without a performance, the night's top five. If the player's photo can't be fetched, it's left out.
export async function ogImage({ night, perf, date, square = false }) {
  const card = withPhoto => (square ? (perf ? perfSquare(perf, date, withPhoto) : nightSquare(night, date)) : (perf ? perfCard(perf, date, withPhoto) : nightCard(night, date)));
  const render = withPhoto => new ImageResponse(card(withPhoto), square ? { width: 1080, height: 1080 } : { width: 1200, height: 630 });
  try { const r = render(true); return Buffer.from(await r.arrayBuffer()); } catch { return Buffer.from(await render(false).arrayBuffer()); }
}
