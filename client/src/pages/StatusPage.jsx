import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, Mark, Spinner, Pill, ago, useNow } from '../ui.jsx';

const OVERALL = { up: ['All systems running', 'up'], late: ['Some jobs are running late', 'late'], down: ['Some jobs are down', 'down'], none: ['Nothing to show yet', 'new'] };

export default function StatusPage({ slug }) {
  const [d, setD] = useState(null), [err, setErr] = useState('');
  const now = useNow(30000);
  useEffect(() => {
    const load = () => api(`public?slug=${encodeURIComponent(slug)}`).then(x => { setD(x); document.title = `${x.title} — status`; }, e => setErr(e.message));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [slug]);
  if (err) return <div className="statuspage"><div className="spwrap"><h1>Status page not found</h1><p className="muted">Check the address and try again.</p></div></div>;
  if (!d) return <Spinner />;
  const [label, s] = OVERALL[d.overall];
  return (
    <div className="statuspage">
      <div className="spwrap">
        <h1>{d.title}</h1>
        <div className={'overall s-' + s}><i className={'dot s-' + s} />{label}</div>
        <div className="splist">
          {d.checks.map((c, i) => (
            <div key={i} className="spitem">
              <div className="sphead"><div><b>{c.name}</b><small>{c.uptime30 == null ? '' : `${(c.uptime30 * 100).toFixed(2)}% uptime · `}last run {ago(c.lastPing, now)}</small></div><Pill state={c.state} /></div>
              {c.desc && <p className="muted small">{c.desc}</p>}
              <div className="bars" role="img" aria-label={`Last 30 days for ${c.name}`}>
                {c.bars.map(b => <i key={b.day} className={'b-' + b.s} title={`${b.day}: ${b.s === 'none' ? 'no data' : b.s === 'up' ? 'no downtime' : `${((1 - b.u) * 100).toFixed(1)}% down`}`} />)}
              </div>
              <div className="spfoot"><span>30 days ago</span><span>Today</span></div>
            </div>
          ))}
        </div>
        <p className="powered"><Link to="/"><Mark size={16} /> Monitored by Nightjar</Link></p>
      </div>
    </div>
  );
}
