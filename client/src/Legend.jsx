import React, { useEffect, useRef } from 'react';
import { ERAS, UNKNOWN_ERA, seasonLabel } from './shelves.js';
import { GOLD } from './spines.js';

// "Reading the spines": what each visual property of a book means, plus the motion setting.
export default function Legend({ onClose, motion, setMotion, meta, noGL }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const k = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <aside className="legend" role="dialog" aria-label="Reading the spines" tabIndex={-1} ref={ref}>
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>Reading the spines</h2>
      <p>Books are shelved by surname, A to Z, left to right and top to bottom.</p>
      <dl className="key">
        <dt><span className="k-thick" aria-hidden><i style={{ width: 6 }} /><i style={{ width: 12 }} /><i style={{ width: 20 }} /></span>Thickness</dt>
        <dd>Seasons on ESPN's record: a long career is a thick book.</dd>
        <dt><span className="k-band" aria-hidden style={{ '--g': GOLD }}><i /><i /><i /></span>Gold bands</dt>
        <dd>One band per MVP award.</dd>
        <dt><span className="k-star" aria-hidden style={{ color: GOLD }}>★★</span>Gilt stars</dt>
        <dd>One star per Finals MVP award.</dd>
        <dt>Leather</dt>
        <dd>
          The decade of the first season:
          <span className="eras">
            {[...ERAS, UNKNOWN_ERA].map(e => <span key={e.name}><i style={{ background: e.leather }} aria-hidden />{e.name}</span>)}
          </span>
        </dd>
        <dt>Height</dt>
        <dd>Varies only so the shelves look hand-stocked. It means nothing.</dd>
      </dl>
      <label className="toggle">
        <input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} />
        <span>Animate camera moves and page turns</span>
      </label>
      {noGL && <p className="note">Your browser can't draw the 3D reading room, so the library is shown as a shelf list.</p>}
      {meta && <p className="note">Catalogue rebuilt from ESPN on {new Date(meta.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}; season lists cover {seasonLabel(meta.from)} onward, older players come from ESPN's player records and award lists.</p>}
    </aside>
  );
}
