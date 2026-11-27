import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';

// Shared "hub" chrome (Organizer hub design): green header, grouped sidebar, centred content.
// groups: [[title, [{ to, label, icon, end, badge, hash }]]]
export default function HubShell({ title, subtitle, user, role, groups, footer, onSignOut, storeKey, children }) {
  const { pathname, hash } = useLocation();
  const wide = () => window.matchMedia('(min-width: 901px)').matches;
  const [side, setSideState] = useState(() => wide() && (() => { try { return localStorage.getItem(storeKey) !== 'closed'; } catch { return true; } })());
  const setSide = (v) => setSideState((cur) => { const n = typeof v === 'function' ? v(cur) : v; if (wide()) { try { localStorage.setItem(storeKey, n ? 'open' : 'closed'); } catch { /* ignore */ } } return n; });
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); if (!wide()) setSideState(false); }, [pathname, hash]);
  const initials = String(user?.name || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`cr-shell oh${side ? ' side-open' : ''}`}>
      <header className="cr-top oh-top">
        <div className="cr-top-in">
          <button type="button" className="oh-burger" onClick={() => setSide((v) => !v)} aria-label={side ? 'Close menu' : 'Open menu'} aria-expanded={side}><span className="oh-pi" aria-hidden="true"><i /></span></button>
          <Link to="/" className="oh-brand"><b>BEE-OAK</b><small>{title}</small></Link>
          <div className="cr-top-right">
            <div style={{ position: 'relative' }}>
              <button className="oh-user" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                <span className="oh-av">{initials}</span>
                <span className="oh-who"><b>{user?.name || 'Account'}</b><small>{role}</small></span><Icon name="chevD" size={14} />
              </button>
              {menu && (
                <div className="menu">
                  <div style={{ padding: '8px 12px 10px' }}><b style={{ fontSize: 14 }}>{user?.name}</b>{user?.email && <div className="muted" style={{ fontSize: 12.5 }}>{user.email}</div>}</div>
                  <hr />
                  <button onClick={onSignOut}><Icon name="logout" /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="cr-body">
        {side && <button type="button" className="oh-scrim" aria-label="Close menu" onClick={() => setSide(false)} />}
        <aside className="cr-side oh-side" aria-hidden={!side}>
          <nav>
            {groups.map(([g, items]) => (
              <div key={g} className="oh-group">
                <span className="oh-label">{g}</span>
                {items.map((n) => (n.hash ? (
                  <a key={n.label} href={`#${n.hash}`} className={hash === `#${n.hash}` ? 'active' : ''} onClick={(e) => { e.preventDefault(); document.getElementById(n.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.history.replaceState(null, '', `#${n.hash}`); if (!wide()) setSideState(false); }}>
                    <Icon name={n.icon} size={20} />{n.label}{n.badge != null && <em className="oh-count">{n.badge}</em>}
                  </a>
                ) : (
                  <NavLink key={n.label} to={n.to} end={n.end}><Icon name={n.icon} size={20} />{n.label}{n.badge != null && <em className="oh-count">{n.badge}</em>}</NavLink>
                )))}
              </div>
            ))}
          </nav>
          {footer}
        </aside>
        <main className="cr-main page-enter" key={pathname}>{children}</main>
      </div>
      {subtitle}
    </div>
  );
}
