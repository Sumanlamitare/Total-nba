import React, { useEffect, useRef } from 'react';
import { GOLD } from './spines.js';
import { seasonLabel } from './shelves.js';

// "How the library works": finding your way, what a spine tells you, and the motion setting.
export default function Legend({ onClose, motion, setMotion, meta, noGL }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const k = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <aside className="panel legend" role="dialog" aria-label="How the library works" tabIndex={-1} ref={ref}>
      <div className="sheet-head">
        <h2>How the library works</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <h3>Finding your way</h3>
      <p>Every team has its own section of shelves, signed in its colours; the end of each row lists what's down each side. A player's book is shelved with the team they played the most games for, by ESPN's records (their award records, or ESPN's last team, when games aren't recorded). Players whose team ESPN doesn't record have the last row to themselves.</p>
      <ul className="keys">
        <li><kbd>drag</kbd> look around</li>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> hurry · <kbd>Q</kbd><kbd>E</kbd> turn</li>
        <li><kbd>click floor</kbd> walk there · <kbd>scroll</kbd> step forward or back</li>
        <li><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> browse books · <kbd>Enter</kbd> open · <kbd>[</kbd><kbd>]</kbd> next section</li>
      </ul>
      <h3>Reading a spine</h3>
      <dl className="key">
        <dt><span className="k-thick" aria-hidden><i style={{ width: 5 }} /><i style={{ width: 10 }} /><i style={{ width: 17 }} /></span>Thickness</dt>
        <dd>How long the career was, as far as ESPN's records show.</dd>
        <dt><span className="k-shade" aria-hidden><i /><i /><i /></span>Colour</dt>
        <dd>The team's colour; the further back the first season, the darker the shade.</dd>
        <dt><span className="k-band" aria-hidden style={{ '--g': GOLD }}><i /><i /><i /></span>Gold bands</dt>
        <dd>One per MVP award.</dd>
        <dt><span className="k-star" aria-hidden style={{ color: GOLD }}>★★</span>Stars</dt>
        <dd>One per Finals MVP award.</dd>
        <dt>Height</dt>
        <dd>Varies only so the shelves look natural.</dd>
      </dl>
      <label className="toggle">
        <input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} />
        <span>Animate walking, opening books and turning pages</span>
      </label>
      {noGL && <p className="note">Your browser can't draw the 3D library, so it's shown as a list.</p>}
      {meta && <p className="note">Catalogue rebuilt from ESPN on {new Date(meta.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Season lists cover {seasonLabel(meta.from)} onward; older players come from ESPN's player records and award lists.</p>}
    </aside>
  );
}
