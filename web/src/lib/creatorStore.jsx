import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as c from './creator';

const Ctx = createContext(null);

export function CreatorProvider({ children }) {
  const [creator, setCreator] = useState(() => c.creatorSession.me());
  const [ready, setReady] = useState(false);

  useEffect(() => { c.restoreCreator().then((x) => { setCreator(x); setReady(true); }); }, []);

  // Finance stays unlocked for this browser tab session only.
  const [financeOpen, setOpen] = useState(() => { try { return sessionStorage.getItem('beeoak.web.finance') === '1'; } catch { return false; } });
  const setFinanceOpen = useCallback((v) => { setOpen(v); try { if (v) sessionStorage.setItem('beeoak.web.finance', '1'); else sessionStorage.removeItem('beeoak.web.finance'); } catch { /* ignore */ } }, []);
  const login = useCallback(async (email, pw) => { const x = await c.creatorLogin(email, pw); setCreator(x); return x; }, []);
  const logout = useCallback(() => { c.creatorSession.clear(); setCreator(null); setFinanceOpen(false); }, [setFinanceOpen]);

  const value = useMemo(() => ({ creator, ready, login, logout, financeOpen, setFinanceOpen }), [creator, ready, login, logout, financeOpen, setFinanceOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCreator = () => useContext(Ctx);
