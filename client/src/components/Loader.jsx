// Splash: a ball drops and bounces, the wordmark punches in letter by letter, then everything lifts away
export default function Loader({ gone }) {
  return (
    <div id="splash" className={gone ? 'gone' : ''} aria-hidden={gone}>
      <div className="sp-ball"><span className="ball big" /><span className="sp-shadow" /></div>
      <div className="sp-word">
        {[...'TOTAL'].map((ch, i) => <span key={i} style={{ '--i': i }}>{ch}</span>)}
        {[...'NBA'].map((ch, i) => <b key={i} style={{ '--i': i + 5 }}>{ch}</b>)}
      </div>
      <div className="sp-sub">EVERY PLAYER · EVERY NIGHT · SINCE 1993</div>
    </div>
  );
}
