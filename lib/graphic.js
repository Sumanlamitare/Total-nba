// A stored diagram as a finished PNG on the server (link previews, /api/og): the same renderer as the app, headshots
// embedded, rasterized by resvg with Inter (lib/fonts, SIL Open Font License).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildDiagram } from './venn/index.js';
import { composeGraphic, DEFAULT_STYLE } from './venn/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = [path.join(here, 'fonts'), path.join(process.cwd(), 'lib/fonts')].find(d => fs.existsSync(d));
const fonts = fontDir ? fs.readdirSync(fontDir).filter(f => f.endsWith('.ttf')).map(f => path.join(fontDir, f)) : [];

export function resultOf(doc) {
  const n = doc.config.criteria.length, ps = doc.result.players;
  return { players: ps, regions: Array.from({ length: (1 << n) - 1 }, (_, i) => ({ mask: i + 1, players: ps.filter(p => p.mask === i + 1) })), setSizes: doc.result.setSizes, total: doc.result.total };
}

const small = href => (/a\.espncdn\.com\/i\/headshots/.test(href || '') ? `https://a.espncdn.com/combiner/i?img=${new URL(href).pathname}&w=160&h=117` : href);
async function embed(players) {
  const out = new Map();
  await Promise.all(players.map(async p => {
    if (!p.headshot) return;
    try {
      const r = await fetch(small(p.headshot), { signal: AbortSignal.timeout(4000) });
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) out.set(String(p.id), `data:${r.headers.get('content-type')};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`);
    } catch { /* initials instead */ }
  }));
  return p => out.get(String(p.id)) || null;
}

export const SIZES = { wide: [1200, 630], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] };

export async function diagramPng(doc, format = 'wide') {
  const [width, height] = SIZES[format] || SIZES.wide;
  const style = { ...DEFAULT_STYLE, ...doc.style, font: 'sans' };
  const result = resultOf(doc);
  const criteria = doc.config.criteria;
  const img = await embed(result.players);
  const d = buildDiagram(result, criteria, style, { img, width: width > height * 1.2 ? 1400 : 1000 });
  const svg = composeGraphic(d, { width, height, title: doc.title, subtitle: `${doc.period} · ${result.total} players`, criteria, style, attribution: 'Data: ESPN · Overlap', showLegend: d.view === 'upset' });
  const r = new Resvg(svg.replace(/font-family="[^"]*"/g, 'font-family="Inter"'), { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: width } });
  return r.render().asPng();
}
