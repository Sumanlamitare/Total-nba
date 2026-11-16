// Matches: everything scheduled across the competitions, by day (in your time zone) and competition, with each match's
// status and its graphic.
import React, { useMemo, useState } from 'react';
import { get, post, useLoad, dayKey, dayName, time, until, localZone, ago } from './api.js';
import { Link } from './App.jsx';
import { Crest, Status, Empty, ErrorBox, Loading, score } from './ui.jsx';

const FILTERS = [['all', 'All'], ['live', 'Live'], ['scheduled', 'Scheduled'], ['done', 'Full time'], ['review', 'Needs review']];
const pass = (f, m) => f === 'all' || (f === 'live' && ['live', 'halftime'].includes(m.stage.key)) || (f === 'scheduled' && m.stage.key === 'scheduled') || (f === 'done' && ['ft', 'generated'].includes(m.stage.key)) || (f === 'review' && ['review', 'failed'].includes(m.stage.key));

export function Dashboard() {
  const { data, error, reload } = useLoad(() => get('matches', { action: 'dashboard' }), [], { every: 30e3 });
  const [day, setDay] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    if (!data) return [];
    const by = new Map();
    for (const m of data.matches) { const k = dayKey(m.kickoff); if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
    return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => ({ k, list }));
  }, [data]);
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading label="Loading matches" />;
  const todayKey = dayKey(new Date());
  const cur = day && days.some(d => d.k === day) ? day : (days.find(d => d.k >= todayKey) || days.at(-1))?.k;
  const list = (days.find(d => d.k === cur)?.list || []).filter(m => pass(filter, m) && (!q || `${m.home.name} ${m.away.name} ${m.compName}`.toLowerCase().includes(q.toLowerCase())));
  const comps = new Map();
  for (const m of list) { if (!comps.has(m.comp)) comps.set(m.comp, { code: m.comp, name: m.compName, logo: m.compLogo, matches: [] }); comps.get(m.comp).matches.push(m); }
  const groups = [...comps.values()].sort((a, b) => (data.order[a.code] ?? 99) - (data.order[b.code] ?? 99));
  const c = data.counts;
  const refresh = async () => { setBusy(true); try { await post('matches', 'refresh'); reload(); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Matches</h1>
          <p className="muted">Kickoff times in your time zone ({localZone()}). Schedule refreshed {ago(data.jobs.sync?.at)}{data.jobs.poll ? ` · live check ${ago(data.jobs.poll)}` : ''}.</p>
        </div>
        <button type="button" className="ghost" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh schedule'}</button>
      </div>
      <div className="stats">
        <Stat n={c.live} label="Live" k="live" /><Stat n={c.scheduled} label="Scheduled" k="scheduled" /><Stat n={c.ft} label="Full time · making graphic" k="ft" />
        <Stat n={c.generated} label="Graphics generated" k="generated" /><Stat n={c.review} label="Need review" k="review" />
        <Link to="/completed" className="stat link"><b>{data.cleanup.enabled ? until(data.cleanup.dueAt) : 'off'}</b><span>Next automatic cleanup</span></Link>
      </div>
      <div className="day-tabs" role="tablist" aria-label="Day">
        {days.map(d => <button key={d.k} type="button" role="tab" aria-selected={d.k === cur} className={d.k === cur ? 'on' : ''} onClick={() => setDay(d.k)}>{dayName(d.k)}<small>{d.list.length}</small></button>)}
      </div>
      <div className="toolbar">
        <div className="seg">{FILTERS.map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <input type="search" placeholder="Search team or competition" value={q} onChange={e => setQ(e.target.value)} aria-label="Search matches" />
      </div>
      {!days.length ? <Empty title="No matches yet">The schedule for today and the next two days loads from ESPN within a few minutes of the first visit, then refreshes every few hours.</Empty>
        : !groups.length ? <Empty title="Nothing here">No matches on this day match the filter.</Empty>
        : groups.map(g => (
          <section key={g.code} className="comp">
            <h2><Crest src={g.logo} name={g.name} size={24} />{g.name}<small>{g.matches.length}</small></h2>
            <div className="rows">{g.matches.map(m => <MatchRow key={m._id} m={m} />)}</div>
          </section>
        ))}
    </div>
  );
}

const Stat = ({ n, label, k }) => <div className={`stat k-${k}`}><b>{n}</b><span>{label}</span></div>;

function MatchRow({ m }) {
  const s = score(m);
  const showScore = s && m.status !== 'scheduled';
  return (
    <div className={`row st-${m.stage.key}`}>
      <span className="ko">{time(m.kickoff)}</span>
      <span className="team home"><span className="nm">{m.home.name}</span><Crest src={m.home.logo} name={m.home.name} /></span>
      <span className="sc">{showScore ? s : 'v'}{m.shootout?.home != null && <small>{m.shootout.home}–{m.shootout.away} p</small>}</span>
      <span className="team away"><Crest src={m.away.logo} name={m.away.name} /><span className="nm">{m.away.name}</span></span>
      <span className="st"><Status stage={m.stage} clock={m.clock} /></span>
      <span className="gx">
        {['generated', 'review', 'failed'].includes(m.stage.key) ? <Link to={`/graphics/${m._id}`} className="btn small">{m.stage.key === 'generated' ? 'View graphic' : 'Review'}</Link>
          : m.stage.key === 'ft' ? <span className="muted small">{m.graphic?.status === 'waiting' ? 'Waiting for scorers' : 'Making graphic'}</span> : null}
      </span>
    </div>
  );
}
