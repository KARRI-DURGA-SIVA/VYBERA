import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import Landmark from './Landmarks';
import { useApp } from '../lib/store';
import { ALL_INDIA, INDIA_LOCATIONS, eventIsNear, locationLabel, searchPlaces } from '../lib/location';

const titleCase = (t) => String(t || '').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function LocationChip() {
  const { location, locStatus, openLocPicker } = useApp();
  const area = !location.all && location.area && location.area.toLowerCase() !== String(location.city || '').toLowerCase() ? titleCase(location.area) : '';
  const main = locStatus === 'detecting' ? 'Detecting location…' : location.all ? 'All India' : area || titleCase(location.city) || 'Select location';
  const sub = locStatus === 'detecting' ? '' : location.all ? 'Showing events everywhere' : [area ? titleCase(location.city) : '', location.state].filter(Boolean).join(', ') || 'India';
  const full = [main, sub].filter(Boolean).join(' · ');
  return (
    <button className="loc-chip" onClick={openLocPicker} title={`${full} — change location`} aria-label={`Location: ${full}. Change location`}>
      <svg className={`loc-pin${locStatus === 'detecting' ? ' busy' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
      <span className="loc-text">
        <b>{main}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Icon name="chevD" size={14} />
    </button>
  );
}

export default function LocationPicker() {
  const { locPicker, closeLocPicker, location, setLocation, locate, locStatus, locError, events, notify } = useApp();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!locPicker) return undefined;
    setQ(''); setRemote([]);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const esc = (e) => { if (e.key === 'Escape') closeLocPicker(); };
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [locPicker, closeLocPicker]);

  const s = q.trim().toLowerCase();
  const popular = useMemo(() => INDIA_LOCATIONS.filter((c) => !s || [c.city, c.state, c.area].join(' ').toLowerCase().includes(s)), [s]);

  useEffect(() => {
    if (s.length < 3) { setRemote([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q.trim()).then(setRemote).catch(() => setRemote([])).finally(() => setSearching(false));
    }, 500);
    return () => clearTimeout(t);
  }, [s, q]);

  const countNear = (loc) => (events || []).filter((e) => eventIsNear(e, loc)).length;
  const isCurrent = (city) => !location.all && location.source !== 'gps' && location.city === city;

  const choose = (loc) => {
    setLocation(loc);
    closeLocPicker();
    notify(loc.all ? 'Showing events across India' : `Showing events near ${locationLabel(loc)}`);
  };

  if (!locPicker) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) closeLocPicker(); }}>
      <div className="modal loc-modal" role="dialog" aria-modal="true" aria-label="Select location">
        <div className="loc-top">
          <div className="modal-head">
            <div className="loc-title">
              <button className="m-back loc-back" onClick={closeLocPicker} aria-label="Back"><Icon name="chevL" size={22} /></button>
              <h2>Search location</h2>
            </div>
            <button className="icon-btn loc-x" onClick={closeLocPicker} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="loc-search">
            <Icon name="search" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city, area or locality" aria-label="Search location" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search"><Icon name="x" size={16} /></button>}
          </div>
          <div className="loc-actions">
            <button className="loc-detect" onClick={() => locate()} disabled={locStatus === 'detecting'}>
              {locStatus === 'detecting' ? <span className="spinner dark" /> : <Icon name="crosshair" size={20} />}
              {locStatus === 'detecting' ? 'Detecting your location…' : 'Detect my location'}
            </button>
           
          </div>
          {locStatus === 'failed' && <p className="loc-warn">{locError}. Allow location access in your browser, or pick a city below.</p>}
        </div>

        <div className="loc-body">
          {remote.length > 0 && (
            <section>
              <h3 className="loc-h">Places matching “{q.trim()}” {searching && <span className="spinner dark" style={{ width: 12, height: 12 }} />}</h3>
              <div className="loc-results">
                {remote.map((r) => (
                  <button key={`${r.lat},${r.lng}`} className="loc-row" onClick={() => choose(r)}>
                    <Icon name="pin" size={16} /><span><b>{r.area ? `${r.area}, ${r.city}` : r.city}</b><small>{r.display}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {popular.length > 0 && (
            <section>
              <h3 className="loc-h">Popular cities</h3>
              <div className="lm-grid">
                {popular.map((c, i) => {
                  const n = countNear(c);
                  return (
                    <button key={c.city} className={`lm-tile${isCurrent(c.city) ? ' on' : ''}`} onClick={() => choose(c)} style={{ animationDelay: `${i * 25}ms` }}>
                      {n > 0 && <span className="lm-count">{n}</span>}
                      <Landmark city={c.city} size={58} />
                      <b>{c.city}</b>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {s && !popular.length && !remote.length && (
            <p className="muted" style={{ fontSize: 14, marginTop: 22 }}>{searching ? 'Searching the map…' : s.length < 3 ? 'Keep typing to search every city and locality in India.' : `No place called “${q.trim()}” found.`}</p>
          )}
        </div>
      </div>
    </div>
  );
}
