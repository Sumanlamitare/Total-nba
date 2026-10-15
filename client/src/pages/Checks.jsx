import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Link, Pill, Dot, Spark, Button, Field, Modal, Empty, Spinner, every, ago, useNow, navigate, useToast } from '../ui.jsx';

const UNITS = [['minutes', 60], ['hours', 3600], ['days', 86400]];
const split = sec => { for (const [u, s] of [...UNITS].reverse()) if (sec % s === 0) return [sec / s, u]; return [Math.round(sec / 60), 'minutes']; };

// "every [5] [minutes]" with one-tap presets
export function Duration({ value, onChange, presets }) {
  const [n, u] = split(value);
  const mult = Object.fromEntries(UNITS);
  return (
    <div>
      <div className="dur">
        <input type="number" min="1" value={n} onChange={e => onChange(Math.max(1, Math.round(+e.target.value || 1)) * mult[u])} aria-label="Amount" />
        <select value={u} onChange={e => onChange(n * mult[e.target.value])} aria-label="Unit">{UNITS.map(([k]) => <option key={k}>{k}</option>)}</select>
      </div>
      {presets && <div className="presets">{presets.map(([label, s]) => <button type="button" key={s} className={value === s ? 'on' : ''} onClick={() => onChange(s)}>{label}</button>)}</div>}
    </div>
  );
}
export const PERIODS = [['5 min', 300], ['15 min', 900], ['Hourly', 3600], ['6 hours', 21600], ['Daily', 86400], ['Weekly', 604800]];
export const GRACES = [['5 min', 300], ['30 min', 1800], ['1 hour', 3600], ['6 hours', 21600]];
const defaultGrace = p => (p <= 900 ? 300 : p <= 3600 ? 900 : p <= 86400 ? 3600 : 21600);

function NewCheck({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', period: 86400, grace: 3600, tags: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [graceTouched, setGT] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api('checks', { method: 'POST', body: f });
      toast('Check created — now add the ping to your job');
      navigate(`/app/checks/${r.check.id}?new=1`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <Modal title="New check" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Name" hint="What does the job do?"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nightly database backup" maxLength={80} /></Field>
        <Field label="Runs every" hint="How often the job should ping.">
          <Duration value={f.period} presets={PERIODS} onChange={p => setF({ ...f, period: p, grace: graceTouched ? f.grace : defaultGrace(p) })} />
        </Field>
        <Field label="Grace time" hint="How late is too late? We alert after the schedule plus this.">
          <Duration value={f.grace} presets={GRACES} onChange={g => { setGT(true); setF({ ...f, grace: g }); }} />
        </Field>
        <Field label="Tags (optional)" hint="Separate with commas, e.g. prod, billing"><input value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} placeholder="prod, db" /></Field>
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button kind="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create check</Button></div>
      </form>
    </Modal>
  );
}

const ORDER = { down: 0, late: 1, running: 2, up: 3, new: 4, paused: 5 };

export default function Checks() {
  const [data, setData] = useState(null), [err, setErr] = useState('');
  const [creating, setCreating] = useState(false), [q, setQ] = useState(''), [tag, setTag] = useState('');
  const now = useNow(10000);
  const welcome = new URLSearchParams(location.search).has('welcome');

  useEffect(() => {
    let live = true;
    const load = () => api('checks').then(d => live && setData(d), e => live && setErr(e.message));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const tags = useMemo(() => [...new Set((data?.checks || []).flatMap(c => c.tags))].sort(), [data]);
  if (err) return <div className="page"><p className="formerr">{err}</p></div>;
  if (!data) return <Spinner />;
  const counts = data.checks.reduce((m, c) => ({ ...m, [c.state]: (m[c.state] || 0) + 1 }), {});
  const list = data.checks
    .filter(c => (!q || (c.name + ' ' + c.tags.join(' ')).toLowerCase().includes(q.toLowerCase())) && (!tag || c.tags.includes(tag)))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
  const atLimit = data.limits.used >= data.limits.checks;

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Checks</h1>
          <p className="muted">{data.limits.used} of {data.limits.checks} on the {data.limits.plan} plan</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={atLimit} title={atLimit ? 'Plan limit reached' : ''}>+ New check</Button>
      </div>

      {data.checks.length === 0 ? (
        <Empty title={welcome ? 'Welcome to Nightjar 👋' : 'No checks yet'} action={<Button onClick={() => setCreating(true)}>Create your first check</Button>}>
          A check watches one scheduled job. Tell us how often it runs, add one line to the job, and we'll tell you the moment it stops.
        </Empty>
      ) : <>
        <div className="summary">
          {['down', 'late', 'up', 'running', 'new', 'paused'].filter(s => counts[s]).map(s => (
            <div key={s} className={'stat s-' + s}><Dot state={s} /><b>{counts[s]}</b><span>{{ down: 'down', late: 'late', up: 'up', running: 'running', new: 'waiting', paused: 'paused' }[s]}</span></div>
          ))}
        </div>
        <div className="filters">
          <input type="search" placeholder="Search checks" value={q} onChange={e => setQ(e.target.value)} aria-label="Search checks" />
          {tags.length > 0 && <div className="chips">
            <button className={!tag ? 'on' : ''} onClick={() => setTag('')}>All</button>
            {tags.map(t => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? '' : t)}>#{t}</button>)}
          </div>}
        </div>
        <div className="checklist">
          {list.map(c => (
            <Link key={c.id} to={`/app/checks/${c.id}`} className={'checkrow s-' + c.state}>
              <div className="cname">
                <b>{c.name}</b>
                <small>{every(c.period)}{c.tags.map(t => <span key={t} className="tag">#{t}</span>)}</small>
              </div>
              <div className="clast"><small>Last ping</small><span>{ago(c.lastPing, now)}</span></div>
              <Spark pings={c.spark} />
              <Pill state={c.state} />
            </Link>
          ))}
          {!list.length && <p className="muted pad">No checks match.</p>}
        </div>
      </>}
      {creating && <NewCheck onClose={() => setCreating(false)} />}
    </div>
  );
}
