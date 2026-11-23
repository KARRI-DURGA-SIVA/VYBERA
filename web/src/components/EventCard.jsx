import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/api';
import { useApp } from '../lib/store';
import { eventDistance, fmtKm } from '../lib/location';
import { cityOf, fmtDate, isPast, minPrice, fmtINR, categoryKey, CATEGORIES } from '../lib/utils';

export function Poster({ ev, src, alt, eager }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = src ?? mediaUrl(ev?.banner || ev?.eventBanner);
  if (!url || broken) return <div className="poster-fallback">{(alt || ev?.name || ev?.eventName || 'BEE-OAK').slice(0, 28)}</div>;
  return (
    <>
      {!loaded && <div className="poster-loading" aria-hidden="true" />}
      <img src={url} alt={alt || ev?.name || ''} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className={loaded ? 'img-in' : 'img-wait'} onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />
    </>
  );
}

export const catLabel = (raw) => (CATEGORIES.find((c) => c.key === categoryKey(raw)) || {}).label || raw;

export default function EventCard({ ev, promoted }) {
  const { location } = useApp();
  const dist = fmtKm(eventDistance(ev, location));
  const past = isPast(ev);
  const p = minPrice(ev);
  return (
    <Link to={`/event/${encodeURIComponent(ev.id)}`} className="ecard">
      <div className="ecard-poster">
        <Poster ev={ev} />
        
        
        
        
      </div>
      <div className="ecard-body">
        <div className="ecard-title">{ev.name}</div>
        <div className="ecard-sub">{ev.venue ? `${ev.venue}: ` : ''}{cityOf(ev)}</div>
        <div className="ecard-cat">{catLabel(ev.category)}</div>
      </div>
    </Link>
  );
}

export function CardSkeleton() {
  return (
    <div>
      <div className="skel" style={{ aspectRatio: '3/4' }} />
      <div className="skel" style={{ height: 16, marginTop: 14, width: '80%', borderRadius: 6 }} />
      <div className="skel" style={{ height: 12, marginTop: 8, width: '55%', borderRadius: 6 }} />
    </div>
  );
}
