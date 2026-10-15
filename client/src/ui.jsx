import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';

// ---- routing: history API + a tiny event so any component can navigate ----
export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search + location.hash) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new Event('nj:navigate'));
  if (!to.includes('#')) scrollTo(0, 0);
}
export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on); addEventListener('nj:navigate', on);
    return () => { removeEventListener('popstate', on); removeEventListener('nj:navigate', on); };
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

// ---- brand ----
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mark">
      <rect width="64" height="64" rx="15" fill="#14163a" />
      <mask id="nj-moon"><rect width="64" height="64" fill="#fff" /><circle cx="40" cy="24" r="17" fill="#000" /></mask>
      <circle cx="30" cy="32" r="20" fill="#efeaff" mask="url(#nj-moon)" />
      <path d="M14 40h9l4-9 6 17 5-12h12" fill="none" stroke="#ffb23f" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Logo({ to = '/' }) {
  return <Link to={to} className="logo"><Mark /><span>Nightjar</span></Link>;
}

// ---- time ----
export function human(sec) {
  sec = Math.max(0, Math.round(sec));
  const units = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]], out = [];
  for (const [n, s] of units) { const k = Math.floor(sec / s); if (k) { out.push(`${k} ${n}${k > 1 ? 's' : ''}`); sec -= k * s; } if (out.length === 2) break; }
  return out.join(' ') || '0 seconds';
}
export function every(sec) {
  const map = { 60: 'every minute', 300: 'every 5 minutes', 900: 'every 15 minutes', 1800: 'every 30 minutes', 3600: 'hourly', 21600: 'every 6 hours', 43200: 'every 12 hours', 86400: 'daily', 604800: 'weekly' };
  return map[sec] || `every ${human(sec)}`;
}
export function ago(at, now = Date.now()) {
  if (!at) return 'never';
  const s = (now - new Date(at)) / 1000;
  if (s < 0) return 'in ' + short(-s);
  if (s < 10) return 'just now';
  return short(s) + ' ago';
}
export function short(s) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 360) / 10} h`.replace('.0 h', ' h');
  return `${Math.round(s / 8640) / 10} d`.replace('.0 d', ' d');
}
export const dur = ms => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${m} min` : `${m} min${r ? ` ${r} s` : ''}`;
};
export const when = at => (at ? new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—');
export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ---- status ----
export const STATE = {
  up: { label: 'Up', hint: 'Pinging on time' },
  late: { label: 'Late', hint: 'Past its schedule, inside the grace time' },
  down: { label: 'Down', hint: 'Missed its deadline or reported a failure' },
  running: { label: 'Running', hint: 'Started, waiting for it to finish' },
  new: { label: 'Waiting', hint: 'Waiting for the first ping' },
  paused: { label: 'Paused', hint: 'Not monitored until resumed or pinged' },
};
export function Pill({ state, big }) {
  return <span className={`pill s-${state}${big ? ' big' : ''}`} title={STATE[state]?.hint}><i />{STATE[state]?.label || state}</span>;
}
export function Dot({ state }) { return <i className={`dot s-${state}`} title={STATE[state]?.label} />; }

// last pings as small bars: green success, red fail, blue start
export function Spark({ pings = [], n = 30 }) {
  const list = pings.filter(p => p.kind !== 'log').slice(-n);
  return (
    <span className="spark" aria-hidden="true">
      {Array.from({ length: n - list.length }, (_, i) => <i key={'e' + i} className="k-empty" />)}
      {list.map((p, i) => <i key={i} className={'k-' + p.kind} />)}
    </span>
  );
}

// ---- controls ----
export function Button({ kind = 'primary', loading, children, className = '', ...rest }) {
  return <button className={`btn ${kind} ${className}`} disabled={loading || rest.disabled} {...rest}>{loading ? <span className="spin" /> : null}{children}</button>;
}
export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span className="flabel">{label}</span>
      {children}
      {error ? <span className="ferr">{error}</span> : hint ? <span className="fhint">{hint}</span> : null}
    </label>
  );
}
export function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>{done ? 'Copied ✓' : label}</button>
  );
}
export function CopyField({ value, mono = true }) {
  return <div className="copyfield"><code className={mono ? '' : 'plain'}>{value}</code><Copy text={value} /></div>;
}
export function Code({ children, lang }) {
  return <div className="code"><pre data-lang={lang}><code>{children}</code></pre><Copy text={children} /></div>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}</div>;
}

export function Modal({ title, onClose, children, width = 520 }) {
  const ref = useRef();
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    ref.current?.querySelector('input,select,textarea,button')?.focus();
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

// ---- toasts ----
const ToastCtx = createContext(() => {});
export function ToastHost({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setList(l => [...l, { id, text, kind }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{list.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export const Spinner = () => <div className="loading"><span className="spin" /> Loading…</div>;

// navigate after render (never during it)
export function Redirect({ to }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return <Spinner />;
}
