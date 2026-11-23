import { useEffect, useState } from 'react';

// Appearance: 'light' | 'dark' — stored per device, applied as <html data-theme>.
const KEY = 'beeoak.web.theme';

export function themePref() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

// Android app: tint the system status bar to the page (Cordova's built-in SystemBarPlugin picks
// dark or light icons from the colour). No-op in browsers.
function syncStatusBar(dark) {
  const set = () => { try { window.statusbar?.setBackgroundColor?.(dark ? '#0d120f' : '#f4f1e8'); } catch { /* not in app */ } };
  if (window.cordova) set(); else document.addEventListener('deviceready', set, { once: true });
}

export function applyTheme(pref = themePref()) {
  const dark = pref === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d120f' : '#f4f1e8');
  syncStatusBar(dark);
  return dark;
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
  window.dispatchEvent(new Event('beeoak:theme'));
}

export function useTheme() {
  const [pref, setPref] = useState(themePref);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const sync = () => { const p = themePref(); setPref(p); setDark(applyTheme(p)); };
    window.addEventListener('beeoak:theme', sync);
    return () => window.removeEventListener('beeoak:theme', sync);
  }, []);
  return { pref, dark, setPref: setThemePref };
}

export function ThemeSwitch() {
  const { pref, setPref } = useTheme();
  return (
    <div className="theme-seg" role="radiogroup" aria-label="Appearance">
      {[['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={pref === k} className={pref === k ? 'on' : ''} onClick={() => setPref(k)}>{l}</button>
      ))}
    </div>
  );
}
