import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import CatIcon from './CatIcon';
import Footer from './Footer';
import BottomNav from './BottomNav';
import LocationPicker, { LocationChip } from './LocationPicker';
import { useApp } from '../lib/store';
import { useTheme } from '../lib/theme';
import { IS_SANDBOX, mediaUrl, storage } from '../lib/api';
import { CATEGORIES, cityOf, displayName, fmtDate } from '../lib/utils';

// True inside the BEE-OAK Android app shell (beeoak-app/config.xml appends this to the user agent).
const IN_APP = typeof navigator !== 'undefined' && /BeeOakApp/.test(navigator.userAgent);

function ProfileGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="9.2" r="3.4" fill="currentColor" />
      <path d="M5.6 19.4c1.2-3.1 3.6-4.7 6.4-4.7s5.2 1.6 6.4 4.7A10.5 10.5 0 0 1 12 22.6a10.5 10.5 0 0 1-6.4-3.2Z" fill="currentColor" />
    </svg>
  );
}

// "Are you sure?" before signing out.
function DarkToggle() {
  const { dark, setPref } = useTheme();
  return <button onClick={() => setPref(dark ? 'light' : 'dark')}><Icon name="moon" /> {dark ? 'Light mode' : 'Dark mode'}</button>;
}

function SignOutModal() {
  const { signOutAsk, setSignOutAsk, logout, notify } = useApp();
  const nav = useNavigate();
  if (!signOutAsk) return null;
  return (
    <div className="modal-scrim so-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setSignOutAsk(false); }}>
      <div className="so-card" role="alertdialog" aria-modal="true" aria-labelledby="so-t">
        <span className="so-ic"><Icon name="logout" size={26} /></span>
        <h3 id="so-t">Sign out of BEE-OAK?</h3>
        <p>Your tickets stay safe in your account. Sign in again any time to see them.</p>
        <div className="so-btns">
          <button className="btn btn-ghost" onClick={() => setSignOutAsk(false)}>Cancel</button>
          <button className="btn so-yes" onClick={() => { logout(); notify('You have been signed out'); nav('/'); }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// First time a signed-out user opens the app: recommend signing in.
function WelcomeSheet() {
  const { user, authReady } = useApp();
  const { pathname } = useLocation();
  const [show, setShow] = useState(() => !storage.get('beeoak.web.welcomed', false));
  if (!show || !authReady || user || /^\/(login|register)/.test(pathname)) return null;
  const done = () => { storage.set('beeoak.web.welcomed', true); setShow(false); };
  return (
    <div className="modal-scrim so-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) done(); }}>
      <div className="wl-sheet" role="dialog" aria-modal="true" aria-labelledby="wl-t">
        <img src="/logo.png" alt="" />
        <h3 id="wl-t">Welcome to BEE-OAK</h3>
        <p>Sign in to book tickets faster, keep your QR passes in one place and get events picked for your city.</p>
        <Link to="/login" className="btn btn-primary btn-lg btn-block" onClick={done}>Sign in</Link>
        <Link to="/register" className="btn btn-ghost btn-lg btn-block" onClick={done}>Create an account</Link>
        <button className="wl-later" onClick={done}>Maybe later</button>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="BEE-OAK home">
      <img src="/logo.png" alt="" />
      <span className="brand-name">BEE<b>·</b>OAK</span>
    </Link>
  );
}

function Search() {
  const { events } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !events) return [];
    return events.filter((e) => [e.name, e.venue, e.city, e.category, e.creatorName].join(' ').toLowerCase().includes(s)).slice(0, 6);
  }, [q, events]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (open && results[active]) nav(`/event/${encodeURIComponent(results[active].id)}`);
    else nav(`/explore?q=${encodeURIComponent(q.trim())}`);
    setOpen(false);
  };

  return (
    <form className="search" ref={box} onSubmit={submit} role="search">
      <Icon name="search" />
      <input value={q} placeholder="Search for events, venues, categories and creators"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-label="Search events" />
      {open && q.trim() && (
        <div className="search-pop">
          {results.length ? results.map((ev, k) => (
            <Link key={ev.id} to={`/event/${encodeURIComponent(ev.id)}`} className={`search-item${k === active ? ' active' : ''}`} onClick={() => { setOpen(false); setQ(''); }}>
              <img src={mediaUrl(ev.banner)} alt="" />
              <div><b>{ev.name}</b><small>{fmtDate(ev.date)} · {cityOf(ev)} · {ev.category}</small></div>
            </Link>
          )) : <div style={{ padding: 14, color: 'var(--ink-3)', fontSize: 14 }}>No events match “{q}”. Press Enter to search Explore.</div>}
        </div>
      )}
    </form>
  );
}

function UserMenu() {
  const { user, setSignOutAsk } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) {
    return (
      <>
        <Link to="/login" className="btn btn-ghost btn-sm d-only">Sign in</Link>
        <Link to="/register" className="btn btn-primary btn-sm d-only">Create account</Link>
        <Link to="/login" className="profile-btn m-only m-flex" aria-label="Sign in"><ProfileGlyph /></Link>
      </>
    );
  }
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="profile-btn" onClick={() => (window.matchMedia('(max-width: 820px)').matches ? nav('/account') : setOpen((o) => !o))} aria-expanded={open} aria-label="Account menu" title={displayName(user)}>
        <ProfileGlyph />
      </button>
      {open && (
        <div className="menu">
          <div className="menu-who"><b>{displayName(user)}</b><small>{user.email}</small></div>
          <hr />
          <Link to="/dashboard"><Icon name="grid" /> Dashboard</Link>
          <Link to="/bookings"><Icon name="ticket" /> My bookings</Link>
          <Link to="/profile"><Icon name="user" /> Profile & settings</Link>
          <Link to="/profile?tab=creator"><Icon name="spark" /> Creator mode</Link>
          <Link to="/login?as=staff"><Icon name="users" /> Staff dashboard</Link>
          <Link to="/help"><Icon name="help" /> Help centre</Link>
          <hr />
          <DarkToggle />
          <button onClick={() => { setOpen(false); setSignOutAsk(true); }}><Icon name="logout" /> Sign out</button>
        </div>
      )}
    </div>
  );
}

// Header category bar: "All" shows every event; each category opens its events.
const NAV_CATS = [
  { key: 'All', label: 'All', to: '/explore' },
  { key: 'Opportunity', label: 'Opportunity', to: '/opportunities' },
  { key: 'Music', label: 'Music' },
  { key: 'Food', label: 'Food' },
  { key: 'Free', label: 'Free', to: '/explore?price=free' },
  { key: 'CollegeArt', label: 'College Art' },
  { key: 'Comedy', label: 'Comedy' },
  { key: 'Sports', label: 'Sports' },
  { key: 'Tech', label: 'Tech' },
  { key: 'Startup', label: 'Startup' },
  { key: 'Other', label: 'Experiences' },
]

function CatLink({ c }) {
  const { pathname, search } = useLocation();
  const cat = new URLSearchParams(search).get('cat') || 'All';
  const q = new URLSearchParams(search);
  const active = c.key === 'Opportunity' ? pathname.startsWith('/opportunit')
    : c.key === 'Free' ? pathname === '/explore' && q.get('price') === 'free'
      : c.key === 'All' ? pathname === '/explore' && cat === 'All' && q.get('price') !== 'free'
        : pathname === '/explore' && cat === c.key;
  return (
    <Link to={c.to || `/explore?cat=${c.key}`} className={`cat-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span className="cat-ic"><CatIcon name={c.key} /></span><span className="cat-lbl">{c.label}</span>
    </Link>
  );
}


export default function Layout() {
  const { toast } = useApp();
  const { pathname, search } = useLocation();
  const navTo = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const bare = pathname === '/login' || pathname === '/register';
  const noFooter = bare || /\/(book|pay)$/.test(pathname);
  // Phone app screens with their own title bar (instead of the site header).
  const q = new URLSearchParams(search);
  const PROFILE_TITLES = { details: 'Personal details', prefs: 'Notifications', security: 'Privacy & security', creator: 'Creator mode' };
  const pageTitle = pathname === '/profile' ? PROFILE_TITLES[q.get('tab') || 'details']
    : /^\/bookings\/[^/]+$/.test(pathname) ? 'Your ticket'
      : { '/bookings': 'My bookings', '/saved': 'Saved events', '/help': 'Help & support', '/contact': 'Contact us', '/about': 'About BEE-OAK', '/dashboard': 'Dashboard' }[pathname]
        || (/^\/confirmation\//.test(pathname) ? 'Booking confirmed' : '')
        || (pathname === '/opportunities' ? 'Opportunities' : '')
        || (pathname === '/explore' ? (q.get('q') ? `“${q.get('q')}”` : q.get('price') === 'free' ? 'Free events' : q.get('near') ? 'Near you'
          : (CATEGORIES.find((c) => c.key === (q.get('cat') || 'All'))?.label || 'All events').replace(/^All$/, 'All events')) : '');
  const catPage = pathname === '/explore' || pathname === '/opportunities';
  const payOnly = /\/pay$/.test(pathname); // payment page: gateways + details only
  const appScreen = (/^\/(event|opportunity\/event)\//.test(pathname) && !/\/join$/.test(pathname)) || /^\/(account|login|register|search)$/.test(pathname); // full-screen app pages on phones

  return (
    <>
      {pageTitle && (
        <div className="m-bar m-bar-page">
          <button className="m-bar-btn m-back" onClick={() => (window.history.length > 1 ? navTo(-1) : navTo(catPage ? '/' : '/account'))} aria-label="Back"><Icon name="chevL" size={22} /></button>
          <b>{pageTitle}</b>
        </div>
      )}
      {!payOnly && <header className={`hdr${appScreen || pageTitle ? ' hdr-mhide' : ''}`}>
        <div className="wrap hdr-top">
          <Brand />
          <Search />
          <div className="hdr-right">
            {IS_SANDBOX && <span className="sandbox-pill" title="Sign-ups, bookings and payments are simulated in this browser. The production database is not touched.">Sandbox</span>}
            <LocationChip />
            <UserMenu />
          </div>
        </div>
        {!bare && (
          <nav className="wrap hdr-nav" aria-label="Primary">
            {NAV_CATS.map((c) => <CatLink key={c.key} c={c} />)}
          </nav>
        )}
      </header>}
      <main key={pathname} className={`page-enter${pageTitle ? ' m-has-bar' : ''}`}><Outlet /></main>
      {!noFooter && !IN_APP && <Footer />}
      {!payOnly && (!appScreen || pathname === '/account' || pathname === '/search') && (!pageTitle || ['/bookings', '/saved', '/explore', '/opportunities'].includes(pathname)) && <BottomNav />}
      <LocationPicker />
      <SignOutModal />
      <WelcomeSheet />
      {toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}
    </>
  );
}
