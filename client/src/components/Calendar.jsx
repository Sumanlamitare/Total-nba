import { useEffect, useRef, useState } from 'react';
import { MO, key } from '../util.js';

const FIRST_YEAR = 1993; // ESPN has player box scores from the 1993-94 season on

// Month grid with month and year pickers. Days already saved are bright; others are dimmed but still
// pickable (they're pulled live).
export default function Calendar({ date, has, onPick }) {
  const [m, setM] = useState(new Date(date.getFullYear(), date.getMonth(), 1));
  const [mode, setMode] = useState('days'); // days | months | years
  const years = useRef(null);
  const lastYear = new Date().getFullYear();
  useEffect(() => { if (mode === 'years') years.current?.querySelector('.li.a')?.scrollIntoView({ block: 'center' }); }, [mode]);
  const stop = fn => e => { e.stopPropagation(); fn(); };
  const nav = x => stop(() => setM(new Date(m.getFullYear(), m.getMonth() + x, 1)));

  let body;
  if (mode === 'years') {
    body = (
      <div className="slist years" ref={years} role="listbox">
        {Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => lastYear - i).map(y => (
          <button key={y} role="option" aria-selected={y === m.getFullYear()} className={'li' + (y === m.getFullYear() ? ' a' : '')}
            onClick={stop(() => { setM(new Date(y, m.getMonth(), 1)); setMode('days'); })}>
            <span className="li-main">{y}</span>
          </button>
        ))}
      </div>
    );
  } else if (mode === 'months') {
    body = (
      <div className="mgrid">
        {MO.map((name, i) => (
          <button key={name} className={'mo' + (i === m.getMonth() ? ' a' : '')} style={{ '--i': i }}
            onClick={stop(() => { setM(new Date(m.getFullYear(), i, 1)); setMode('days'); })}>{name.slice(0, 3)}</button>
        ))}
      </div>
    );
  } else {
    const lead = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(<span key={'b' + i} />);
    for (let d = 1; d <= days; d++) {
      const dt = new Date(m.getFullYear(), m.getMonth(), d);
      const cls = 'd' + (key(dt) === key(date) ? ' a' : '') + (has.has(key(dt)) ? '' : ' no');
      cells.push(<button key={d} className={cls} onClick={stop(() => onPick(dt))}>{d}</button>);
    }
    body = (
      <>
        <div className="wd">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="gr">{cells}</div>
      </>
    );
  }

  return (
    <div className="cal" onClick={e => e.stopPropagation()}>
      <div className="hd">
        <button className="ib" aria-label="Previous month" onClick={nav(-1)} disabled={mode !== 'days'}>‹</button>
        <div className="my">
          <button className={'pick' + (mode === 'months' ? ' on' : '')} onClick={stop(() => setMode(mode === 'months' ? 'days' : 'months'))}>{MO[m.getMonth()]}<span className="chev">⌄</span></button>
          <button className={'pick' + (mode === 'years' ? ' on' : '')} onClick={stop(() => setMode(mode === 'years' ? 'days' : 'years'))}>{m.getFullYear()}<span className="chev">⌄</span></button>
        </div>
        <button className="ib" aria-label="Next month" onClick={nav(1)} disabled={mode !== 'days'}>›</button>
      </div>
      {body}
    </div>
  );
}
