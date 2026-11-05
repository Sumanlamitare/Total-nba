// Graphics Studio: the library and the editor. The editor works on a project — a template, the event's structured
// data, a theme, and the edits (overrides, removed and added elements, layer order) — so a graphic stays editable and its
// numbers stay tied to the data. Drag, resize, snap to guides, undo/redo; works with a mouse or a finger.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, useLoad, useMe, can, go, ago } from './api.js';
import { Link, ErrorBox, Loading, CatChip, Empty } from './components.jsx';
import { buildScene, TEMPLATES } from '../../lib/graphics/templates.js';
import { renderScene } from '../../lib/graphics/render.js';
import { FORMATS, sizeOf } from '../../lib/graphics/kit.js';
import { rasterize, download, share } from './export.js';

export function StudioPage() {
  const { user, loaded } = useMe();
  const { data, error, reload } = useLoad(() => (can(user, 'editor') ? get('graphics', { action: 'list' }) : Promise.resolve(null)), [user?._id]);
  const { data: recent } = useLoad(() => get('feed', { action: 'list', level: 'high', limit: 12 }), []);
  const [tpl, setTpl] = useState('player-story');
  if (!loaded) return <Loading />;
  if (!can(user, 'editor')) return <Empty title="Graphics Studio is for editors">Ask the owner for editor access, or <Link to="/signin?next=/studio">sign in</Link>.</Empty>;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const create = async body => { const r = await post('graphics', 'create', body); go(`/studio/${r.id}`); };
  return (
    <div className="studio">
      <div className="page-head"><h1>Graphics Studio</h1><p className="muted">Graphics are made automatically for the biggest events, from verified data. Open one to edit, or start from an event or a template.</p></div>
      <section className="section">
        <h2>From a recent event</h2>
        <div className="mini-list">{(recent?.items || []).map(e => <button key={e._id} type="button" className="mini" onClick={() => create({ feedId: e._id })}><CatChip cat={e.category} /><b>{e.headline}</b><span className="muted small">{e.players?.[0]?.name || e.team?.name || ''} · {e.graphic ? 'has a graphic' : 'make one'}</span></button>)}</div>
      </section>
      <section className="section">
        <h2>Start from a template</h2>
        <div className="filter-row"><select value={tpl} onChange={e => setTpl(e.target.value)} aria-label="Template">{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} — {t.category}</option>)}</select><button className="btn" onClick={() => create({ template: tpl })}>New graphic</button></div>
      </section>
      <section className="section">
        <h2>Library</h2>
        {!data ? <Loading /> : !data.length ? <p className="muted">No graphics yet.</p> : (
          <div className="library">{data.map(g => (
            <Link key={g._id} to={`/studio/${g._id}`} className="lib-item">
              <img src={`/api/graphics?action=render&id=${g._id}&scale=0.3&v=${new Date(g.updatedAt).getTime()}`} alt="" loading="lazy" style={{ aspectRatio: `${g.project.size.w} / ${g.project.size.h}` }} />
              <b>{g.title}</b><span className="muted small">{g.category ? <CatChip cat={g.category} /> : null} {g.edited ? 'edited' : 'automatic'} · {ago(g.updatedAt)}</span>
            </Link>
          ))}</div>
        )}
      </section>
    </div>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────────────────────────────────────────
function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const set = useCallback((next, { merge = false } = {}) => setState(s => {
    const value = typeof next === 'function' ? next(s.present) : next;
    if (value === s.present) return s;
    return merge ? { ...s, present: value } : { past: [...s.past, s.present].slice(-80), present: value, future: [] };
  }), []);
  const checkpoint = useCallback(() => setState(s => ({ ...s, past: [...s.past, s.present].slice(-80), future: [] })), []);
  const undo = useCallback(() => setState(s => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1), future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState(s => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback(v => setState({ past: [], present: v, future: [] }), []);
  return { project: state.present, set, checkpoint, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

const uid = () => `x${Math.random().toString(36).slice(2, 9)}`;
const SNAP = 8;

export function EditorPage({ id }) {
  const { user } = useMe();
  const { data, error, reload } = useLoad(() => get('graphics', { action: 'get', id }), [id]);
  const h = useHistory(null);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState(null);
  const [preview, setPreview] = useState(false);
  const [guides, setGuides] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => { if (data) { h.reset(data.project); setTitle(data.title); setDirty(false); } }, [data]); // eslint-disable-line
  const project = h.project;
  const scene = useMemo(() => (project ? buildScene(project) : null), [project]);
  const svg = useMemo(() => (scene ? renderScene(scene, { editor: true }) : ''), [scene]);
  // Fit the canvas to the available width.
  useEffect(() => {
    if (!scene || !wrap.current) return;
    const fit = () => setScale(Math.min(1, (wrap.current.clientWidth - 2) / scene.w, (window.innerHeight * 0.72) / scene.h));
    fit(); const ro = new ResizeObserver(fit); ro.observe(wrap.current); return () => ro.disconnect();
  }, [scene?.w, scene?.h]);
  const update = useCallback((fn, opts) => { h.set(fn, opts); setDirty(true); }, [h]);
  const el = scene?.elements.find(e => e.id === sel) || null;
  const patchEl = (id, patch, opts) => update(p => {
    const isExtra = p.extra.some(x => x.id === id);
    if (isExtra && patch.text != null) return { ...p, extra: p.extra.map(x => (x.id === id ? { ...x, ...patch } : x)) };
    return { ...p, overrides: { ...p.overrides, [id]: { ...(p.overrides[id] || {}), ...patch } } };
  }, opts);
  const setData = patch => update(p => ({ ...p, data: { ...p.data, ...patch } }));
  // Keyboard: undo/redo, delete, nudge.
  useEffect(() => {
    const k = e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? h.redo() : h.undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); h.redo(); }
      else if (sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeEl(sel); }
      else if (sel && el && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; patchEl(sel, { x: el.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0), y: el.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0) }); }
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  if (!can(user, 'editor')) return <Empty title="Graphics Studio is for editors" />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!project || !scene) return <Loading />;

  function removeEl(id) {
    update(p => (p.extra.some(x => x.id === id) ? { ...p, extra: p.extra.filter(x => x.id !== id) } : { ...p, removed: [...new Set([...p.removed, id])] }));
    setSel(null);
  }
  const addEl = kind => {
    const W = scene.w, H = scene.h;
    const base = { id: uid(), x: W * 0.3, y: H * 0.4, w: W * 0.4, h: H * 0.12 };
    const els = {
      text: [{ ...base, type: 'text', text: 'NEW TEXT', font: 'display', weight: 800, size: H * 0.08, color: '#ffffff', fit: true, upper: true }],
      shape: [{ ...base, type: 'rect', fill: '#ff5a1f', radius: 12 }],
      line: [{ ...base, h: 0, type: 'line', color: '#ff5a1f', width: 4 }],
      badge: (() => { const b = uid(); return [{ ...base, id: b, w: W * 0.22, h: H * 0.06, type: 'rect', fill: project.theme?.accent || '#ff5a1f', radius: H * 0.03 }, { ...base, id: uid(), x: base.x + W * 0.015, w: W * 0.19, h: H * 0.06, type: 'text', text: 'RECORD', font: 'display', weight: 800, size: H * 0.035, color: '#0a0a0b', fit: true, upper: true, valign: 'middle', align: 'center' }]; })(),
      image: [{ ...base, h: H * 0.3, type: 'image', src: '', fit: 'contain', anchor: 'bottom' }],
    }[kind];
    update(p => ({ ...p, extra: [...p.extra, ...els] }));
    setSel(els.at(-1).id);
  };
  const moveLayer = (id, dir) => update(p => {
    const ids = scene.elements.map(e => e.id);
    const i = ids.indexOf(id), j = Math.max(0, Math.min(ids.length - 1, i + dir));
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return { ...p, order: ids };
  });
  const duplicateEl = id => {
    const src = scene.elements.find(e => e.id === id); if (!src) return;
    const copy = { ...src, id: uid(), x: src.x + 20, y: src.y + 20, bind: undefined };
    update(p => ({ ...p, extra: [...p.extra, copy] })); setSel(copy.id);
  };
  const setFormat = f => update(p => ({ ...p, format: f, size: sizeOf(f, p.size), overrides: Object.fromEntries(Object.entries(p.overrides).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !['x', 'y', 'w', 'h'].includes(kk)))])) }));

  // Pointer interaction on the canvas overlay.
  const onPointerDown = (e, mode = 'move') => {
    const target = mode === 'pick' ? e.target.closest('[data-id]')?.getAttribute('data-id') : sel;
    if (mode === 'pick') { setSel(target || null); if (!target) return; }
    const id = target || sel; const start = scene.elements.find(x => x.id === id); if (!start) return;
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    h.checkpoint();
    const others = scene.elements.filter(x => x.id !== id && !x.hidden && x.w > 0);
    const xs = [0, scene.w / 2, scene.w, ...others.flatMap(o => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, scene.h / 2, scene.h, ...others.flatMap(o => [o.y, o.y + o.h / 2, o.y + o.h])];
    const move = ev => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      const g = [];
      if (mode === 'resize') {
        let w = Math.max(10, start.w + dx), hh = Math.max(start.type === 'line' ? 0 : 10, start.h + dy);
        if (ev.shiftKey && start.w && start.h) hh = w * (start.h / start.w);
        const r = start.x + w, b = start.y + hh;
        const sxv = xs.find(v => Math.abs(v - r) < SNAP / scale); if (sxv != null) { w = sxv - start.x; g.push({ x: sxv }); }
        const syv = ys.find(v => Math.abs(v - b) < SNAP / scale); if (syv != null) { hh = syv - start.y; g.push({ y: syv }); }
        patchEl(id, { w: Math.round(w), h: Math.round(hh) }, { merge: true });
      } else {
        let x = start.x + dx, y = start.y + dy;
        for (const [edge, off] of [[x, 0], [x + start.w / 2, start.w / 2], [x + start.w, start.w]]) { const v = xs.find(t => Math.abs(t - edge) < SNAP / scale); if (v != null) { x = v - off; g.push({ x: v }); break; } }
        for (const [edge, off] of [[y, 0], [y + start.h / 2, start.h / 2], [y + start.h, start.h]]) { const v = ys.find(t => Math.abs(t - edge) < SNAP / scale); if (v != null) { y = v - off; g.push({ y: v }); break; } }
        patchEl(id, { x: Math.round(x), y: Math.round(y) }, { merge: true });
      }
      setGuides(g);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides([]); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const save = async () => { setSaving(true); try { await post('graphics', 'save', { id, project, title }); setDirty(false); setMsg('Saved'); } catch (x) { setMsg(x.message); } finally { setSaving(false); } };
  const exportAs = async (type, how) => {
    setMsg('Rendering…');
    try {
      const blob = await rasterize(scene, { type: type === 'jpeg' ? 'image/jpeg' : 'image/png' });
      const name = `around-the-nba-${(title || 'graphic').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.${type === 'jpeg' ? 'jpg' : 'png'}`;
      if (how === 'share') { const r = await share(blob, name, [project.data.headline, project.data.note].filter(Boolean).join(' — ')); setMsg(r === 'copied' ? 'Image copied' : r === 'shared' ? 'Shared' : 'Downloaded'); }
      else { download(blob, name); setMsg('Downloaded'); }
    } catch (x) { setMsg(x.message); }
  };
  const dup = async () => { const r = await post('graphics', 'duplicate', { id }); go(`/studio/${r.id}`); };
  const saveTemplate = async () => { const name = prompt('Name this design'); if (name) { await post('graphics', 'template', { name, project }); setMsg('Design saved'); } };
  const del = async () => { if (confirm('Delete this graphic?')) { await post('graphics', 'remove', { id }); go('/studio'); } };

  const d = project.data || {};
  return (
    <div className="editor">
      <div className="editor-bar">
        <Link to="/studio" className="btn ghost small">← Library</Link>
        <input className="title-input" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} aria-label="Title" />
        <span className="grow" />
        <button className="btn ghost small" onClick={h.undo} disabled={!h.canUndo} title="Undo (Ctrl/⌘Z)">Undo</button>
        <button className="btn ghost small" onClick={h.redo} disabled={!h.canRedo} title="Redo (Ctrl/⌘⇧Z)">Redo</button>
        <button className={`btn ghost small ${preview ? 'on' : ''}`} onClick={() => { setPreview(p => !p); setSel(null); }}>{preview ? 'Edit' : 'Preview'}</button>
        <button className="btn small" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        <div className="menu-group">
          <button className="btn small" onClick={() => exportAs('png')}>PNG</button>
          <button className="btn small" onClick={() => exportAs('jpeg')}>JPEG</button>
          <button className="btn small" onClick={() => exportAs('png', 'share')}>Share</button>
        </div>
      </div>
      {msg && <p className="muted small editor-msg" onAnimationEnd={() => setMsg(null)}>{msg}</p>}
      {data.verification?.status && <p className="muted small">Data: {data.verification.status}{data.feed ? <> · from <Link to={`/e/${encodeURIComponent(data.feedId)}`}>{data.feed.headline}</Link></> : ''}</p>}
      <div className="editor-grid">
        <div className="canvas-wrap" ref={wrap}>
          <div className="canvas" style={{ width: scene.w * scale, height: scene.h * scale }}>
            <div className="canvas-svg" style={{ transform: `scale(${scale})`, width: scene.w, height: scene.h }} dangerouslySetInnerHTML={{ __html: svg }} onPointerDown={preview ? undefined : e => onPointerDown(e, 'pick')} />
            {!preview && el && (
              <div className="sel-box" style={{ left: el.x * scale, top: el.y * scale, width: Math.max(6, el.w * scale), height: Math.max(6, el.h * scale) }} onPointerDown={e => onPointerDown(e, 'move')}>
                <span className="handle br" onPointerDown={e => { e.stopPropagation(); onPointerDown(e, 'resize'); }} />
              </div>
            )}
            {guides.map((g, i) => <span key={i} className={`guide ${g.x != null ? 'v' : 'h'}`} style={g.x != null ? { left: g.x * scale } : { top: g.y * scale }} />)}
          </div>
          <p className="muted small">{scene.w} × {scene.h} · Click an element to select it; drag to move (snaps to edges and centers), drag the corner to resize (Shift keeps proportions), arrow keys nudge.</p>
        </div>
        <aside className="inspector">
          {el ? (
            <ElementPanel el={el} onPatch={(p, o) => patchEl(el.id, p, o)} onRemove={() => removeEl(el.id)} onDuplicate={() => duplicateEl(el.id)} onLayer={dir => moveLayer(el.id, dir)} onClose={() => setSel(null)} />
          ) : (
            <>
              <h4>Layout</h4>
              <label className="field"><span>Template</span><select value={project.template} onChange={e => update(p => ({ ...p, template: e.target.value, overrides: {}, removed: [], order: [] }))}>{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="field"><span>Size</span><select value={project.format} onChange={e => setFormat(e.target.value)}>{Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label} · {f.w}×{f.h}</option>)}<option value="custom">Custom…</option></select></label>
              {project.format === 'custom' && <div className="two"><input type="number" min="320" max="4096" value={project.size.w} onChange={e => update(p => ({ ...p, size: sizeOf('custom', { ...p.size, w: +e.target.value }) }))} aria-label="Width" /><input type="number" min="320" max="4096" value={project.size.h} onChange={e => update(p => ({ ...p, size: sizeOf('custom', { ...p.size, h: +e.target.value }) }))} aria-label="Height" /></div>}
              <h4>Words</h4>
              <label className="field"><span>Label</span><input value={d.kicker || ''} onChange={e => setData({ kicker: e.target.value })} /></label>
              <label className="field"><span>Headline</span><input value={d.headline || ''} onChange={e => setData({ headline: e.target.value })} /></label>
              <label className="field"><span>Text</span><textarea rows={3} value={d.note || ''} onChange={e => setData({ note: e.target.value })} /></label>
              <label className="field"><span>Source line</span><input value={d.source || ''} onChange={e => setData({ source: e.target.value })} /></label>
              <StatsEditor stats={d.stats || []} onChange={stats => setData({ stats, statKeys: stats.map(s => s.key), values: Object.fromEntries(stats.map(s => [s.key, s.value])), statKeysLocked: true })} />
              <h4>Look</h4>
              <label className="field color"><span>Accent</span><input type="color" value={project.theme?.accent || '#ff5a1f'} onChange={e => update(p => ({ ...p, theme: { ...p.theme, accent: e.target.value } }), { merge: true })} onBlur={() => h.checkpoint()} /></label>
              <label className="field"><span>Texture</span><select value={project.theme?.pattern ?? 'halftone'} onChange={e => update(p => ({ ...p, theme: { ...p.theme, pattern: e.target.value } }))}><option value="halftone">Halftone dots</option><option value="diagonal">Diagonal lines</option><option value="stripes">Stripes</option><option value="grid">Grid</option><option value="none">None</option></select></label>
              <label className="check"><input type="checkbox" checked={project.theme?.useTeam !== false} onChange={e => update(p => ({ ...p, theme: { ...p.theme, useTeam: e.target.checked } }))} /> Team colors</label>
              <label className="check"><input type="checkbox" checked={project.theme?.grain !== false} onChange={e => update(p => ({ ...p, theme: { ...p.theme, grain: e.target.checked } }))} /> Film grain</label>
              {d.player && <ImageField label="Player image" value={d.player.headshot} onChange={src => setData({ player: { ...d.player, headshot: src } })} />}
              <h4>Add</h4>
              <div className="add-row">{['text', 'badge', 'shape', 'line', 'image'].map(k => <button key={k} type="button" className="btn ghost small" onClick={() => addEl(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
              <h4>Graphic</h4>
              <div className="add-row"><button className="btn ghost small" onClick={dup}>Duplicate</button><button className="btn ghost small" onClick={saveTemplate}>Save design</button><button className="btn ghost small" onClick={() => { update(p => ({ ...p, overrides: {}, removed: [], extra: [], order: [] })); }}>Reset layout</button><button className="btn ghost small danger" onClick={del}>Delete</button></div>
              <Layers scene={scene} onPick={setSel} removed={project.removed} onRestore={id => update(p => ({ ...p, removed: p.removed.filter(x => x !== id) }))} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatsEditor({ stats, onChange }) {
  const set = (i, patch) => onChange(stats.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, dir) => { const n = stats.slice(); const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="stats-editor">
      <h4>Statistics</h4>
      {stats.map((s, i) => (
        <div key={i} className="stat-row">
          <input value={s.value} onChange={e => set(i, { value: e.target.value })} aria-label="Value" />
          <input value={s.label} onChange={e => set(i, { label: e.target.value.toUpperCase() })} aria-label="Label" />
          <button type="button" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
          <button type="button" onClick={() => onChange(stats.filter((_, j) => j !== i))} aria-label="Remove">×</button>
        </div>
      ))}
      {stats.length < 6 && <button type="button" className="btn ghost small" onClick={() => onChange([...stats, { key: `s${Date.now()}`, label: 'LABEL', value: '0' }])}>+ Add a statistic</button>}
      <p className="muted small">Numbers come from the event's data; edits here are yours to stand behind.</p>
    </div>
  );
}

function ImageField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const upload = async file => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const r = await post('graphics', 'upload', { data: dataUrl, name: file.name });
      onChange(r.url);
    } catch (x) { alert(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <span>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Image URL" />
      <label className="btn ghost small file">{busy ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0])} hidden /></label>
    </div>
  );
}

function ElementPanel({ el, onPatch, onRemove, onDuplicate, onLayer, onClose }) {
  const num = (k, label, step = 1) => <label className="field num"><span>{label}</span><input type="number" step={step} value={Math.round((el[k] ?? 0) * 100) / 100} onChange={e => onPatch({ [k]: +e.target.value })} /></label>;
  return (
    <div>
      <div className="insp-head"><h4>{el.type === 'text' ? 'Text' : el.type === 'image' ? 'Image' : el.type === 'line' ? 'Line' : 'Shape'} <span className="muted small">{el.id}</span></h4><button className="linklike" onClick={onClose}>Done</button></div>
      {el.type === 'text' && (
        <>
          <label className="field"><span>Text{el.bind ? <small className="muted"> · from the data until you edit it</small> : null}</span><textarea rows={3} value={el.text ?? ''} onChange={e => onPatch({ text: e.target.value })} /></label>
          <div className="two">{num('size', 'Size')}<label className="field"><span>Weight</span><select value={el.weight || 800} onChange={e => onPatch({ weight: +e.target.value })}>{[400, 600, 700, 800, 900].map(w => <option key={w}>{w}</option>)}</select></label></div>
          <div className="two"><label className="field"><span>Font</span><select value={el.font || 'display'} onChange={e => onPatch({ font: e.target.value })}><option value="display">Barlow Condensed</option><option value="sans">Inter</option></select></label>
            <label className="field"><span>Align</span><select value={el.align || 'left'} onChange={e => onPatch({ align: e.target.value })}><option>left</option><option>center</option><option>right</option></select></label></div>
          <label className="field color"><span>Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(el.color) ? el.color : '#ffffff'} onChange={e => onPatch({ color: e.target.value })} /></label>
          <div className="two">{num('spacing', 'Letter spacing', 0.5)}<label className="field num"><span>Line height</span><input type="number" step="0.05" value={el.lineHeight || (el.font === 'sans' ? 1.2 : 0.92)} onChange={e => onPatch({ lineHeight: +e.target.value })} /></label></div>
          <label className="check"><input type="checkbox" checked={!!el.upper} onChange={e => onPatch({ upper: e.target.checked })} /> Capitals</label>
          <label className="check"><input type="checkbox" checked={!!el.wrap} onChange={e => onPatch({ wrap: e.target.checked })} /> Wrap lines</label>
          <label className="check"><input type="checkbox" checked={el.fit !== false} onChange={e => onPatch({ fit: e.target.checked })} /> Shrink to fit the box</label>
        </>
      )}
      {(el.type === 'rect' || el.type === 'circle') && (
        <>
          <label className="field color"><span>Fill</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(el.fill) ? el.fill : '#ff5a1f'} onChange={e => onPatch({ fill: e.target.value, gradient: undefined })} /></label>
          {el.type === 'rect' && num('radius', 'Corner radius')}
          <label className="field color"><span>Border</span><input type="color" value={el.stroke || '#ffffff'} onChange={e => onPatch({ stroke: e.target.value, strokeWidth: el.strokeWidth || 3 })} /></label>
          {el.stroke && <button className="linklike small" onClick={() => onPatch({ stroke: undefined })}>Remove border</button>}
        </>
      )}
      {el.type === 'line' && <><label className="field color"><span>Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(el.color) ? el.color : '#ffffff'} onChange={e => onPatch({ color: e.target.value })} /></label>{num('width', 'Thickness')}</>}
      {el.type === 'image' && (
        <>
          <ImageField label="Image" value={el.src} onChange={src => onPatch({ src })} />
          <div className="two"><label className="field"><span>Fit</span><select value={el.fit || 'cover'} onChange={e => onPatch({ fit: e.target.value })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
            <label className="field"><span>Effect</span><select value={el.filter || 'none'} onChange={e => onPatch({ filter: e.target.value })}><option value="none">None</option><option value="grayscale">Black & white</option><option value="duotone">Duotone</option></select></label></div>
          <label className="check"><input type="checkbox" checked={!!el.circle} onChange={e => onPatch({ circle: e.target.checked })} /> Circle crop</label>
          <label className="check"><input type="checkbox" checked={el.fade && el.fade !== 'none'} onChange={e => onPatch({ fade: e.target.checked ? 'bottom' : 'none' })} /> Fade bottom</label>
        </>
      )}
      <h4>Position</h4>
      <div className="two">{num('x', 'X')}{num('y', 'Y')}</div>
      <div className="two">{num('w', 'Width')}{num('h', 'Height')}</div>
      <div className="two">{num('rot', 'Rotation°')}<label className="field num"><span>Opacity</span><input type="number" min="0" max="1" step="0.05" value={el.opacity ?? 1} onChange={e => onPatch({ opacity: +e.target.value })} /></label></div>
      <label className="check"><input type="checkbox" checked={!!el.shadow} onChange={e => onPatch({ shadow: e.target.checked ? { x: 0, y: 8, blur: 24, color: '#000000', opacity: 0.55 } : null })} /> Shadow</label>
      <label className="check"><input type="checkbox" checked={!!el.glow} onChange={e => onPatch({ glow: e.target.checked ? { blur: 20, color: '#ff5a1f', opacity: 0.8 } : null })} /> Glow</label>
      <div className="add-row">
        <button className="btn ghost small" onClick={() => onLayer(1)}>Bring forward</button><button className="btn ghost small" onClick={() => onLayer(-1)}>Send back</button>
        <button className="btn ghost small" onClick={onDuplicate}>Duplicate</button><button className="btn ghost small danger" onClick={onRemove}>Delete</button>
      </div>
    </div>
  );
}

function Layers({ scene, onPick, removed, onRestore }) {
  return (
    <details className="layers">
      <summary>Layers ({scene.elements.length})</summary>
      <ul>{[...scene.elements].reverse().map(e => <li key={e.id}><button type="button" className="linklike" onClick={() => onPick(e.id)}>{e.type} · {e.id}{e.type === 'text' && e.text ? ` — ${String(e.text).slice(0, 24)}` : ''}</button></li>)}</ul>
      {removed.length > 0 && <><p className="muted small">Removed</p><ul>{removed.map(id => <li key={id}><button type="button" className="linklike" onClick={() => onRestore(id)}>Restore {id}</button></li>)}</ul></>}
    </details>
  );
}
