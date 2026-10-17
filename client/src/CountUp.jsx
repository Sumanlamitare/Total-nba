// A number that counts up the first time its page comes into view (Motion's animate), then stays put: a page is
// rendered again while it turns, and the count shouldn't replay mid-turn. Screen readers get the final value.
import React, { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

const counted = new Set();

export default function CountUp({ id, value, format = v => String(Math.round(v)) }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const done = counted.has(id) || reduce || value == null;
  const [v, setV] = useState(done ? value : 0);
  useEffect(() => {
    if (done) { setV(value); return; }
    if (!inView) return;
    counted.add(id);
    const c = animate(0, value, { duration: 1.2, ease: [0.2, 0.7, 0.2, 1], onUpdate: setV });
    return () => c.stop();
  }, [inView, value, done, id]);
  return (
    <span ref={ref} className="count-up">
      <span aria-hidden>{value == null ? '—' : format(v)}</span>
      <span className="sr-only">{value == null ? 'not on record' : format(value)}</span>
    </span>
  );
}
