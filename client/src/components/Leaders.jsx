import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STATS, SHORT, fmtStat, decimalsFor } from '../util.js';
import { teamColor } from '../teams.js';
import { Avatar, Num, I } from './ui.jsx';

const short = n => { const p = (n || '').split(' '); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; };
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const last = n => { const p = (n || '').split(' ').filter(w => !SUFFIX.test(w)); return p.at(-1) || n; };
const dec = v => (Number.isInteger(v) ? 0 : 1);
const MINI = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];
const mini = (l, f) => MINI.filter(x => x !== f).slice(0, 2).map(x => `${l[x] ?? 0} ${SHORT[x]}`).join(' · ');
export const subline = c => (c.kind === 'game' ? `${c.team} vs ${c.opp}` : `${c.team} · ${c.gp} GP`);

// Stat chips; each one previews who leads that stat in the current view
export function StatChips({ stat, leaders, onStat }) {
  const bar = useRef(null);
  useEffect(() => { bar.current?.querySelector('.chip.a')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [stat]);
  return (
    <div className="chips" ref={bar} role="tablist" aria-label="Stat">
      {Object.keys(STATS).map(k => {
        const l = leaders[k];
        return (
          <button key={k} role="tab" aria-selected={k === stat} className={'chip' + (k === stat ? ' a' : '')} onClick={() => onStat(k)}>
            <b>{SHORT[STATS[k]]}</b>
            <small>{l ? `${last(l.name)} ${fmtStat(l[STATS[k]] ?? 0, STATS[k])}` : '—'}</small>
          </button>
        );
      })}
    </div>
  );
}

// Top three on a podium: the pillars rise, photos pop, numbers count up
export function Podium({ cards, stat, onOpen }) {
  const f = STATS[stat];
  const order = [cards[1], cards[0], cards[2]];
  const top = cards[0]?.v || 1;
  return (
    <section className="podium" aria-label="Top three">
      {order.map((c, j) => {
        if (!c) return <div key={j} className="pod empty" />;
        const rank = j === 1 ? 1 : j === 0 ? 2 : 3;
        return (
          <button key={c.key || c.n} className={'pod p' + rank} style={{ '--tc': teamColor(c.team), '--d': [0.15, 0, 0.3][j] + 's' }} onClick={() => onOpen(c, rank - 1)}>
            {rank === 1 && <span className="crown">{I.crown}</span>}
            <span className="pav"><Avatar id={c.espnId} name={c.n} team={c.team} size="xl" w={350} /><span className="prk">{rank}</span></span>
            <span className="pillar" style={{ '--h': 0.55 + 0.45 * Math.max(0, c.v) / top }}>
              <b className="pv"><Num v={c.v} decimals={decimalsFor(f) ? dec(c.v) : 0} delay={300 + j * 120} /></b>
              <small className="pu">{SHORT[f]}</small>
              <span className="pn">{short(c.n)}</span>
              <span className="pt">{c.kind === 'game' ? `vs ${c.opp}` : c.team}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

const STEP = 50;
// Everyone else, ranked. Rows glide to their new places when the stat changes (FLIP), and the list grows
// as you scroll so a 580-player season never builds 580 rows at once.
export function Board({ cards, offset = 3, stat, onOpen, flipKey, book }) {
  const f = STATS[stat];
  const [n, setN] = useState(STEP);
  const list = useRef(null), more = useRef(null), pos = useRef(new Map()), lastKey = useRef(flipKey);
  const rows = cards.slice(offset, offset + n);
  const max = Math.max(1e-9, cards[0]?.v || 0);

  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setN(x => x + STEP); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length < cards.length - offset]);

  useLayoutEffect(() => {
    const els = list.current ? [...list.current.children] : [];
    const glide = lastKey.current === flipKey, next = new Map();
    const vh = innerHeight, sy = list.current?.getBoundingClientRect().top || 0;
    for (const el of els) {
      const k = el.dataset.k, top = el.offsetTop, old = pos.current.get(k);
      next.set(k, top);
      if (!glide || !el.animate) continue;
      const onScreen = sy + top > -200 && sy + top < vh + 200;
      if (old === undefined) { if (onScreen) el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'ease-out' }); continue; }
      if (old !== top && (onScreen || (sy + old > -200 && sy + old < vh + 200))) {
        el.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'translateY(0)' }], { duration: 620, easing: 'cubic-bezier(.2,.85,.25,1)' });
      }
    }
    pos.current = next; lastKey.current = flipKey;
  });

  if (!rows.length) return null;
  return (
    <>
      <ol className="board" ref={list}>
        {rows.map((c, i) => {
          const rank = offset + i + 1, w = Math.max(0.02, (c.v || 0) / max);
          return (
            <li key={c.key || c.n} data-k={c.key || c.n} style={{ '--i': Math.min(i, 14), '--tc': teamColor(c.team) }}>
              <button className={'row ' + c.rarity} onClick={() => onOpen(c, rank - 1)}>
                <i className="bar" style={{ transform: `scaleX(${w})` }} />
                <span className="rk">{rank}</span>
                <Avatar id={c.espnId} name={c.n} team={c.team} size="s" w={96} />
                <span className="who">
                  <b>{c.n}{book.has(c.k) && <em className="got">★</em>}</b>
                  <small>{c.kind === 'game' ? `vs ${c.opp} · ${mini(c.line, f)}` : subline(c)}</small>
                </span>
                <span className="val"><b>{fmtStat(c.v, f)}</b><small>{SHORT[f]}</small></span>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length < cards.length - offset && <div className="more" ref={more}><span className="ball" />LOADING MORE PLAYERS</div>}
    </>
  );
}

// The night's games; tap one to rank only its players. The gold chip is "on this day" in another season.
export function Games({ games, game, onGame, otd, onOtd, f }) {
  if (!games.length && !otd) return null;
  return (
    <nav className="games" aria-label="Games">
      {games.map((g, i) => {
        const homeWin = g.hs > g.as, on = game === g._id;
        return (
          <button key={g._id} className={'game' + (on ? ' a' : '')} style={{ '--i': i, '--ha': teamColor(g.away), '--hh': teamColor(g.home) }}
            onClick={() => onGame(on ? null : g._id)} aria-pressed={on} aria-label={`${g.away} ${g.as}, ${g.home} ${g.hs}`}>
            <span className={homeWin ? '' : 'w'}><i style={{ background: 'var(--ha)' }} /><em>{g.away}</em><b>{g.as}</b></span>
            <span className={homeWin ? 'w' : ''}><i style={{ background: 'var(--hh)' }} /><em>{g.home}</em><b>{g.hs}</b></span>
            {g.type && g.type !== 'Regular Season' && <small className="po">{g.type === 'PlayIn' ? 'PLAY-IN' : 'PLAYOFFS'}</small>}
          </button>
        );
      })}
      {otd && (
        <button className="game otd" onClick={onOtd} aria-label={`On this day in ${otd.date.slice(0, 4)}: ${otd.name}`}>
          <small>ON THIS DAY · {otd.date.slice(0, 4)}</small>
          <b>{otd.name}</b>
          <span>{fmtStat(otd[f] ?? 0, f)} {SHORT[f]} →</span>
        </button>
      )}
    </nav>
  );
}

// Storylines for a game day, worked out from the box scores
export function stories(lines, games) {
  if (!lines?.length) return [];
  const out = [];
  const by = f => lines.reduce((a, l) => ((l[f] || 0) > (a?.[f] || 0) ? l : a), null);
  const tens = l => ['pts', 'reb', 'ast', 'stl', 'blk'].filter(x => (l[x] || 0) >= 10).length;
  const td = lines.filter(l => tens(l) >= 3);
  const forty = lines.filter(l => l.pts >= 40);
  const p = by('pts'), fan = by('fan'), reb = by('reb'), ast = by('ast');
  if (p) out.push({ tag: 'TOP SCORER', title: `${p.name} drops ${p.pts}`, sub: `${p.reb} REB · ${p.ast} AST vs ${p.opp}`, line: p, stat: 'POINTS' });
  if (td.length) out.push({ tag: td.length > 1 ? `${td.length} TRIPLE-DOUBLES` : 'TRIPLE-DOUBLE', title: td.map(l => l.name).slice(0, 2).join(' & '), sub: td.slice(0, 2).map(l => `${l.pts}/${l.reb}/${l.ast}`).join(' · '), line: td[0], stat: 'FANTASY' });
  else if (forty.length > 1) out.push({ tag: `${forty.length} FORTY-PIECES`, title: forty.map(l => l.name.split(' ').at(-1)).join(', '), sub: 'Players with 40+ points', line: forty[0], stat: 'POINTS' });
  if (fan && fan !== p) out.push({ tag: 'FANTASY MVP', title: `${fan.name} · ${fan.fan} FPTS`, sub: `${fan.pts} PTS · ${fan.reb} REB · ${fan.ast} AST`, line: fan, stat: 'FANTASY' });
  if (reb && reb.reb >= 15) out.push({ tag: 'ON THE GLASS', title: `${reb.name} grabs ${reb.reb}`, sub: `vs ${reb.opp}`, line: reb, stat: 'REBOUNDS' });
  if (ast && ast.ast >= 12) out.push({ tag: 'DIMES', title: `${ast.name} dishes ${ast.ast}`, sub: `vs ${ast.opp}`, line: ast, stat: 'ASSISTS' });
  const blow = games?.reduce((a, g) => (Math.abs(g.hs - g.as) > Math.abs((a?.hs || 0) - (a?.as || 0)) ? g : a), null);
  if (blow && Math.abs(blow.hs - blow.as) >= 20) {
    const [w, l] = blow.hs > blow.as ? [blow.home, blow.away] : [blow.away, blow.home];
    out.push({ tag: 'BLOWOUT', title: `${w} by ${Math.abs(blow.hs - blow.as)}`, sub: `${w} ${Math.max(blow.hs, blow.as)}, ${l} ${Math.min(blow.hs, blow.as)}`, game: blow._id });
  }
  return out.slice(0, 5);
}

export function Stories({ items, onStory }) {
  if (!items.length) return null;
  return (
    <section className="stories" aria-label="Storylines">
      {items.map((s, i) => (
        <button key={s.tag} className="story" style={{ '--i': i, '--tc': s.line ? teamColor(s.line.team) : 'var(--acc)' }} onClick={() => onStory(s)}>
          <small><span className="flame">{I.fire}</span>{s.tag}</small>
          <b>{s.title}</b>
          <span>{s.sub}</span>
        </button>
      ))}
    </section>
  );
}
