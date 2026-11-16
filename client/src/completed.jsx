// Completed Matches – Pending Deletion, and the DELETE COMPLETED MATCH DATA button.
import React, { useEffect, useState } from 'react';
import { get, post, useLoad, when, until, useMe } from './api.js';
import { Link } from './App.jsx';
import { Crest, Status, Empty, ErrorBox, Loading, Modal, score } from './ui.jsx';

export function Completed() {
  const { user } = useMe();
  const { data, error, reload } = useLoad(() => get('matches', { action: 'completed' }), [], { every: 30e3 });
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30e3); return () => clearInterval(t); }, []);
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading label="Loading completed matches" />;
  const p = data.cleanup;
  const open = async () => { setDone(null); setAsk(await get('matches', { action: 'preview' })); };
  const confirm = async () => {
    setBusy(true);
    try { const r = await post('matches', 'deleteCompleted', { confirm: true }); setDone(r); setAsk(null); reload(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Completed Matches – Pending Deletion</h1>
          <p className="muted">Finished matches whose graphic is made. Their match data is temporary; the graphics stay in <Link to="/graphics">Graphics</Link> after it's deleted.</p>
        </div>
      </div>
      <div className="cleanup-bar">
        <div>
          <b>Automatic cleanup {p.enabled ? until(p.dueAt) : 'is off'}</b>
          {p.enabled && <span className="muted"> · {when(p.dueAt)} — {p.basis === 'first-kickoff' ? `before the first kickoff of the day (${when(p.firstKickoff)})` : 'no matches that day: the fallback time'}</span>}
          {p.lastRun && <div className="muted small">Last cleanup {when(p.lastRun.at)} ({p.lastRun.reason}): {p.lastRun.deleted} deleted{p.failures ? ` · ${p.failures} failed attempt${p.failures === 1 ? '' : 's'}, retrying` : ''}</div>}
        </div>
        <button type="button" className="danger big" onClick={open} disabled={user?.role !== 'owner'} title={user?.role !== 'owner' ? 'Only the owner can delete data' : undefined}>DELETE COMPLETED MATCH DATA</button>
      </div>
      {done && <div className="notice ok">Deleted {done.deleted} completed match{done.deleted === 1 ? '' : 'es'} and {done.goalEvents} goal events. Graphics kept. Upcoming and live matches were not touched.</div>}
      {!data.items.length ? <Empty title="Nothing finished yet">Matches show up here at full time, once their graphic is made.</Empty> : (
        <div className="table">
          <div className="thead"><span>Match</span><span>Competition</span><span>Kickoff</span><span>Result</span><span>Graphic</span><span>Cleanup</span></div>
          {data.items.map(m => (
            <div key={m._id} className="trow">
              <span className="match"><Crest src={m.home.logo} name={m.home.name} size={22} /><b>{m.home.name}</b><span className="muted">v</span><b>{m.away.name}</b><Crest src={m.away.logo} name={m.away.name} size={22} /></span>
              <span className="muted">{m.compName}</span>
              <span>{when(m.kickoff)}</span>
              <span className="result">{score(m)}{m.shootout?.home != null ? ` (${m.shootout.home}–${m.shootout.away} pens)` : ''}</span>
              <span>{['generated', 'review', 'failed'].includes(m.stage.key) ? <Link to={`/graphics/${m._id}`}><Status stage={m.stage} /></Link> : <Status stage={m.stage} />}</span>
              <span className="muted">{['generated', 'review', 'failed', 'removed'].includes(m.graphic?.status) ? (p.enabled ? until(p.dueAt) : 'manual only') : 'kept until its graphic is made'}</span>
            </div>
          ))}
        </div>
      )}
      {ask && (
        <Modal title="Delete completed match data?" onClose={() => setAsk(null)}>
          {ask.matches ? (
            <>
              <p>This deletes <b>{ask.matches} completed match{ask.matches === 1 ? '' : 'es'}</b> and <b>{ask.goalEvents} goal event{ask.goalEvents === 1 ? '' : 's'}</b> — <b>{ask.records} temporary records</b> in all.</p>
              <ul className="keeps">
                <li>Only matches ESPN confirmed as full time, with their graphic made</li>
                <li>Upcoming and live matches are kept</li>
                <li>Graphics, competition settings and app settings are kept</li>
                {ask.kept.generating > 0 && <li>{ask.kept.generating} finished match{ask.kept.generating === 1 ? ' is' : 'es are'} still getting a graphic and will be kept</li>}
              </ul>
              <div className="actions"><button type="button" className="ghost" onClick={() => setAsk(null)}>Cancel</button><button type="button" className="danger" onClick={confirm} disabled={busy}>{busy ? 'Deleting…' : `Delete ${ask.records} records`}</button></div>
            </>
          ) : (
            <><p>There's nothing to delete right now: no finished match with a graphic is waiting.</p><div className="actions"><button type="button" onClick={() => setAsk(null)}>OK</button></div></>
          )}
        </Modal>
      )}
    </div>
  );
}
