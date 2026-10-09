import { useEffect, useRef } from 'react';

// Scrollable picker list (stats, seasons, years). Opens scrolled to the current choice.
export default function ListSheet({ title, items, current, onPick, className = '' }) {
  const list = useRef(null);
  useEffect(() => {
    const el = list.current?.querySelector('.li.a');
    if (el) el.scrollIntoView({ block: 'center' });
  }, [current]);
  return (
    <div className={'lsheet ' + className} onClick={e => e.stopPropagation()}>
      {title && <h3>{title}</h3>}
      <div className="slist" ref={list} role="listbox">
        {items.map((it, i) => (
          <button key={it.key} role="option" aria-selected={it.key === current} style={{ '--i': Math.min(i, 12) }}
            className={'li' + (it.key === current ? ' a' : '')} onClick={() => onPick(it.key)}>
            <span className="li-main">{it.label}</span>
            {it.sub && <span className="li-sub">{it.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
