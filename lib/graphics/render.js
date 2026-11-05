// Scene → SVG. One renderer for the editor canvas, browser exports (PNG/JPEG via canvas) and server rendering (resvg),
// so what the editor shows is exactly what gets published.
//
// Scene: { w, h, bg, elements: [el] }. Common element fields: id, type, x, y, w, h, rot, opacity, hidden, shadow
// { x, y, blur, color, opacity }, glow { blur, color, opacity }.
//   rect   fill | gradient { angle, stops: [[offset, color, opacity?]] }, radius, stroke, strokeWidth, pattern (stripes |
//          halftone | grid | grain | diagonal), patternColor, patternOpacity, skew
//   text   text, font (display | sans), weight, size, minSize, color, align, valign, upper, italic, spacing, lineHeight,
//          wrap, fit, maxLines, stroke, strokeWidth
//   image  src, fit (cover | contain), anchor (center | top | bottom), radius, circle, fade (bottom | left | right |
//          none), filter (none | grayscale | duotone), duotone [dark, light], stroke, strokeWidth, bgFill
//   line   color, width, dash
//   circle fill, stroke, strokeWidth (x, y, w, h box)
import { layoutText, FAMILIES } from './text.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = v => Math.round((+v || 0) * 100) / 100;

export function renderScene(scene, { images = {}, editor = false, fontCss = '' } = {}) {
  const defs = [];
  let uid = 0;
  const id = p => `${p}${++uid}`;
  const body = [];
  const W = scene.w, H = scene.h;
  body.push(`<rect width="${W}" height="${H}" fill="${esc(scene.bg || '#0a0a0b')}"/>`);
  for (const el of scene.elements || []) {
    if (el.hidden) continue;
    const out = draw(el);
    if (!out) continue;
    const t = [];
    if (el.rot) t.push(`rotate(${n(el.rot)} ${n(el.x + el.w / 2)} ${n(el.y + el.h / 2)})`);
    let filter = '';
    if (el.shadow || el.glow) {
      const f = id('f');
      const s = el.shadow, g = el.glow;
      defs.push(`<filter id="${f}" x="-30%" y="-30%" width="160%" height="160%">${s ? `<feDropShadow dx="${n(s.x)}" dy="${n(s.y)}" stdDeviation="${n(s.blur / 2)}" flood-color="${esc(s.color || '#000')}" flood-opacity="${s.opacity ?? 0.5}"/>` : ''}${g ? `<feDropShadow dx="0" dy="0" stdDeviation="${n(g.blur / 2)}" flood-color="${esc(g.color)}" flood-opacity="${g.opacity ?? 0.8}"/>` : ''}</filter>`);
      filter = ` filter="url(#${f})"`;
    }
    // In the editor, decorative layers (background, texture, scrim, grain) let clicks through to what's beneath.
    const through = editor && (el.locked || /^(bg-|fx-)/.test(el.id) || el.id === 'scrim');
    body.push(`<g${editor ? ` data-id="${esc(el.id)}"${through ? ' pointer-events="none"' : ''}` : ''}${t.length ? ` transform="${t.join(' ')}"` : ''}${el.opacity != null && el.opacity < 1 ? ` opacity="${n(el.opacity)}"` : ''}${filter}>${out}</g>`);
  }

  function gradient(g, el) {
    const gid = id('g');
    const a = ((g.angle ?? 90) - 90) * Math.PI / 180;
    const x1 = 0.5 - Math.cos(a) / 2, y1 = 0.5 - Math.sin(a) / 2, x2 = 0.5 + Math.cos(a) / 2, y2 = 0.5 + Math.sin(a) / 2;
    if (g.type === 'radial') defs.push(`<radialGradient id="${gid}" cx="${g.cx ?? 0.5}" cy="${g.cy ?? 0.5}" r="${g.r ?? 0.7}">${g.stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${esc(c)}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('')}</radialGradient>`);
    else defs.push(`<linearGradient id="${gid}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${g.stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${esc(c)}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('')}</linearGradient>`);
    return `url(#${gid})`;
  }

  function pattern(kind, color = '#ffffff', size = 12) {
    const pid = id('p');
    const s = size;
    const shapes = {
      stripes: `<rect width="${s / 2}" height="${s}" fill="${esc(color)}"/>`,
      diagonal: `<path d="M-1,1 l2,-2 M0,${s} l${s},-${s} M${s - 1},${s + 1} l2,-2" stroke="${esc(color)}" stroke-width="${n(s / 5)}"/>`,
      halftone: `<circle cx="${s / 2}" cy="${s / 2}" r="${n(s / 4)}" fill="${esc(color)}"/>`,
      grid: `<path d="M ${s} 0 L 0 0 0 ${s}" fill="none" stroke="${esc(color)}" stroke-width="1"/>`,
    };
    if (kind === 'grain') {
      const fid = id('n');
      defs.push(`<filter id="${fid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -0.35"/></filter>`);
      return { filter: fid };
    }
    defs.push(`<pattern id="${pid}" width="${s}" height="${s}" patternUnits="userSpaceOnUse"${kind === 'stripes' ? ' patternTransform="rotate(35)"' : ''}>${shapes[kind] || shapes.halftone}</pattern>`);
    return { fill: `url(#${pid})` };
  }

  function draw(el) {
    const { x, y, w, h } = el;
    if (el.type === 'rect') {
      const r = el.radius ? ` rx="${n(el.radius)}"` : '';
      const fill = el.gradient ? gradient(el.gradient, el) : esc(el.fill || 'none');
      const skew = el.skew ? ` transform="skewX(${n(el.skew)})" ` : '';
      let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r} fill="${fill}"${el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth || 2)}"` : ''}${skew}/>`;
      if (el.pattern && el.pattern !== 'none') {
        const p = pattern(el.pattern, el.patternColor || '#ffffff', el.patternSize || 12);
        if (p.filter) s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r} filter="url(#${p.filter})" opacity="${el.patternOpacity ?? 0.08}"/>`;
        else s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r} fill="${p.fill}" opacity="${el.patternOpacity ?? 0.08}"/>`;
      }
      return s;
    }
    if (el.type === 'circle') return `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${el.gradient ? gradient(el.gradient) : esc(el.fill || 'none')}"${el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth || 2)}"` : ''}/>`;
    if (el.type === 'line') return `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + w)}" y2="${n(y + h)}" stroke="${esc(el.color || '#fff')}" stroke-width="${n(el.width || 2)}"${el.dash ? ` stroke-dasharray="${esc(el.dash)}"` : ''} stroke-linecap="round"/>`;
    if (el.type === 'text') {
      if (el.text == null || el.text === '') return editor ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none"/>` : '';
      const L = layoutText(el);
      const fam = FAMILIES[el.font || 'display'] || FAMILIES.display;
      const lineH = L.size * L.lh;
      const blockH = lineH * L.lines.length;
      const va = el.valign || 'top';
      const top = va === 'middle' ? y + (h - blockH) / 2 : va === 'bottom' ? y + h - blockH : y;
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
      const tx = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x;
      // Baseline: cap-height centred in the line box.
      const base = i => top + i * lineH + lineH / 2 + L.size * 0.35;
      const attrs = `font-family="${esc(fam)}" font-size="${n(L.size)}" font-weight="${L.font === 'display' ? Math.min(900, Math.max(600, el.weight || 800)) : el.weight || 700}"${L.italic ? ' font-style="italic"' : ''} fill="${esc(el.color || '#fff')}" text-anchor="${anchor}"${el.spacing ? ` letter-spacing="${n(el.spacing)}"` : ''}${el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth || 2)}" paint-order="stroke"` : ''}`;
      return `${editor ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="transparent"/>` : ''}<text ${attrs} xml:space="preserve">${L.lines.map((l, i) => `<tspan x="${n(tx)}" y="${n(base(i))}">${esc(l)}</tspan>`).join('')}</text>`;
    }
    if (el.type === 'image') {
      const src = images[el.src] || el.src;
      if (!src) return el.bgFill ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(el.bgFill)}"/>` : '';
      const clip = id('c');
      const shape = el.circle ? `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/>` : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${el.radius ? ` rx="${n(el.radius)}"` : ''}/>`;
      defs.push(`<clipPath id="${clip}">${shape}</clipPath>`);
      const ay = el.anchor === 'top' ? 'YMin' : el.anchor === 'bottom' ? 'YMax' : 'YMid';
      const ax = el.anchorX === 'left' ? 'xMin' : el.anchorX === 'right' ? 'xMax' : 'xMid';
      const par = `${ax}${ay} ${el.fit === 'contain' ? 'meet' : 'slice'}`;
      let mask = '';
      if (el.fade && el.fade !== 'none') {
        const m = id('m'), g = id('g');
        const dir = { bottom: ['0', '0', '0', '1'], left: ['1', '0', '0', '0'], right: ['0', '0', '1', '0'], top: ['0', '1', '0', '0'] }[el.fade] || ['0', '0', '0', '1'];
        const start = el.fadeStart ?? 0.6;
        defs.push(`<linearGradient id="${g}" x1="${dir[0]}" y1="${dir[1]}" x2="${dir[2]}" y2="${dir[3]}"><stop offset="0" stop-color="#fff"/><stop offset="${start}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${m}" maskContentUnits="userSpaceOnUse"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${g})"/></mask>`);
        mask = ` mask="url(#${m})"`;
      }
      let filt = '';
      if (el.filter === 'grayscale') { const f = id('f'); defs.push(`<filter id="${f}"><feColorMatrix type="saturate" values="0"/></filter>`); filt = ` filter="url(#${f})"`; }
      if (el.filter === 'duotone') {
        const f = id('f'); const [a, b] = (el.duotone || ['#111111', '#ff5a1f']).map(hexRgb);
        defs.push(`<filter id="${f}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${a[0]} ${b[0]}"/><feFuncG type="table" tableValues="${a[1]} ${b[1]}"/><feFuncB type="table" tableValues="${a[2]} ${b[2]}"/></feComponentTransfer></filter>`);
        filt = ` filter="url(#${f})"`;
      }
      const bg = el.bgFill ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${el.radius ? ` rx="${n(el.radius)}"` : ''} fill="${esc(el.bgFill)}"${el.circle ? ' clip-path="url(#' + clip + ')"' : ''}/>` : '';
      const border = el.stroke ? (el.circle ? `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth || 3)}"/>` : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${el.radius ? ` rx="${n(el.radius)}"` : ''} fill="none" stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth || 3)}"/>`) : '';
      return `${bg}<g clip-path="url(#${clip})"${mask}><image href="${esc(src)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="${par}"${filt}/></g>${border}`;
    }
    return '';
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fontCss ? `<style>${fontCss}</style>` : ''}<defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}

function hexRgb(h) {
  const m = String(h).replace('#', '');
  const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m.padEnd(6, '0');
  return [0, 2, 4].map(i => Math.round((parseInt(v.slice(i, i + 2), 16) / 255) * 1000) / 1000);
}

// Every image a scene uses (to embed before export).
export const sceneImages = scene => [...new Set((scene.elements || []).filter(e => e.type === 'image' && e.src && !e.hidden && !String(e.src).startsWith('data:')).map(e => e.src))];
