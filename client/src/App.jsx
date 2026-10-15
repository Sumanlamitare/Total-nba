import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { usePath, ToastHost, Spinner, Redirect, Logo, Link, Avatar } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Join from './pages/Join.jsx';
import Home from './pages/Home.jsx';
import Group from './pages/Group.jsx';
import Game from './pages/Game.jsx';
import Account from './pages/Account.jsx';
import { Terms, Privacy, Support } from './pages/Legal.jsx';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);
const ID = '([a-f0-9]{24})';

function Shell({ children }) {
  const { user } = useUser();
  return (
    <div className="shell">
      <header className="appbar">
        <div className="wrap">
          <Logo to="/home" />
          <Link to="/account" className="me" aria-label="Your account"><span className="hide-xs">{user.name}</span><Avatar name={user.name} size={32} /></Link>
        </div>
      </header>
      <main className="wrap appmain">{children}</main>
    </div>
  );
}

export default function App() {
  const path = usePath();
  const [user, setUser] = useState(undefined); // undefined while we check the session
  useEffect(() => { api('auth').then(r => setUser(r.user), () => setUser(null)); }, []);

  let page, m;
  const needsUser = el => (user === undefined ? <Spinner /> : user ? <Shell>{el}</Shell> : <Redirect to={'/login?next=' + encodeURIComponent(location.pathname)} />);
  if (path === '/') page = user ? <Redirect to="/home" /> : user === null ? <Landing /> : <Spinner />;
  else if (path === '/login' || path === '/signup') page = <Auth mode={path.slice(1)} key={path} />;
  else if ((m = path.match(/^\/join\/([A-Za-z0-9]{4,20})$/))) page = <Join code={m[1]} />;
  else if (path === '/home') page = needsUser(<Home />);
  else if ((m = path.match(new RegExp(`^/g/${ID}$`)))) page = needsUser(<Group id={m[1]} key={m[1]} />);
  else if ((m = path.match(new RegExp(`^/game/${ID}$`)))) page = needsUser(<Game id={m[1]} key={m[1]} />);
  else if (path === '/account') page = needsUser(<Account />);
  else if (path === '/terms') page = <Terms />;
  else if (path === '/privacy') page = <Privacy />;
  else if (path === '/support') page = <Support />;
  else page = (
    <div className="center-page"><div className="card narrow"><Logo /><h1>Out of bounds</h1><p className="muted">That page doesn't exist.</p><Link to="/" className="btn primary">Go home</Link></div></div>
  );

  return <UserCtx.Provider value={{ user, setUser }}><ToastHost>{page}</ToastHost></UserCtx.Provider>;
}
