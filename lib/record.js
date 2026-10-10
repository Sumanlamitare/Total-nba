// Logging every analysis is what makes the model testable: picks, prices and probabilities at view time,
// the closing line (last snapshot before start), then results.
import { db } from './db.js';

export async function logSnapshot(a) {
  if (!process.env.MONGODB_URI || a.status?.state !== 'pre') return;
  const col = (await db()).collection('snapshots');
  const last = await col.findOne({ sport: a.sport, id: a.id }, { sort: { at: -1 }, projection: { at: 1 } });
  if (last && Date.now() - Date.parse(last.at) < 20 * 60e3) return;
  const keep = x => ({ market: x.market, pick: x.pick, side: x.side, line: x.line, price: x.price, pModel: x.pModel, pMarket: x.pMarket, p: x.p, edge: x.edge, ev: x.ev, stake: x.stake });
  await col.insertOne({
    sport: a.sport, id: a.id, at: a.at, start: a.date, matchup: `${a.away.abbr} @ ${a.home.abbr}`,
    lines: a.lines?.lines || null,
    game: (a.lines?.sides || []).map(keep),
    props: a.props.map(p => ({ key: p.key, aid: p.aid, player: p.player, team: p.team, ...keep(p), stats: p.type, mu: p.proj.mu, qualifies: p.qualifies, isPick: p.pick })),
    picks: [...(a.lines?.sides || []).filter(s => s.qualifies).map(s => ({ kind: 'game', label: `${s.market}: ${s.pick}`, ...keep(s) })),
      ...a.props.filter(p => p.pick).map(p => ({ kind: 'prop', label: `${p.player} ${p.side} ${p.line} ${p.market}`, aid: p.aid, ...keep(p) }))]
      .sort((x, y) => y.ev - x.ev),
  });
}
