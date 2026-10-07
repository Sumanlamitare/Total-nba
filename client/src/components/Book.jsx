import { useState } from 'react';
import { initials, fmtStat, RARITY } from '../util.js';

function Mini({ c, onOpen, onRemove, i }) {
  const [ok, setOk] = useState(true);
  return (
    <div className={'mini ' + c.rarity} style={{ '--i': Math.min(i, 16) }}>
      <button className="mini-body" onClick={() => onOpen(c)} aria-label={`Open ${c.n}, ${c.period}`}>
        <span className="mini-img">{c.img && ok ? <img src={c.img} alt="" loading="lazy" onError={() => setOk(false)} /> : initials(c.n)}</span>
        <span className="mini-r">{c.rarity}</span>
        <b>{fmtStat(c.v, c.f)}</b>
        <small>{c.kind === 'total' ? 'TOTAL ' : ''}{c.stat}</small>
        <em>{c.n}</em>
        <span className="mini-p">{c.period}</span>
      </button>
      <button className="mini-x" aria-label={`Remove ${c.n} from your Book`} onClick={() => onRemove(c.k)}>✕</button>
    </div>
  );
}

// Your collected cards, rarest first
export default function Book({ book, onOpen }) {
  const cards = [...book.cards].sort((a, b) => RARITY.indexOf(b.rarity) - RARITY.indexOf(a.rarity) || b.at - a.at);
  const counts = RARITY.map(r => [r, cards.filter(c => c.rarity === r).length]).reverse();
  return (
    <div className="book">
      <div className="book-hd r">
        <h2>YOUR BOOK</h2>
        <p>{cards.length ? `${cards.length} card${cards.length > 1 ? 's' : ''} collected` : 'Tap ★ COLLECT on any card to start your collection.'}</p>
        {cards.length > 0 && <div className="book-counts">{counts.map(([r, n]) => <span key={r} className={'gem ' + r}>{n} {r}</span>)}</div>}
      </div>
      <div className="book-grid">
        {cards.map((c, i) => <Mini key={c.k} c={c} i={i} onOpen={onOpen} onRemove={book.remove} />)}
      </div>
    </div>
  );
}
