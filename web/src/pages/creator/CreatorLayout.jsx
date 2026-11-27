import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { IS_SANDBOX } from '../../lib/api';
import { PageLoader } from '../Details';
import CreatorAuth from './CreatorAuth';
import { IS_PORTAL } from '../../lib/env';
import { creatorSession, planStatus } from '../../lib/creator';

const NAV = [
  { to: '/creator', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/creator/events', label: 'My events', icon: 'cal' },
  { to: '/creator/create', label: 'Create event', icon: 'edit' },
  { to: '/creator/revenue', label: 'Revenue', icon: 'card' },
  { to: '/creator/scanner', label: 'QR scanner', icon: 'qr' },
  { to: '/creator/staff', label: 'Staff', icon: 'users' },
  { to: '/creator/plans', label: 'Upgrade plan', icon: 'spark', plan: true },
];

export default function CreatorLayout() {
  const { creator, ready, logout } = useCreator();
  const { toast, notify } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [planTag, setPlanTag] = useState('');
  useEffect(() => {
    if (!creator || String(creatorSession.token()).startsWith('sandbox.')) return;
    planStatus().then((d) => setPlanTag(d.subscription ? (d.subscription.billingPeriod === 'trial' ? 'Trial' : d.subscription.plan) : 'Free')).catch(() => setPlanTag(''));
  }, [creator, pathname]);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [pathname]);

  const body = !ready && !creator ? <PageLoader /> : !creator ? <CreatorAuth /> : <Outlet />;

  return (
    <div className="cr-shell">
      <header className="cr-top">
        <div className="cr-top-in">
          <Link to="/" className="brand"><img src="/logo.png" alt="" /><span className="brand-name">BEE<b>·</b>OAK</span></Link>
          <span className="cr-mode"><Icon name="spark" size={14} /> Creator mode</span>
          {IS_SANDBOX && <span className="sandbox-pill" title="Publishing, staff, finance PIN and check-ins are simulated. The production database is not touched.">Sandbox</span>}
          <div className="cr-top-right">
            <Link to="/" className="btn btn-ghost btn-sm"><Icon name="chevL" size={14} /> {IS_PORTAL ? 'Partner portal' : 'Back to BEE-OAK'}</Link>
            {creator && (
              <div style={{ position: 'relative' }}>
                <button className="user-chip" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                  <span className="avatar gold">{creator.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <span>{creator.name}</span><Icon name="chevD" size={14} />
                </button>
                {menu && (
                  <div className="menu">
                    <div style={{ padding: '8px 12px 10px' }}><b style={{ fontSize: 14 }}>{creator.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{creator.email}</div></div>
                    <hr />
                    <Link to="/profile?tab=creator"><Icon name="user" /> Creator settings</Link>
                    <button onClick={() => { logout(); notify('Signed out of creator mode'); nav('/profile?tab=creator'); }}><Icon name="logout" /> Exit creator mode</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={`cr-body${creator ? '' : ' bare'}`}>
        {creator && (
          <aside className="cr-side">
            <nav>
              {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={n.plan ? 'cr-nav-plan' : undefined}><Icon name={n.icon} />{n.label}{n.plan && <em className="cr-plan-tag">{planTag}</em>}</NavLink>)}
            </nav>
            <div className="cr-side-card">
              <span className="eyebrow">KYC</span>
              <b>{creator.kycStatus || 'Approved'}</b>
              <small>{creator.category ? `${creator.category} creator` : 'Verified creator'}</small>
            </div>
          </aside>
        )}
        <main className="cr-main page-enter" key={pathname}>{body}</main>
      </div>
      {toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}
    </div>
  );
}
