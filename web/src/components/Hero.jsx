import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Poster, catLabel } from './EventCard';
import { mediaUrl } from '../lib/api';
import { cityOf, fmtDate } from '../lib/utils';

const DURATION = 5000;

// Banner carousel: centre slide with the previous/next slides peeking in at the sides.
export default function Hero({ events }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const n = events.length;
  const go = useCallback((k) => setI(((k % n) + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || paused) return undefined;
    const t = setTimeout(() => go(i + 1), DURATION);
    return () => clearTimeout(t);
  }, [go, i, n, paused]);

  if (!n) return <section className="bm"><div className="bm-track"><div className="bm-slide skel" style={{ transform: 'translateX(-50%)' }} /></div></section>;

  return (
    <section className="bm" aria-roledescription="carousel" aria-label="Featured events"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); touch.current = null; }}>
      <div className="bm-track">
        {events.map((ev, k) => {
          let off = k - i;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const near = Math.abs(off) <= 1;
          const url = `/event/${encodeURIComponent(ev.id)}`;
          return (
            <div key={ev.id} className={`bm-slide${off === 0 ? ' on' : ''}`} aria-hidden={off !== 0}
              style={{ transform: `translateX(calc(-50% + ${off} * (var(--bm-w) + var(--bm-gap))))`, opacity: near ? 1 : 0, zIndex: off === 0 ? 2 : 1 }}
              onClick={off !== 0 ? () => go(k) : undefined}>
              <div className="bm-bg" style={{ backgroundImage: `url("${mediaUrl(ev.banner)}")` }} />
              <div className="bm-shade" />
              <div className="bm-content">
                <span className="bm-cat">{catLabel(ev.category)}</span>
                <h2 className={`bm-title${off === 0 ? ' tk-title' : ''}`}>{ev.name}</h2>
                <div className="bm-line">
                  <span>{fmtDate(ev.date, { day: 'numeric', month: 'long' }).toUpperCase()}</span>
                  <i />
                  <span>{(ev.venue || cityOf(ev)).toUpperCase()}</span>
                </div>
                <div className="bm-cta">
                  <Link to={`${url}/book`} className="btn btn-gold" tabIndex={off === 0 ? 0 : -1}>Book now</Link>
                  <Link to={url} className="bm-more" tabIndex={off === 0 ? 0 : -1}>View details <Icon name="chevR" size={14} /></Link>
                </div>
              </div>
              <Link to={url} className="bm-poster" tabIndex={-1} aria-hidden="true"><Poster ev={ev} eager={near} /></Link>
              {off !== 0 && <div className="bm-dim" />}
            </div>
          );
        })}
        {n > 1 && <>
          <button className="bm-arrow prev" onClick={() => go(i - 1)} aria-label="Previous event"><Icon name="chevL" size={22} /></button>
          <button className="bm-arrow next" onClick={() => go(i + 1)} aria-label="Next event"><Icon name="chevR" size={22} /></button>
        </>}
      </div>
    </section>
  );
}
