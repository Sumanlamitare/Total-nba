import { useState } from 'react';
import { I } from './ui.jsx';

// Pro status lives on this device for now. When Stripe is connected (VITE_STRIPE_LINK), checkout returns here
// and sets it; until then the Pro page can switch on a preview so the paid features can be seen.
const read = () => { try { return localStorage.getItem('tn_pro') === '1'; } catch { return false; } };
export function usePro() {
  const [pro, setPro] = useState(read);
  return { pro, set: v => { try { localStorage.setItem('tn_pro', v ? '1' : '0'); } catch { /* */ } setPro(v); } };
}

const LOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;

// Shown in place of a Pro feature
export function ProLock({ title, sub, onPro, compact }) {
  return (
    <div className={'prolock' + (compact ? ' compact' : '')}>
      <span className="pl-ic">{LOCK}</span>
      <span className="pl-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <button className="btn" onClick={onPro}>GO PRO</button>
    </div>
  );
}

const FEATURES = [
  ['Player splits', 'Last 5, 10 and 20 games, home vs away, wins vs losses and totals against every opponent.'],
  ['CSV exports', 'Download any leaderboard, season or record list for your own spreadsheets and models.'],
  ['Clean graphics', 'Top 10 graphics without the TotalNBA watermark, ready to post.'],
  ['No ads', 'The whole site, ad-free, on every device you use.'],
  ['Early features', 'Player comparisons and stat alerts as they ship.'],
];

export function ProPage({ pro }) {
  const link = import.meta.env.VITE_STRIPE_LINK;
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const join = async e => {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, from: 'pro-page' }) });
      const b = await r.json();
      setState(r.ok ? 'done' : b.error || 'error');
    } catch { setState('Could not send — try again'); }
  };
  return (
    <div className="pro">
      <header className="pro-hd">
        <small>TOTALNBA PRO</small>
        <h1>THE STATS<br />BEHIND <span>THE STATS</span></h1>
        <p>Everything on TotalNBA stays free. Pro adds the deep cuts for fantasy players, bettors and anyone who builds their own numbers.</p>
      </header>
      <div className="plans">
        <div className="plan"><small>MONTHLY</small><b>$4.99</b><span>per month</span></div>
        <div className="plan best"><i>SAVE 35%</i><small>YEARLY</small><b>$39</b><span>per year</span></div>
      </div>
      {pro.pro ? (
        <div className="pro-on"><span className="pl-ic">{I.crown}</span><b>Pro is on for this device.</b><button className="btn ghost" onClick={() => pro.set(false)}>TURN OFF PREVIEW</button></div>
      ) : link ? (
        <a className="btn big" href={link}>GO PRO</a>
      ) : state === 'done' ? (
        <div className="pro-on"><b>You’re on the list.</b><span>We’ll email you when Pro opens — with launch pricing.</span></div>
      ) : (
        <form className="wait" onSubmit={join}>
          <label className="sbox"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email for early access" aria-label="Email" /></label>
          <button className="btn big" disabled={state === 'sending'}>{state === 'sending' ? 'JOINING…' : 'GET EARLY ACCESS'}</button>
          {state && state !== 'sending' && <p className="wait-err">{state}</p>}
        </form>
      )}
      <ul className="feats">
        {FEATURES.map(([t, d], i) => <li key={t} style={{ '--i': i }}><span className="pl-ic">{I.crown}</span><span><b>{t}</b><small>{d}</small></span></li>)}
      </ul>
      {!pro.pro && <button className="pro-preview" onClick={() => pro.set(true)}>Preview Pro on this device</button>}
    </div>
  );
}

// CSV download (Pro)
export function downloadCSV(name, cols, rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map(c => q(c[0])).join(','), ...rows.map(r => cols.map(c => q(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const CSV_COLS = [['Player', 'name'], ['Team', 'team'], ['Opponent', 'opp'], ['Date', 'date'], ['GP', 'gp'], ['MIN', 'min'], ['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'],
  ['STL', 'stl'], ['BLK', 'blk'], ['3PM', 'tpm'], ['2PM', 'fg2m'], ['FTM', 'ftm'], ['TOV', 'tov'], ['PF', 'pf'], ['FPTS', 'fan']];
