import { useState } from 'react';
import { Thumb, Bubble } from './Icons.jsx';

export default function Reactions({ k, rx }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const mine = rx.mine(k), notes = rx.notes(k);
  const post = () => { const x = text.trim(); if (!x) return; rx.note(k, x); setText(''); };
  return (
    <>
      <div className="rx r" style={{ '--d': '1s' }}>
        <button className={'rb2' + (mine === 1 ? ' on' : '')} aria-label="Like" onClick={() => rx.vote(k, 1)}><Thumb /></button>
        <button className={'rb2 dn' + (mine === -1 ? ' on' : '')} aria-label="Dislike" onClick={() => rx.vote(k, -1)}><Thumb /></button>
        <button className={'rb2' + (open ? ' on' : '')} aria-label="Notes" onClick={() => setOpen(!open)}><Bubble /><span>{notes.length}</span></button>
      </div>
      <div className={'cm' + (open ? ' open' : '')}>
        <div className="cm-hd"><span>NOTES</span><button className="ib" aria-label="Close notes" onClick={() => setOpen(false)}>✕</button></div>
        <div className="cl">
          {notes.length
            ? notes.map((c, i) => <p key={c._id || i}><b>{new Date(c.ts).toLocaleDateString()}</b>{c.text}</p>)
            : <p className="em">No notes yet.</p>}
        </div>
        <div className="ci">
          <input value={text} maxLength={280} placeholder="Add a note" onChange={e => setText(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') post(); }} />
          <button onClick={post}>SAVE</button>
        </div>
      </div>
    </>
  );
}
