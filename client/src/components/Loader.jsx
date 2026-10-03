import { useEffect, useState } from 'react';

const TILT = [-6, 5, -4, 7, -5, 4, -7, 6];

export default function Loader({ gone }) {
  const [w, setW] = useState(0);
  const [text, setText] = useState('LOADING TODAY’S PERFORMANCES');
  useEffect(() => {
    const a = setTimeout(() => setW(220), 60), b = setTimeout(() => setText('GETTING READY'), 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <div id="loader" className={gone ? 'gone' : ''}>
      <div className="wm">
        {[...'TOTALNBA'].map((c, i) => {
          const Tag = i < 5 ? 'span' : 'b';
          return <Tag key={i} className="l" style={{ '--i': i, '--r': TILT[i] + 'deg' }}>{c}</Tag>;
        })}
      </div>
      <div id="lt">{text}</div>
      <div className="bar"><i style={{ width: w }} /></div>
    </div>
  );
}
