import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Icon from './components/Icon';
import { useApp } from './lib/store';
import { staffLogin, staffSession } from './lib/staff';
import CreatorLayout from './pages/creator/CreatorLayout';
import CreatorDashboard, { CreatorEvents, CreatorRevenue } from './pages/creator/CreatorHome';
import CreateEvent from './pages/creator/CreateEvent';
import Scanner from './pages/creator/Scanner';
import Staff from './pages/creator/Staff';
import OppManage from './pages/creator/OppManage';
import { PaymentReturn, StaffDashboard, StaffHome, StaffJoin, StaffLayout } from './pages/staff/StaffPages';
import { AdminBookings, AdminCreators, AdminEvents, AdminLayout, AdminLogin, AdminOverview, AdminPayments, AdminUsers } from './pages/admin/AdminPages';
import { adminLogin, adminSession } from './lib/admin';

// BEE-OAK Partners: a separate site for creators and staff only (no public pages).

function PortalShell({ children }) {
  const { toast } = useApp();
  return (
    <div className="pt">
      <header className="pt-top">
        <Link to="/" className="brand"><img src="/logo.png" alt="" /><span className="brand-name">BEE<b>·</b>OAK</span></Link>
        <span className="pt-tag">Partners</span>
      </header>
      <main className="pt-main">{children}</main>
      <footer className="pt-foot">© {new Date().getFullYear()} BEE-OAK · Partner access only</footer>
      {toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}
    </div>
  );
}

function PortalHome() {
  return (
    <PortalShell>
      <div className="pt-hero">
        <h1>Partner sign in</h1>
        <p>Choose how you work with BEE-OAK.</p>
      </div>
      <div className="pt-cards">
        <Link to="/creator" className="pt-card">
          <span className="pt-ic"><Icon name="spark" size={26} /></span>
          <b>Creator</b>
          <small>Publish events, track sales and revenue, manage staff and scan tickets at the gate.</small>
          <span className="pt-go">Creator sign in <Icon name="chevR" size={16} /></span>
        </Link>
        <Link to={staffSession.token() ? '/staff' : '/staff/login'} className="pt-card">
          <span className="pt-ic"><Icon name="users" size={26} /></span>
          <b>Staff</b>
          <small>Opportunity event staff: buy tickets from the organizer, sell to customers and grow your team.</small>
          <span className="pt-go">Staff sign in <Icon name="chevR" size={16} /></span>
        </Link>
        <Link to={adminSession.token() ? '/admin' : '/admin/login'} className="pt-card">
          <span className="pt-ic"><Icon name="shield" size={26} /></span>
          <b>Admin</b>
          <small>BEE-OAK administrators: review creator KYC, manage events and users, track bookings and payments.</small>
          <span className="pt-go">Admin sign in <Icon name="chevR" size={16} /></span>
        </Link>
      </div>
    </PortalShell>
  );
}

function StaffLogin() {
  const { notify } = useApp();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (staffSession.token()) return <Navigate to="/staff" replace />;
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      let d;
      try { d = await staffLogin(id, pw); } catch (staffErr) {
        // Admin credentials entered here → sign in as admin and open the admin dashboard.
        try { const a = await adminLogin(id, pw); notify(`Signed in as ${a.role || 'admin'}`); nav('/admin', { replace: true }); return; } catch { throw staffErr; }
      }
      notify(`Welcome back, ${String(d.user?.name || 'there').split(' ')[0]}`);
      nav(d.memberships.length === 1 ? `/staff/m/${d.memberships[0].memberId}` : '/staff', { replace: true });
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };
  return (
    <PortalShell>
      <form className="pt-form" onSubmit={submit} noValidate>
        <Link to="/" className="pt-back"><Icon name="chevL" size={16} /> All partners</Link>
        <span className="pt-ic"><Icon name="users" size={24} /></span>
        <h1>Staff sign in</h1>
        <p>Use the account you registered with through your event’s recruitment link.</p>
        <div className="field">
          <label htmlFor="s-id">Email or mobile number</label>
          <input id="s-id" className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="s-pw">Password</label>
          <div className="pw-wrap">
            <input id="s-pw" className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ paddingRight: 64 }} />
            <button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </div>
        {err && <div className="alert err"><Icon name="info" />{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !id || !pw}>{busy && <span className="spinner" />}Sign in to staff dashboard</button>
        <p className="muted pt-note">New staff? Open the recruitment link your organizer or team lead shared to create your staff account.</p>
      </form>
    </PortalShell>
  );
}

export default function PortalApp() {
  return (
    <Routes>
      <Route index element={<PortalHome />} />
      <Route path="creator" element={<CreatorLayout />}>
        <Route index element={<CreatorDashboard />} />
        <Route path="events" element={<CreatorEvents />} />
        <Route path="create" element={<CreateEvent />} />
        <Route path="revenue" element={<CreatorRevenue />} />
        <Route path="scanner" element={<Scanner />} />
        <Route path="staff" element={<Staff />} />
        <Route path="opportunity/:id" element={<OppManage />} />
        <Route path="*" element={<CreatorDashboard />} />
      </Route>
      <Route path="staff/login" element={<StaffLogin />} />
      <Route path="admin/login" element={<PortalShell><AdminLogin /></PortalShell>} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="creators" element={<AdminCreators />} />
        <Route path="events" element={<AdminEvents />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="payments" element={<AdminPayments />} />
      </Route>
      <Route path="staff" element={<StaffLayout />}>
        <Route index element={<StaffHome />} />
        <Route path="m/:memberId" element={<StaffDashboard />} />
      </Route>
      {/* Staff recruitment link + PayU return for staff ticket purchases */}
      <Route path="opportunity/event/:id/join" element={<PortalShell><StaffJoin /></PortalShell>} />
      <Route path="payment/return" element={<PortalShell><PaymentReturn /></PortalShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
