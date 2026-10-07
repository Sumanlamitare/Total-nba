import { useState } from 'react';

// Your Book: cards you collected (a snapshot of each, so it can be shown later) and notes,
// saved in this browser.
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export default function useBook() {
  const [cards, setCards] = useState(() => read('tn_book', []));
  const [notes, setNotes] = useState(() => read('tn_notes', {}));
  return {
    cards,
    has: k => cards.some(c => c.k === k),
    toggle(card) {
      const nx = cards.some(c => c.k === card.k) ? cards.filter(c => c.k !== card.k) : [{ ...card, at: Date.now() }, ...cards];
      setCards(nx); save('tn_book', nx);
      return nx.length > cards.length;
    },
    remove(k) { const nx = cards.filter(c => c.k !== k); setCards(nx); save('tn_book', nx); },
    notes: k => notes[k] || [],
    note(k, text) { const nx = { ...notes, [k]: [...(notes[k] || []), { text, ts: Date.now() }] }; setNotes(nx); save('tn_notes', nx); },
  };
}
