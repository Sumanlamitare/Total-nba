import React, { useState } from 'react';

export function Crest({ src, name, size = 28 }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="crest blank" style={{ width: size, height: size }} aria-hidden="true">{(name || '?').slice(0, 1)}</span>;
  return <img className="crest" src={src} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} />;
}

// Match status chip. Keys: scheduled, live, halftime, ft, generated, review, failed, off.
export const Status = ({ stage, clock }) => (
  <span className={`status s-${stage.key}`}>{stage.key === 'live' ? <><i className="pulse" />{clock || 'Live'}</> : stage.label}</span>
);

export const Empty = ({ title, children }) => <div className="empty"><h2>{title}</h2>{children && <p>{children}</p>}</div>;
export const ErrorBox = ({ error, retry }) => <div className="empty error"><h2>Couldn't load this</h2><p>{error?.message || String(error)}</p>{retry && <button type="button" onClick={() => retry()}>Try again</button>}</div>;
export const Loading = ({ label = 'Loading' }) => <div className="loading" role="status"><span className="spinner" />{label}…</div>;

export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-bg" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const score = m => (m.score?.home == null ? null : `${m.score.home}–${m.score.away}`);
