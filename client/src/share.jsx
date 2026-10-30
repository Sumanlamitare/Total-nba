// Share and export: a live preview of the standalone graphic at the chosen size, then PNG (and high resolution), SVG,
// PDF, the clipboard, or a link. The link saves the diagram on the server (so it has a permanent address and a preview
// card), or reuses the stored one.
import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATS, standaloneSvg, svgToPng, pngToPdf, download, copyImage } from './export.js';
import { saveDiagram } from './api.js';

const slug = s => String(s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function ShareButton(props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="btn primary" onClick={() => setOpen(true)}>Share</button>
    {open && <ShareModal {...props} onClose={() => setOpen(false)} />}
  </>;
}

function ShareModal({ result, criteria, style, config, title, subtitle, storedId, onClose }) {
  const [format, setFormat] = useState('square');
  const [custom, setCustom] = useState({ width: 1600, height: 1200 });
  const [frame, setFrame] = useState({ title, subtitle: subtitle || '', brand: true, attribution: 'Data: ESPN · Overlap', legend: null });
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const size = format === 'custom' ? custom : FORMATS[format];
  const name = `${slug(frame.title)}-${format}`;
  const make = useMemo(() => () => standaloneSvg(result, criteria, style, { ...frame, width: size.width, height: size.height }), [result, criteria, style, frame, size.width, size.height]);
  useEffect(() => { let alive = true; setSvg(''); make().then(s => alive && setSvg(s)).catch(e => alive && setNote(e.message)); return () => { alive = false; }; }, [make]);
  const run = async (label, fn) => { setBusy(label); setNote(''); try { await fn(); } catch (e) { setNote(e.message || 'That did not work'); } finally { setBusy(''); } };

  const shareLink = () => run('link', async () => {
    let id = storedId;
    if (!id) id = (await saveDiagram({ ...config, criteria: criteria.map(({ stat, op, value }) => ({ stat, op, value })) }, style)).id;
    const url = `${location.origin}/d/${id}`;
    setLink(url);
    try { await navigator.clipboard.writeText(url); setNote('Link copied'); } catch { setNote('Link ready below'); }
  });
  const nativeShare = () => run('share', async () => {
    const png = await svgToPng(svg || await make(), size.width, size.height, 1);
    const file = new File([png], `${name}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: frame.title });
    else { download(png, `${name}.png`); setNote('Saved — your browser cannot share files directly'); }
  });

  return (
    createPortal(<div className="modal-back" onClick={onClose}>
      <div className="modal share-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Share and export">
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        <div className="share-grid">
          <div className="preview" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            {svg ? <img alt="The graphic" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} /> : <span className="spinner" />}
          </div>
          <div className="share-controls">
            <h3>Share</h3>
            <label className="field">Format<select value={format} onChange={e => setFormat(e.target.value)}>{Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></label>
            {format === 'custom' && <div className="field-row">
              <label className="field">Width<input type="number" min="400" max="4000" value={custom.width} onChange={e => setCustom({ ...custom, width: Math.max(400, Math.min(4000, +e.target.value || 400)) })} /></label>
              <label className="field">Height<input type="number" min="400" max="4000" value={custom.height} onChange={e => setCustom({ ...custom, height: Math.max(400, Math.min(4000, +e.target.value || 400)) })} /></label>
            </div>}
            <label className="field">Title<input value={frame.title} onChange={e => setFrame({ ...frame, title: e.target.value })} /></label>
            <label className="field">Subtitle<input value={frame.subtitle} onChange={e => setFrame({ ...frame, subtitle: e.target.value })} /></label>
            <label className="field">Attribution<input value={frame.attribution} onChange={e => setFrame({ ...frame, attribution: e.target.value })} /></label>
            <div className="toggles">
              <label><input type="checkbox" checked={frame.brand} onChange={e => setFrame({ ...frame, brand: e.target.checked })} /> Logo</label>
              <label><input type="checkbox" checked={!!frame.legend} onChange={e => setFrame({ ...frame, legend: e.target.checked })} /> Criteria legend</label>
            </div>
            <div className="export-buttons">
              <button type="button" className="btn primary" disabled={!!busy} onClick={nativeShare}>{busy === 'share' ? 'Preparing…' : 'Share image…'}</button>
              <button type="button" className="btn" disabled={!!busy || !svg} onClick={() => run('png', async () => download(await svgToPng(svg, size.width, size.height, 1), `${name}.png`))}>PNG</button>
              <button type="button" className="btn" disabled={!!busy || !svg} onClick={() => run('png2', async () => download(await svgToPng(svg, size.width, size.height, 3), `${name}@3x.png`))}>PNG high-res (3×)</button>
              <button type="button" className="btn" disabled={!!busy || !svg} onClick={() => download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>SVG</button>
              <button type="button" className="btn" disabled={!!busy || !svg} onClick={() => run('pdf', async () => download(await pngToPdf(svg, size.width, size.height), `${name}.pdf`))}>PDF</button>
              <button type="button" className="btn" disabled={!!busy} onClick={() => run('copy', async () => { await copyImage(svg ? Promise.resolve(svg) : make(), size.width, size.height); setNote('Image copied — paste it into your post'); })}>Copy image</button>
              <button type="button" className="btn" disabled={!!busy} onClick={shareLink}>{busy === 'link' ? 'Saving…' : 'Copy link'}</button>
            </div>
            {link && <input className="link-out" readOnly value={link} onFocus={e => e.target.select()} />}
            {note && <p className="note-line">{note}</p>}
            <p className="hint">The export is the diagram itself, drawn fresh at {size.width} × {size.height} with every headshot embedded, not a screenshot of the page.</p>
          </div>
        </div>
      </div>
    </div>, document.body)
  );
}
