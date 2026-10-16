import React, { useEffect, useRef } from 'react';
import { teamCloth, inkOn } from './shelves.js';

// The Teams button's panel: every section of the library as a colour tile; choose one to walk there.
export default function TeamPicker({ teams, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button.tile')?.focus();
    const k = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="teams-title" ref={ref}>
        <div className="sheet-head">
          <h2 id="teams-title">Teams</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="tiles">
          {teams.map(t => {
            const bg = teamCloth(t);
            return (
              <button key={t.id || 'none'} className="tile" style={{ '--bg': bg, '--fg': inkOn(bg) }} onClick={() => onPick(t)}>
                <span className="tile-abbr">{t.abbr}</span>
                <span className="tile-name">{t.name}</span>
                <span className="tile-count">{t.count.toLocaleString('en-US')} players</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
