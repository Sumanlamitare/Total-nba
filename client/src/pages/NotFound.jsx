import { Link, Logo } from '../ui.jsx';

export default function NotFound({ inApp }) {
  return (
    <div className={inApp ? 'page' : 'authpage'}>
      <div className={inApp ? '' : 'authcard'}>
        {!inApp && <Logo />}
        <h1>Nothing here</h1>
        <p className="muted">This page flew off into the night.</p>
        <Link to={inApp ? '/app' : '/'} className="btn primary">{inApp ? 'Back to checks' : 'Go home'}</Link>
      </div>
    </div>
  );
}
