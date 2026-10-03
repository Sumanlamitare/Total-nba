import { useState } from 'react';

// Likes/dislikes and notes, saved in this browser (no database)
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export default function useReactions() {
  const [votes, setVotes] = useState(() => read('tn_votes', {}));
  const [notes, setNotes] = useState(() => read('tn_notes', {}));
  return {
    votes,
    mine: k => votes[k] || 0,
    notes: k => notes[k] || [],
    vote(k, v) { const nx = { ...votes, [k]: votes[k] === v ? 0 : v }; setVotes(nx); save('tn_votes', nx); },
    note(k, text) { const nx = { ...notes, [k]: [...(notes[k] || []), { text, ts: Date.now() }] }; setNotes(nx); save('tn_notes', nx); },
  };
}
