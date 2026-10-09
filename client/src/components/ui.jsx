import { useEffect, useRef, useState } from 'react';
import { face, photo, initials, fmt } from '../util.js';
import { teamColor } from '../teams.js';

// Headshot: small resized image first, then the full one, then initials
export function Avatar({ id, name, team, size = 'm', w = 160 }) {
  const [step, setStep] = useState(0);
  const src = step === 0 ? face(id, w) : step === 1 ? photo(id) : '';
  return (
    <span className={'av av-' + size} style={{ '--tc': teamColor(team) }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setStep(step + 1)} /> : <i>{initials(name)}</i>}
    </span>
  );
}

// A number that counts to its value, and glides from the old value when it changes
export function Num({ v, decimals = 0, ms = 900, delay = 0 }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    let raf, t0;
    const a = from.current, b = v;
    const tick = t => {
      if (t0 === undefined) t0 = t + delay;
      const p = Math.min(1, Math.max(0, (t - t0) / ms)), e = 1 - Math.pow(1 - p, 3);
      const x = a + (b - a) * e;
      from.current = x; setN(x);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{fmt(n, decimals)}</>;
}

// Bottom sheet on phones, side drawer on desktop. Springs in, slides out, swipe the handle down to close.
export function Sheet({ open, onClose, children, className = '', label }) {
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef(null), drag = useRef(null);
  useEffect(() => {
    if (open) { setShown(true); setClosing(false); return; }
    if (!shown) return;
    setClosing(true);
    const t = setTimeout(() => { setShown(false); setClosing(false); }, 320);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!shown) return;
    document.body.classList.add('locked');
    return () => document.body.classList.remove('locked');
  }, [shown]);
  if (!shown) return null;
  const start = e => { drag.current = { y: e.touches[0].clientY, dy: 0 }; panel.current.style.transition = 'none'; };
  const move = e => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy; panel.current.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (!drag.current) return;
    const far = drag.current.dy > 110;
    drag.current = null; panel.current.style.transition = ''; panel.current.style.transform = '';
    if (far) onClose();
  };
  return (
    <div className={'scrim' + (closing ? ' out' : '')} onClick={onClose}>
      <div ref={panel} className={'sheet ' + className + (closing ? ' out' : '')} role="dialog" aria-label={label} onClick={e => e.stopPropagation()}>
        <div className="grab" onTouchStart={start} onTouchMove={move} onTouchEnd={end}><span /></div>
        {children}
      </div>
    </div>
  );
}

const P = props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props} />;
export const I = {
  day: <P><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /><circle cx="12" cy="15" r="1.6" fill="currentColor" /></P>,
  week: <P><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M7 14h10M7 17.5h6" /></P>,
  season: <P><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" /></P>,
  book: <P><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></P>,
  search: <P strokeWidth={2.2}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></P>,
  image: <P><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 15l3-3 3 3 4-5" /></P>,
  left: <P strokeWidth={2.4}><path d="M15 5l-7 7 7 7" /></P>,
  right: <P strokeWidth={2.4}><path d="M9 5l7 7-7 7" /></P>,
  close: <P strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></P>,
  crown: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" /></svg>,
  fire: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2.5 2.5 3c0-4 1-6.5 1-9z" /></svg>,
  arrow: <P strokeWidth={2.4}><path d="M7 17L17 7M9 7h8v8" /></P>,
};
