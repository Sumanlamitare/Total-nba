import { useEffect, useState } from 'react';
import { top10 } from '../api.js';
import { drawGraphic, toBlob } from '../graphic.js';
import { LONG } from '../util.js';

const fileSafe = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Builds the Top 10 graphic for the view that was on screen when "Create Graphic" was tapped,
// previews it, and saves exactly that PNG.
export default function GraphicModal({ ctx, meta, onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let url, alive = true;
    (async () => {
      try {
        const data = await top10(ctx, meta);
        const canvas = await drawGraphic({ statLabel: ctx.stat, statLong: LONG[ctx.stat] || ctx.stat, ...data });
        const blob = await toBlob(canvas);
        url = URL.createObjectURL(blob);
        if (alive) setState({ status: 'ready', url, blob, data, name: `totalnba-top10-${fileSafe(ctx.stat)}-${fileSafe(data.title)}.png` });
      } catch (e) {
        if (alive) setState({ status: 'error', message: e.message });
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []);

  const save = () => {
    const a = document.createElement('a');
    a.href = state.url; a.download = state.name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const context = state.data ? state.data.title : '';

  return (
    <div className="sheet gsheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Top 10 graphic">
      <div className="ghd">
        <div>
          <h3>TOP 10 GRAPHIC</h3>
          <p>{LONG[ctx.stat] || ctx.stat}{context ? ` · ${context}` : ''}</p>
        </div>
        <button className="ib" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="gview">
        {state.status === 'ready' && <img src={state.url} alt={`Top 10 ${ctx.stat} graphic`} />}
        {state.status === 'loading' && <div className="gl"><div className="ball" />CREATING GRAPHIC</div>}
        {state.status === 'error' && <div className="gl">COULD NOT CREATE THE GRAPHIC<br />{state.message}</div>}
      </div>
      <div className="gactions">
        <button className="btn" onClick={save} disabled={state.status !== 'ready'} aria-disabled={state.status !== 'ready'}>SAVE TO DEVICE</button>
        <button className="btn ghost" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
