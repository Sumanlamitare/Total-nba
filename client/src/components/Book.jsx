import { fmtStat, RARITY } from '../util.js';
import { teamColor } from '../teams.js';
import { Avatar, Num, I } from './ui.jsx';

const idOf = c => c.espnId || (c.img || '').match(/full\/(\d+)\.png/)?.[1];

// Your collected cards, rarest first, dealt onto the table
export default function Book({ book, onOpen }) {
  const cards = [...book.cards].sort((a, b) => RARITY.indexOf(b.rarity) - RARITY.indexOf(a.rarity) || b.at - a.at);
  const counts = RARITY.map(r => [r, cards.filter(c => c.rarity === r).length]).reverse();
  return (
    <div className="bookv">
      <header className="book-hd">
        <small>YOUR COLLECTION</small>
        <h1><Num v={cards.length} /> <span>CARD{cards.length === 1 ? '' : 'S'}</span></h1>
        <div className="book-counts">{counts.map(([r, n]) => <span key={r} className={'tag ' + r}>{n} {r}</span>)}</div>
      </header>
      {!cards.length && (
        <div className="book-empty">
          <span className="big-star">{I.book}</span>
          <b>Your book is empty</b>
          <p>Open any player and tap COLLECT. Legendary nights are the rare ones.</p>
        </div>
      )}
      <div className="book-grid">
        {cards.map((c, i) => (
          <div key={c.k} className={'mini ' + c.rarity} style={{ '--i': Math.min(i, 18), '--tc': teamColor(c.team) }}>
            <button className="mini-body" onClick={() => onOpen(c)} aria-label={`Open ${c.n}, ${c.period}`}>
              <Avatar id={idOf(c)} name={c.n} team={c.team} size="m" w={200} />
              <span className={'tag ' + c.rarity}>{c.rarity}</span>
              <b>{fmtStat(c.v, c.f)}</b>
              <small>{c.kind === 'total' ? 'TOTAL ' : ''}{c.stat}</small>
              <em>{c.n}</em>
              <span className="mini-p">{c.period}</span>
            </button>
            <button className="mini-x" aria-label={`Remove ${c.n} from your Book`} onClick={() => book.remove(c.k)}>{I.close}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
