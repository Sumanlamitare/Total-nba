import { useState } from 'react';
import { MO, key } from '../util.js';

// Month grid; days already saved are bright, others dimmed (still pickable: they're pulled live)
export default function Calendar({ date, has, onPick }) {
  const [m, setM] = useState(new Date(date.getFullYear(), date.getMonth(), 1));
  const lead = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const nav = x => e => { e.stopPropagation(); setM(new Date(m.getFullYear(), m.getMonth() + x, 1)); };
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={'b' + i} />);
  for (let d = 1; d <= days; d++) {
    const dt = new Date(m.getFullYear(), m.getMonth(), d);
    const cls = 'd' + (key(dt) === key(date) ? ' a' : '') + (has.has(key(dt)) ? '' : ' no');
    cells.push(<button key={d} className={cls} onClick={e => { e.stopPropagation(); onPick(dt); }}>{d}</button>);
  }
  return (
    <div className="sheet cal" onClick={e => e.stopPropagation()}>
      <div className="hd">
        <button className="ib" aria-label="Previous month" onClick={nav(-1)}>‹</button><span>{MO[m.getMonth()]} {m.getFullYear()}</span><button className="ib" aria-label="Next month" onClick={nav(1)}>›</button>
      </div>
      <div className="gr">{cells}</div>
    </div>
  );
}
