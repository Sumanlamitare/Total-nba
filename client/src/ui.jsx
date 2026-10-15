import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';

// ---- routing ----
export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new Event('to:navigate'));
  scrollTo(0, 0);
}
export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on); addEventListener('to:navigate', on);
    return () => { removeEventListener('popstate', on); removeEventListener('to:navigate', on); };
  }, []);
  return path;
}
export function Link({ to, children, className, onClick, ...rest }) {
  return (
    <a href={to} className={className} {...rest} onClick={e => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || /^https?:/.test(to)) return;
      e.preventDefault(); navigate(to);
    }}>{children}</a>
  );
}
export function Redirect({ to }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return <Spinner />;
}

// ---- brand ----
export function Mark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mark">
      <rect width="64" height="64" rx="18" fill="#ff5a1f" />
      <path d="M8 40c10-4 20-4 30 4M26 8c-4 12-2 26 8 48" fill="none" stroke="#c43c0b" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <path d="M17 33l10 10 20-22" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Logo({ to = '/' }) { return <Link to={to} className="logo"><Mark /><span>turnout</span></Link>; }

// ---- time ----
export const day = d => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const longDay = d => new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const clock = d => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export function relDay(d, now = new Date()) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 864e5);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 && n < 7 ? new Date(d).toLocaleDateString(undefined, { weekday: 'long' }) : day(d);
}
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return day(d);
}
export const money = n => (n == null ? '' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0 }));

// ---- people ----
const HUES = [12, 32, 160, 200, 230, 265, 300, 340, 90, 50];
export function Avatar({ name = '?', size = 32, ring }) {
  const h = HUES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return <span className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${h} 70% 88%)`, color: `hsl(${h} 60% 28%)` }} aria-hidden="true">{initials}</span>;
}

// ---- controls ----
export function Button({ kind = 'primary', loading, children, className = '', ...rest }) {
  return <button className={`btn ${kind} ${className}`} disabled={loading || rest.disabled} {...rest}>{loading && <span className="spin" />}{children}</button>;
}
export function Field({ label, hint, children }) {
  return <label className="field"><span className="flabel">{label}</span>{children}{hint && <span className="fhint">{hint}</span>}</label>;
}
export function Copy({ text, label = 'Copy', className = 'btn ghost sm' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>{done ? 'Copied ✓' : label}</button>
  );
}
export function Stepper({ value, onChange, min = 0, max = 5, label }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">−</button>
      <b>{value}</b>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">+</button>
    </span>
  );
}
export function Modal({ title, onClose, children, width = 520 }) {
  const ref = useRef();
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    ref.current?.querySelector('input,select,textarea')?.focus();
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} ref={ref}>
        <div className="mhead"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastHost({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setList(l => [...l, { id, text, kind }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{list.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
export const Spinner = () => <div className="loading"><span className="spin" /> Loading…</div>;
export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

// share sheet on phones, copy elsewhere
export async function share({ title, text, url }, toast) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast?.('Link copied'); } catch { toast?.(url); }
}
