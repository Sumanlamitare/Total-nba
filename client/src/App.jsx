import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { usePath, ToastHost, Spinner, Redirect } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import Docs from './pages/Docs.jsx';
import Auth from './pages/Auth.jsx';
import Shell from './pages/Shell.jsx';
import Checks from './pages/Checks.jsx';
import CheckDetail from './pages/CheckDetail.jsx';
import Alerts from './pages/Alerts.jsx';
import StatusSettings from './pages/StatusSettings.jsx';
import Settings from './pages/Settings.jsx';
import StatusPage from './pages/StatusPage.jsx';
import NotFound from './pages/NotFound.jsx';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);

export default function App() {
  const path = usePath();
  const [user, setUser] = useState(undefined); // undefined = still checking
  useEffect(() => { api('auth').then(r => setUser(r.user), () => setUser(null)); }, []);

  let page;
  const inApp = path === '/app' || path.startsWith('/app/');
  if (inApp) {
    if (user === undefined) page = <Spinner />;
    else if (!user) page = <Redirect to={'/login?next=' + encodeURIComponent(path)} />;
    else {
      const m = path.match(/^\/app\/checks\/([a-f0-9]{24})$/);
      const inner = m ? <CheckDetail id={m[1]} key={m[1]} />
        : path === '/app' || path === '/app/' ? <Checks />
        : path === '/app/alerts' ? <Alerts />
        : path === '/app/status-page' ? <StatusSettings />
        : path === '/app/settings' ? <Settings />
        : <NotFound inApp />;
      page = <Shell path={path}>{inner}</Shell>;
    }
  } else if (path === '/' || path === '/pricing') page = <Landing />;
  else if (path === '/docs') page = <Docs />;
  else if (path === '/login' || path === '/signup') page = <Auth mode={path.slice(1)} key={path} />;
  else if (path.startsWith('/s/')) page = <StatusPage slug={path.slice(3)} />;
  else page = <NotFound />;

  return (
    <UserCtx.Provider value={{ user, setUser }}>
      <ToastHost>{page}</ToastHost>
    </UserCtx.Provider>
  );
}
