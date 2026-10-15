// Who is signed in. Restores the saved token at launch, signs out everywhere on a 401.
import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, tokenStore, onSignedOut } from './api';
import { registerForPush, currentPushToken } from './push';

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined while restoring

  const signOutLocal = useCallback(async () => { setToken(null); await tokenStore.clear(); setUser(null); }, []);
  useEffect(() => {
    onSignedOut(signOutLocal);
    (async () => {
      const t = await tokenStore.get().catch(() => null);
      if (!t) return setUser(null);
      setToken(t);
      try {
        const r = await api('auth');
        if (!r.user) return signOutLocal();
        setUser(r.user);
        registerForPush({ ask: false });
      } catch (e) { if (e.offline) setUser({ offline: true }); else signOutLocal(); }
    })();
  }, [signOutLocal]);

  const signIn = useCallback(async (mode, fields) => {
    const r = await api('auth', { method: 'POST', body: { action: mode, app: true, ...fields } });
    setToken(r.token); await tokenStore.set(r.token); setUser(r.user);
    return r.user;
  }, []);
  const signOut = useCallback(async () => {
    await api('auth', { method: 'POST', body: { action: 'logout', device: currentPushToken() } }).catch(() => {});
    await signOutLocal();
  }, [signOutLocal]);
  const refresh = useCallback(async () => { const r = await api('auth'); if (r.user) setUser(r.user); return r.user; }, []);
  const replaceToken = useCallback(async t => { setToken(t); await tokenStore.set(t); }, []);

  return createElement(Ctx.Provider, { value: { user, setUser, signIn, signOut, signOutLocal, refresh, replaceToken } }, children);
}
