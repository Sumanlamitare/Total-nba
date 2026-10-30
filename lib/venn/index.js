// Engine result -> drawn diagram, in the chosen view.
import { layoutVenn, MAX_VENN } from './layout.js';
import { renderVenn, renderUpset, chooseView, DEFAULT_STYLE } from './render.js';

// Short label under a headshot: last name (first initial when two players in the diagram share it).
export function labels(players) {
  const last = p => String(p.name || '').replace(/ (Jr\.|Sr\.|II|III|IV)$/, '').split(' ').slice(1).join(' ') || p.name;
  const count = new Map();
  for (const p of players) count.set(last(p), (count.get(last(p)) || 0) + 1);
  return new Map(players.map(p => [String(p.id), count.get(last(p)) > 1 ? `${p.name[0]}. ${last(p)}` : last(p)]));
}

// result: from evaluate(); criteria: [{ label }]. -> { view, width, height, body, layout }
export function buildDiagram(result, criteria, style = DEFAULT_STYLE, { img, size = 1000, width = 1000 } = {}) {
  const n = criteria.length;
  const lab = labels(result.players);
  const byId = new Map(result.players.map(p => [String(p.id), { ...p, label: lab.get(String(p.id)) }]));
  const view = n === 0 ? 'empty' : chooseView(style, n, result.total);
  if (view === 'empty') return { view, width: size, height: size * 0.5, body: '', layout: null };
  if (view === 'venn' && n <= MAX_VENN) {
    const regions = result.regions.map(r => ({ mask: r.mask, players: r.players.map(p => ({ id: String(p.id), label: lab.get(String(p.id)) })) }));
    const L = layoutVenn(n, regions, { size, r: Math.round(34 * (style.headshot || 1)), minR: Math.max(8, Math.round(11 * (style.headshot || 1))), names: style.names, counts: style.counts, adjust: style.adjust || [] });
    const d = renderVenn(L, criteria, byId, style, { img });
    return { view, ...d, layout: L };
  }
  const regs = result.regions.map(r => ({ ...r, players: r.players.map(p => byId.get(String(p.id))) }));
  const d = renderUpset({ ...result, regions: regs }, criteria, style, { width, img });
  return { view: 'upset', ...d, layout: null };
}
