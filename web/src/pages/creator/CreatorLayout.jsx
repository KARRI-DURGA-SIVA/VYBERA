import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { IS_SANDBOX } from '../../lib/api';
import { PageLoader } from '../Details';
import CreatorAuth from './CreatorAuth';
import { IS_PORTAL } from '../../lib/env';
import { creatorSession, myEvents, planStatus } from '../../lib/creator';

const GROUPS = [
  ['Main menu', [
    { to: '/creator', label: 'Dashboard', icon: 'grid', end: true },
    { to: '/creator/events', label: 'My Events', icon: 'cal', count: true },
    { to: '/creator/create', label: 'Create Event', icon: 'edit' },
    { to: '/creator/revenue', label: 'Reports', icon: 'file' },
  ]],
  ['Operations', [
    { to: '/creator/scanner', label: 'QR Scanner', icon: 'scan' },
    { to: '/creator/staff', label: 'Staff Management', icon: 'users' },
    { to: '/creator/revenue?tab=payouts', label: 'Payouts', icon: 'card', exact: true },
  ]],
  ['System', [
    { to: '/creator/plans', label: 'Subscription', icon: 'bolt', plan: true },
    { to: '/profile?tab=creator', label: 'Settings', icon: 'gear' },
  ]],
];

export default function CreatorLayout() {
  const { creator, ready, logout } = useCreator();
  const { toast, notify } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [plan, setPlan] = useState(null);
  const [evCount, setEvCount] = useState(null);
  const [side, setSideState] = useState(() => window.matchMedia('(min-width: 901px)').matches && (() => { try { return localStorage.getItem('beeoak.web.hubSide') !== 'closed'; } catch { return true; } })());
  const setSide = (v) => setSideState((cur) => {
    const next = typeof v === 'function' ? v(cur) : v;
    if (window.matchMedia('(min-width: 901px)').matches) { try { localStorage.setItem('beeoak.web.hubSide', next ? 'open' : 'closed'); } catch { /* private mode */ } }
    return next;
  });
  useEffect(() => {
    if (!creator || String(creatorSession.token()).startsWith('sandbox.')) return;
    planStatus().then(setPlan).catch(() => setPlan(null));
  }, [creator, pathname]);
  useEffect(() => { if (creator) myEvents(creator).then((l) => setEvCount(l.length)).catch(() => {}); }, [creator]);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); if (window.matchMedia('(max-width: 900px)').matches) setSideState(false); }, [pathname]);
  const sub = plan?.subscription; const cr = plan?.credits;
  const tag = sub ? (sub.billingPeriod === 'trial' ? 'Trial' : 'Active') : plan ? 'Free' : '';
  const pct = cr?.allocated ? Math.min(100, Math.round((cr.consumed / cr.allocated) * 100)) : 0;
  const role = sub ? `${sub.plan} organizer` : creator?.category ? `${creator.category} creator` : 'Organizer';

  const body = !ready && !creator ? <PageLoader /> : !creator ? <CreatorAuth /> : <Outlet />;

  return (
    <div className={`cr-shell oh${side ? ' side-open' : ''}`}>
      <header className="cr-top oh-top">
        <div className="cr-top-in">
          {creator && <button type="button" className="oh-burger" onClick={() => setSide((v) => !v)} aria-label={side ? 'Close menu' : 'Open menu'} aria-expanded={side}><span className="oh-mi" aria-hidden="true"><i /><i /><i /></span></button>}
          <Link to={IS_PORTAL ? '/' : '/creator'} className="oh-brand"><b>BEE-OAK</b><small>Organizer hub</small></Link>
          {IS_SANDBOX && <span className="sandbox-pill" title="Publishing, staff, finance PIN and check-ins are simulated. The production database is not touched.">Sandbox</span>}
          <div className="cr-top-right">
            {!creator && <Link to="/" className="btn btn-ghost btn-sm"><Icon name="chevL" size={14} /> {IS_PORTAL ? 'Partner portal' : 'Back to BEE-OAK'}</Link>}
            {creator && (
              <>
                <button type="button" className="oh-bell" aria-label="Notifications" onClick={() => notify(cr && cr.allocated && pct >= 80 ? `You’ve used ${pct}% of your ticket credits` : 'You’re all caught up')}><Icon name="bell" size={22} />{cr && cr.allocated > 0 && pct >= 80 && <i />}</button>
                <div style={{ position: 'relative' }}>
                  <button className="oh-user" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                    <span className="oh-av">{creator.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</span>
                    <span className="oh-who"><b>{creator.name}</b><small>{role}</small></span><Icon name="chevD" size={14} />
                  </button>
                  {menu && (
                    <div className="menu">
                      <div style={{ padding: '8px 12px 10px' }}><b style={{ fontSize: 14 }}>{creator.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{creator.email}</div></div>
                      <hr />
                      <Link to="/creator/plans"><Icon name="bolt" /> Subscription</Link>
                      <Link to="/profile?tab=creator"><Icon name="gear" /> Settings</Link>
                      {IS_PORTAL && <Link to="/"><Icon name="chevL" /> Partner portal</Link>}
                      <button onClick={() => { logout(); notify('Signed out of creator mode'); nav(IS_PORTAL ? '/creator' : '/profile?tab=creator'); }}><Icon name="logout" /> Sign out</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <div className={`cr-body${creator ? '' : ' bare'}`}>
        {creator && side && <button type="button" className="oh-scrim" aria-label="Close menu" onClick={() => setSide(false)} />}
        {creator && (
          <aside className="cr-side oh-side" aria-hidden={!side}>
            <nav>
              {GROUPS.map(([title, items]) => (
                <div key={title} className="oh-group">
                  <span className="oh-label">{title}</span>
                  {items.map((n) => (
                    <NavLink key={n.label} to={n.to} end={n.end} className={({ isActive }) => (isActive && !(n.exact && !pathname.includes('?')) ? 'active' : '')}>
                      <Icon name={n.icon} size={20} />{n.label}
                      {n.count && evCount !== null && <em className="oh-count">{evCount}</em>}
                      {n.plan && tag && <em className={`oh-badge ${tag.toLowerCase()}`}>{tag}</em>}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="oh-credits">
              <div className="oh-credits-h"><span>Credits usage</span><b>{cr ? `${pct}%` : '—'}</b></div>
              <span className="oh-bar"><i style={{ width: `${pct}%` }} /></span>
              <p>{cr && sub ? `${cr.consumed.toLocaleString('en-IN')} of ${cr.allocated.toLocaleString('en-IN')} issued` : 'No active plan'}</p>
              <Link to="/creator/plans" className="oh-up"><Icon name="bolt" size={16} /> {sub && sub.billingPeriod !== 'trial' ? 'Upgrade plan' : 'Upgrade to Pro'}</Link>
            </div>
          </aside>
        )}
        <main className="cr-main page-enter" key={pathname}>{body}</main>
      </div>
      {toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}
    </div>
  );
}
