import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';

// Your likes/dislikes/notes, stored in MongoDB. Calls onAuth when the server wants the app password.
export default function useReactions(onAuth) {
  const [all, setAll] = useState({});
  const ref = useRef(all);
  ref.current = all;
  useEffect(() => { api.getReactions().then(setAll).catch(() => {}); }, []);

  const save = async (k, optimistic, req) => {
    const prev = ref.current[k];
    setAll(a => ({ ...a, [k]: optimistic }));
    try {
      const doc = await req();
      setAll(a => ({ ...a, [k]: { vote: doc.vote, notes: doc.notes } }));
    } catch (e) {
      setAll(a => ({ ...a, [k]: prev }));
      if (e.status === 401) onAuth(() => save(k, optimistic, req));
    }
  };
  const cur = k => ref.current[k] || { vote: 0, notes: [] };

  return {
    all,
    mine: k => cur(k).vote,
    notes: k => cur(k).notes,
    vote(k, v) { const next = cur(k).vote === v ? 0 : v; save(k, { ...cur(k), vote: next }, () => api.vote(k, next)); },
    note(k, text) { save(k, { ...cur(k), notes: [...cur(k).notes, { text, ts: Date.now() }] }, () => api.addNote(k, text)); },
  };
}
