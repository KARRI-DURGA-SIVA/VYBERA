import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSaved } from '../lib/saved';

const I = {
  home: <><path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19v-7.8Z" /><path d="M12 9.6h.01" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  bookings: <><path d="M3.5 8.5A1.5 1.5 0 0 0 5 7h14a1.5 1.5 0 0 0 1.5 1.5v2a2 2 0 0 0 0 4v2A1.5 1.5 0 0 0 19 18H5a1.5 1.5 0 0 0-1.5-1.5v-2a2 2 0 0 0 0-4v-2Z" /><path d="M14.5 7v11" strokeDasharray="1.6 1.8" /><path d="m9.2 10.6.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.3.7.2-1.5-1-1.1 1.4-.2.7-1.4Z" /></>,
  saved: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" />,
  profile: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.4 18.2c1.3-2.3 3.3-3.4 5.6-3.4s4.3 1.1 5.6 3.4" /></>,
};

// Mobile bottom bar (shown at phone/tablet widths).
export default function BottomNav() {
  const { pathname } = useLocation();
  const saved = useSaved().length;
  // Hide only while the on-screen keyboard is actually open (viewport shrinks), so taps never make the bar dip.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    let full = Math.max(window.innerHeight, vv ? vv.height : 0);
    const isField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    const check = () => {
      const h = vv ? vv.height : window.innerHeight;
      if (!isField(document.activeElement)) full = Math.max(full, h);
      setTyping(isField(document.activeElement) && h < full - 120);
    };
    const onResize = () => { if (!isField(document.activeElement)) full = vv ? vv.height : window.innerHeight; check(); };
    (vv || window).addEventListener('resize', onResize);
    document.addEventListener('focusout', () => setTimeout(check, 60));
    return () => { (vv || window).removeEventListener('resize', onResize); };
  }, []);
  const items = [
    ['Home', '/', 'home', pathname === '/' || pathname.startsWith('/explore') || pathname.startsWith('/event') || pathname.startsWith('/opportunit')],
    ['Search', '/search', 'search', pathname.startsWith('/search')],
    ['Bookings', '/bookings', 'bookings', pathname.startsWith('/bookings') || pathname.startsWith('/confirmation')],
    ['Saved', '/saved', 'saved', pathname.startsWith('/saved')],
  ];
  return (
    <nav className={`bnav${typing ? ' bnav-hide' : ''}`} aria-label="Main">
      {items.map(([label, to, ic, on]) => (
        <Link key={label} to={to} className={`bnav-it${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
          <span className="bnav-ic">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[ic]}</svg>
            {ic === 'saved' && saved > 0 && <i>{saved}</i>}
          </span>
          <span className="bnav-lbl">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
