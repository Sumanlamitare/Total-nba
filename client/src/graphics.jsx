// Graphics: everything generated in the current period (kept apart from match data), and one graphic with its preview,
// download, regenerate and editor. The preview is the same SVG the server turns into the PNG.
import React, { useMemo, useState } from 'react';
import { get, post, useLoad, when, ago, go } from './api.js';
import { Link } from './App.jsx';
import { Empty, ErrorBox, Loading } from './ui.jsx';
import { buildScene } from '../../lib/graphics/fulltime.js';
import { renderScene } from '../../lib/graphics/render.js';

const pngUrl = (g, download) => `/api/graphics?action=png&id=${g._id}&v=${g.version}${download ? '&download=1' : ''}`;
const STATUS = { ready: ['Ready', 'ok'], review: ['Needs review', 'warn'], failed: ['Failed', 'bad'] };
const Badge = ({ g }) => { const [l, c] = STATUS[g.status] || [g.status, '']; return <span className={`badge ${c}`}>{l}</span>; };

export function Graphics() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(() => get('graphics', { action: 'list', status }), [status], { every: 60e3 });
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Graphics</h1>
          <p className="muted">Every full-time graphic, 1080 × 1350 PNG. Kept after match data is deleted{data?.retentionDays ? `; removed after ${data.retentionDays} days unless you keep one` : ''}.</p>
        </div>
        <div className="seg">{[['', 'All'], ['ready', 'Ready'], ['review', 'Needs review'], ['failed', 'Failed']].map(([k, l]) => <button key={k} type="button" className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      </div>
      {!data ? <Loading label="Loading graphics" /> : !data.items.length ? <Empty title="No graphics yet">A graphic is made automatically when ESPN confirms a match has finished.</Empty> : (
        <div className="grid">
          {data.items.map(g => (
            <Link key={g._id} to={`/graphics/${g._id}`} className="tile">
              <span className="thumb"><img src={pngUrl(g)} alt={`${g.match?.home} ${g.data.score?.home}–${g.data.score?.away} ${g.match?.away}`} loading="lazy" width="1080" height="1350" /></span>
              <span className="tile-meta"><b>{g.data.home?.name} {g.data.score?.home}–{g.data.score?.away} {g.data.away?.name}</b><small>{g.data.competition?.name} · {ago(g.createdAt)}</small><span className="tile-tags"><Badge g={g} />{g.edited && <span className="badge">Edited</span>}{g.downloads > 0 && <span className="badge">Downloaded</span>}{g.keep && <span className="badge">Kept</span>}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

export function GraphicPage({ id }) {
  const { data: g, error, reload, setData } = useLoad(() => get('graphics', { action: 'get', id }), [id]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const edited = useMemo(() => {
    if (!g) return null;
    if (!form) return g.data;
    return { ...g.data, competition: { ...g.data.competition, name: form.comp }, home: { ...g.data.home, name: form.home }, away: { ...g.data.away, name: form.away },
      score: { home: +form.sh || 0, away: +form.sa || 0 }, shootout: form.ph !== '' && form.pa !== '' ? { home: +form.ph, away: +form.pa } : null, note: form.note || null,
      scorers: { home: lines(form.scH), away: lines(form.scA) }, date: form.date, statusLabel: form.label || 'Full time' };
  }, [g, form]);
  const svg = useMemo(() => (edited ? renderScene(buildScene(edited, g.theme || {})) : ''), [edited, g]);
  if (error && !g) return <ErrorBox error={error} retry={reload} />;
  if (!g) return <Loading label="Loading graphic" />;
  const startEdit = () => { const d = g.data; setForm({ comp: d.competition?.name || '', home: d.home?.name || '', away: d.away?.name || '', sh: d.score?.home ?? 0, sa: d.score?.away ?? 0, ph: d.shootout?.home ?? '', pa: d.shootout?.away ?? '', note: d.note || '', scH: (d.scorers?.home || []).join('\n'), scA: (d.scorers?.away || []).join('\n'), date: d.date || '', label: d.statusLabel || 'Full time' }); };
  const act = async (name, fn) => { setBusy(name); setMsg(null); try { await fn(); } catch (e) { setMsg({ bad: true, text: e.message }); } finally { setBusy(''); } };
  const save = approve => act(approve ? 'approve' : 'save', async () => {
    const edits = { 'competition.name': form.comp, 'home.name': form.home, 'away.name': form.away, 'score.home': form.sh, 'score.away': form.sa, shootout: form.ph !== '' && form.pa !== '' ? { home: form.ph, away: form.pa } : null, note: form.note, 'scorers.home': lines(form.scH), 'scorers.away': lines(form.scA), date: form.date, statusLabel: form.label };
    const r = await post('graphics', 'save', { id, edits, approve });
    setData(x => ({ ...x, ...r, edits })); setForm(null); setMsg({ text: approve ? 'Saved and marked ready.' : 'Saved.' });
  });
  const reset = () => act('reset', async () => { const r = await post('graphics', 'save', { id, reset: true }); setData(x => ({ ...x, ...r, edits: {} })); setForm(null); setMsg({ text: 'Edits cleared: back to the data ESPN gave.' }); });
  const regen = () => act('regen', async () => { const r = await post('graphics', 'regenerate', { id }); setData(x => ({ ...x, ...r })); setMsg({ text: g.matchDataHeld ? 'Regenerated from the latest match data.' : 'Regenerated (match data already cleaned up: from the graphic’s saved data).' }); });
  const approve = () => act('approve', async () => { const r = await post('graphics', 'save', { id, edits: g.edits, approve: true }); setData(x => ({ ...x, ...r })); setMsg({ text: 'Marked ready.' }); });
  const keep = () => act('keep', async () => { await post('graphics', 'keep', { id, keep: !g.keep }); setData(x => ({ ...x, keep: !x.keep })); });
  const remove = () => act('remove', async () => { if (!confirm('Delete this graphic? Its PNG and data are removed for good.')) return; await post('graphics', 'remove', { id }); go('/graphics'); });
  const r = g.render;
  return (
    <div className="page">
      <p className="crumbs"><Link to="/graphics">← Graphics</Link></p>
      <div className="graphic-page">
        <div className="preview">
          <div className="canvas" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Graphic preview" role="img" />
          <p className="muted small center">{form ? 'Live preview of your edits (not saved yet)' : 'Preview · 1080 × 1350'}</p>
        </div>
        <div className="side">
          <h1>{g.data.home?.name} {g.data.score?.home}–{g.data.score?.away} {g.data.away?.name}</h1>
          <p className="muted">{g.data.competition?.name} · {g.match?.kickoff ? when(g.match.kickoff) : g.data.date}</p>
          <div className="tile-tags"><Badge g={g} />{g.edited && <span className="badge">Edited</span>}{g.approved && <span className="badge ok">Approved</span>}{g.keep && <span className="badge">Kept</span>}</div>
          {g.problems?.length > 0 && !g.approved && <div className="notice warn"><b>Check before posting.</b> ESPN's data didn't add up, so this wasn't marked ready:<ul>{g.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>Fix it in the editor (or confirm it's right), then approve.</div>}
          {g.error && <div className="notice bad">Rendering failed: {g.error}</div>}
          {msg && <div className={`notice ${msg.bad ? 'bad' : 'ok'}`}>{msg.text}</div>}
          <div className="actions wrap">
            <a className="btn primary" href={pngUrl(g, true)} download>Download PNG</a>
            <button type="button" className="ghost" onClick={regen} disabled={!!busy}>{busy === 'regen' ? 'Regenerating…' : 'Regenerate'}</button>
            {!form && <button type="button" className="ghost" onClick={startEdit}>Edit</button>}
            {g.status === 'review' && !form && <button type="button" className="ghost" onClick={approve} disabled={!!busy}>Approve as is</button>}
            <button type="button" className="ghost" onClick={keep} disabled={!!busy}>{g.keep ? 'Don’t keep' : 'Keep (skip auto-removal)'}</button>
          </div>
          <dl className="facts">
            <dt>Saved</dt><dd>{r?.ok ? `Yes · rendered ${(r.bytes / 1024).toFixed(0)} KB PNG${r.missingImages?.length ? ` · ${r.missingImages.length} logo${r.missingImages.length === 1 ? '' : 's'} unavailable` : ''}` : 'Not rendered yet'}</dd>
            <dt>Generated</dt><dd>{when(g.createdAt)}{g.version > 1 ? ` · version ${g.version}, updated ${ago(g.updatedAt)}` : ''}</dd>
            <dt>Downloads</dt><dd>{g.downloads ? `${g.downloads} · last ${ago(g.downloadedAt)}` : 'None yet'}</dd>
            <dt>Match data</dt><dd>{g.matchDataHeld ? 'Still held (until cleanup)' : 'Cleaned up — the graphic keeps its own copy'}</dd>
            <dt>ESPN event</dt><dd>{g._id}</dd>
          </dl>
          {form && (
            <form className="editor" onSubmit={e => { e.preventDefault(); save(false); }}>
              <h2>Edit</h2>
              <label>Competition<input value={form.comp} onChange={e => setForm({ ...form, comp: e.target.value })} maxLength={80} /></label>
              <div className="two"><label>Home team<input value={form.home} onChange={e => setForm({ ...form, home: e.target.value })} maxLength={80} /></label><label>Away team<input value={form.away} onChange={e => setForm({ ...form, away: e.target.value })} maxLength={80} /></label></div>
              <div className="two"><label>Home score<input type="number" min="0" max="99" value={form.sh} onChange={e => setForm({ ...form, sh: e.target.value })} /></label><label>Away score<input type="number" min="0" max="99" value={form.sa} onChange={e => setForm({ ...form, sa: e.target.value })} /></label></div>
              <div className="two"><label>Home pens (shootout)<input type="number" min="0" max="30" value={form.ph} onChange={e => setForm({ ...form, ph: e.target.value })} placeholder="—" /></label><label>Away pens<input type="number" min="0" max="30" value={form.pa} onChange={e => setForm({ ...form, pa: e.target.value })} placeholder="—" /></label></div>
              <div className="two"><label>Home scorers <small>one per line</small><textarea rows={5} value={form.scH} onChange={e => setForm({ ...form, scH: e.target.value })} placeholder={"Player 12', 45+2' (P)"} /></label><label>Away scorers<textarea rows={5} value={form.scA} onChange={e => setForm({ ...form, scA: e.target.value })} /></label></div>
              <div className="two"><label>Line under the score<input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="After extra time" maxLength={60} /></label><label>Date<input value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} maxLength={40} /></label></div>
              <label>Status label<input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} maxLength={24} /></label>
              <div className="actions wrap">
                <button type="submit" className="primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                {g.status === 'review' && <button type="button" onClick={() => save(true)} disabled={!!busy}>Save and approve</button>}
                <button type="button" className="ghost" onClick={() => setForm(null)}>Cancel</button>
                {g.edited && <button type="button" className="ghost" onClick={reset} disabled={!!busy}>Reset to ESPN data</button>}
              </div>
            </form>
          )}
          <button type="button" className="link danger-text" onClick={remove}>Delete this graphic</button>
        </div>
      </div>
    </div>
  );
}
