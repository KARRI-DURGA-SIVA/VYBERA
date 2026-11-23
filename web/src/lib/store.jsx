import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { ALL_INDIA, detectLocation, locationLabel } from './location';

const AppCtx = createContext(null);
const LOC_KEY = 'beeoak.web.location';

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => api.session.user());
  const [authReady, setAuthReady] = useState(false);
  const [events, setEvents] = useState(null);
  const [eventsError, setEventsError] = useState('');
  const [toast, setToast] = useState(null);
  const [location, setLocationState] = useState(() => api.storage.get(LOC_KEY, null));
  const [locStatus, setLocStatus] = useState('idle'); // idle | detecting | ok | failed
  const [locError, setLocError] = useState('');
  const [locPicker, setLocPicker] = useState(false);
  const [signOutAsk, setSignOutAsk] = useState(false);
  // First sign-in on this device → recommend choosing a location.
  const askLocationOnce = () => {
    if (api.storage.get('beeoak.web.locAsked', false)) return;
    api.storage.set('beeoak.web.locAsked', true);
    setTimeout(() => setLocPicker(true), 600);
  };
  const started = useRef(false);

  const notify = useCallback((message, tone = 'ok') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 3200);
  }, []);

  const setLocation = useCallback((loc) => {
    const next = loc || ALL_INDIA;
    setLocationState(next);
    api.storage.set(LOC_KEY, next);
  }, []);

  const locate = useCallback(async ({ silent = false } = {}) => {
    setLocStatus('detecting');
    setLocError('');
    try {
      const loc = await detectLocation();
      setLocation(loc);
      setLocStatus('ok');
      setLocPicker(false);
      if (!silent) notify(`Showing events near ${locationLabel(loc)}`);
      return loc;
    } catch (e) {
      setLocStatus('failed');
      setLocError(e.message);
      if (!silent) notify(e.message, 'err');
      return null;
    }
  }, [notify, setLocation]);

  const openLocPicker = useCallback(() => setLocPicker(true), []);
  const closeLocPicker = useCallback(() => setLocPicker(false), []);

  // Retries with a per-attempt timeout, so a slow or dropped first request (cold start,
  // flaky network) never leaves the home screen stuck on placeholders.
  const loadEvents = useCallback(async (force = false) => {
    setEventsError('');
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Events are taking too long to load. Check your connection and try again.')), ms))]);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { setEvents(await withTimeout(api.getEvents({ force: force || attempt > 0 }), 12000)); return; } catch (e) { lastErr = e; }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    setEventsError(lastErr?.message || 'Could not load events'); setEvents((ev) => ev || []);
  }, []);
  // Coming back online after a failed load → try again.
  useEffect(() => {
    const again = () => { if (eventsError) loadEvents(true); };
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [eventsError, loadEvents]);

  useEffect(() => {
    if (started.current) return; // StrictMode double-mount guard
    started.current = true;
    loadEvents();
    api.restoreSession().then((u) => { setUser(u); setAuthReady(true); });
    // Detect the visitor's location on every load, like the app does on start.
    locate({ silent: true }).then((loc) => {
      if (!loc && !api.storage.get(LOC_KEY, null) && api.session.user()) setLocPicker(true);
    });
  }, [loadEvents, locate]);

  const value = useMemo(() => ({
    user, authReady, events, eventsError, toast,
    location: location || ALL_INDIA, locStatus, locError, locPicker,
    setLocation, locate, openLocPicker, closeLocPicker,
    loadEvents, notify,
    async login(id, pw) { const u = await api.login(id, pw); setUser(u); askLocationOnce(); return u; },
    async googleLogin() { const u = await api.googleLogin(); setUser(u); askLocationOnce(); return u; },
    async signup(form) { const u = await api.signup(form); setUser(u); askLocationOnce(); return u; },
    signOutAsk, setSignOutAsk,
    async saveProfile(changes) { const u = await api.updateProfile(user, changes); setUser(u); return u; },
    logout() { api.session.clear(); setUser(null); setSignOutAsk(false); try { window.plugins?.googleplus?.disconnect(() => {}, () => {}); } catch { /* not in app */ } },
  }), [user, authReady, events, eventsError, toast, location, locStatus, locError, locPicker, setLocation, locate, openLocPicker, closeLocPicker, loadEvents, notify, signOutAsk]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
