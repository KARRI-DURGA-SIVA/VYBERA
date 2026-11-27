import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { adminCheck, adminFileUrl, adminLogin, adminSession, adminSnapshot, setCreatorStatus, setDocumentStatus, setEventStatus, setUserStatus } from '../../lib/admin';
import { fmtDate, fmtINR } from '../../lib/utils';

// BEE-OAK admin dashboard (partners portal). Uses the server's existing /admin/* endpoints.
const money = (n) => (Number(n || 0) === 0 ? '₹0' : fmtINR(n));
const num = (n) => Number(n || 0).toLocaleString('en-IN');
const when = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const tone = (s) => {
  const v = String(s || '').toLowerCase();
  if (/approved|active|live|success|verified|upcoming|confirmed/.test(v)) return 'ok';
  if (/pending|paused/.test(v)) return 'warn';
  if (/reject|suspend|block|fail|cancel/.test(v)) return 'bad';
  return '';
};
const Pill = ({ s }) => <span className={`ad-pill ${tone(s)}`}>{s || '—'}</span>;

/* ------------------------------------------------------------------ login */
export function AdminLogin() {
  const nav = useNavigate();
  const { notify } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (adminSession.token()) return <Navigate to="/admin" replace />;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const a = await adminLogin(email, pw); notify(`Signed in as ${a.role || 'admin'}`); nav('/admin', { replace: true }); } catch (ex) { setErr(ex.message); setBusy(false); }
  };
  return (
    <form className="pt-form" onSubmit={submit} noValidate>
      <Link to="/" className="pt-back"><Icon name="chevL" size={16} /> All partners</Link>
      <span className="pt-ic"><Icon name="shield" size={24} /></span>
      <h1>Admin sign in</h1>
      <p>For BEE-OAK administrators only.</p>
      <div className="field"><label htmlFor="a-em">Admin email</label><input id="a-em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></div>
      <div className="field"><label htmlFor="a-pw">Password</label>
        <div className="pw-wrap"><input id="a-pw" className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ paddingRight: 64 }} /><button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button></div>
      </div>
      {err && <div className="alert err"><Icon name="info" />{err}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email || !pw}>{busy && <span className="spinner" />}Sign in to admin dashboard</button>
    </form>
  );
}

/* ----------------------------------------------------------------- layout */
const NAV = [['', 'grid', 'Overview'], ['creators', 'spark', 'Creators & KYC'], ['events', 'cal', 'Events'], ['users', 'users', 'Users'], ['bookings', 'ticket', 'Bookings'], ['payments', 'card', 'Payments']];

export function AdminLayout() {
  const { toast, notify } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const admin = adminSession.admin();
  const load = useCallback(async () => {
    setErr('');
    try { setData(await adminSnapshot()); } catch (e) { if (e.status === 401) nav('/admin/login', { replace: true }); else setErr(e.message); }
  }, [nav]);
  useEffect(() => { if (adminSession.token()) { adminCheck().catch(() => {}); load(); } }, [load]);
  if (!adminSession.token()) return <Navigate to="/admin/login" replace />;
  const signOut = () => { adminSession.clear(); notify('Signed out of admin'); nav('/admin/login', { replace: true }); };
  return (
    <div className="cr-shell ad">
      <header className="cr-top">
        <div className="cr-top-in">
          <Link to="/" className="brand"><img src="/logo.png" alt="" /><span className="brand-name">BEE<b>·</b>OAK</span></Link>
          <span className="cr-mode"><Icon name="shield" size={14} /> Admin</span>
          <div className="cr-top-right">
            <button className="btn btn-ghost btn-sm" onClick={load}><Icon name="spark" size={14} /> Refresh</button>
            <span className="user-chip" style={{ cursor: 'default' }}><span className="avatar gold">{String(admin?.name || 'A').slice(0, 1)}</span><span>{admin?.role || 'Admin'}</span></span>
            <button className="btn btn-ghost btn-sm" onClick={signOut}><Icon name="logout" size={14} /> Sign out</button>
          </div>
        </div>
      </header>
      <div className="cr-body">
        <aside className="cr-side">
          <nav>{NAV.map(([to, ic, label]) => <NavLink key={label} to={`/admin${to ? `/${to}` : ''}`} end={!to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={ic} size={18} /> {label}</NavLink>)}</nav>
        </aside>
        <main className="cr-main">
          {err && <div className="alert err" style={{ marginBottom: 16 }}><Icon name="info" />{err}</div>}
          {!data ? <div className="app-loader" style={{ minHeight: 360 }}><span className="app-loader-logo"><img src="/logo.png" alt="" /></span><span className="app-loader-bar" /></div> : <Outlet context={{ data, reload: load, notify, isSuper: !!admin?.isSuperAdmin }} />}
        </main>
      </div>
      {toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}
    </div>
  );
}

const useAdmin = () => useOutletContext();
function useSearch(rows, keys) {
  const [q, setQ] = useState('');
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return !s ? rows : rows.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(s))); }, [rows, q, keys]);
  return [q, setQ, list];
}
const Head = ({ title, sub, q, setQ }) => (
  <div className="ad-head">
    <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    {setQ && <label className="ad-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search" /></label>}
  </div>
);
function act(fn, reload, notify, okMsg) {
  return async (...args) => {
    try { await fn(...args); notify(okMsg); await reload(); } catch (e) { notify(e.message, 'err'); }
  };
}

/* --------------------------------------------------------------- overview */
export function AdminOverview() {
  const { data } = useAdmin();
  const revenue = data.bookings.reduce((s, b) => s + Number(b.total || 0), 0);
  const tickets = data.bookings.reduce((s, b) => s + Number(b.qty || 0), 0);
  const pendingKyc = data.creators.filter((c) => /pending/i.test(c.status)).length;
  const live = data.events.filter((e) => e.status === 'live').length;
  const paid = data.payments.filter((p) => p.verified && /success/i.test(p.status)).length;
  return (
    <>
      <Head title="Overview" sub="Everything happening on BEE-OAK." />
      <div className="kpis" style={{ marginTop: 0 }}>
        <div className="kpi"><small>Gross bookings</small><b>{money(revenue)}</b><i>{num(tickets)} tickets</i></div>
        <div className="kpi"><small>Users</small><b>{num(data.buyers.length)}</b><i>registered buyers</i></div>
        <div className="kpi"><small>Creators</small><b>{num(data.creators.length)}</b><i>{pendingKyc ? `${pendingKyc} awaiting KYC` : 'KYC up to date'}</i></div>
        <div className="kpi"><small>Events</small><b>{num(data.events.length)}</b><i>{live} live</i></div>
      </div>
      <div className="dash-grid">
        <div className="panel">
          <h3>Latest bookings</h3>
          <div className="ad-list">{data.bookings.slice(0, 8).map((b) => <div key={b.id}><span><b>{b.eventName}</b><small>{b.buyer} · {b.qty} × {b.ticketType}</small></span><span className="ad-r"><b>{money(b.total)}</b><small>{when(b.bookedAt)}</small></span></div>)}{!data.bookings.length && <p className="muted">No bookings yet.</p>}</div>
        </div>
        <div className="panel">
          <h3>Needs attention</h3>
          <div className="ad-list">
            {data.creators.filter((c) => /pending/i.test(c.status)).slice(0, 6).map((c) => <Link key={c.id} to="/admin/creators"><span><b>{c.name}</b><small>KYC pending · {c.documents.length} document{c.documents.length === 1 ? '' : 's'}</small></span><Icon name="chevR" size={16} /></Link>)}
            <div><span><b>{num(paid)}</b><small>verified payments</small></span></div>
            {!pendingKyc && <p className="muted">No creators waiting for KYC review.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- creators */
const KYC_TABS = ['Pending', 'Approved', 'Rejected', 'Suspended', 'All'];
export function AdminCreators() {
  const { data, reload, notify, isSuper } = useAdmin();
  const [tab, setTab] = useState(() => (data.creators.some((c) => /pending/i.test(c.status)) ? 'Pending' : 'All'));
  const inTab = useMemo(() => (tab === 'All' ? data.creators : data.creators.filter((c) => String(c.status).toLowerCase() === tab.toLowerCase())), [data.creators, tab]);
  const [q, setQ, list] = useSearch(inTab, ['name', 'email', 'phone', 'category', 'status']);
  const [open, setOpen] = useState(null);
  const count = (t) => (t === 'All' ? data.creators.length : data.creators.filter((c) => String(c.status).toLowerCase() === t.toLowerCase()).length);
  const status = act((c, s) => setCreatorStatus(c.creatorId, s), reload, notify, 'Creator status updated');
  const doc = act((c, d, s) => setDocumentStatus(c.creatorId, d.id, s), reload, notify, 'Document updated');
  const verifyAll = act(async (c) => { for (const d of c.documents) if (d.verificationStatus !== 'Verified') await setDocumentStatus(c.creatorId, d.id, 'Verified'); }, reload, notify, 'All documents verified');
  return (
    <>
      <Head title="Creators & KYC" sub="Review applications, verify KYC documents and give approved creators access to sign in." q={q} setQ={setQ} />
      <div className="ad-tabs" role="tablist">
        {KYC_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setOpen(null); }}>{t}<em>{count(t)}</em></button>)}
      </div>
      {!isSuper && <div className="alert" style={{ marginBottom: 14 }}><Icon name="info" />Only a super admin can approve creators or verify KYC documents.</div>}
      <div className="ad-table">
        <div className="ad-tr ad-th"><span>Creator</span><span>Category</span><span>Applied</span><span>Events</span><span>KYC</span><span /></div>
        {list.map((c) => {
          const verified = c.documents.filter((d) => d.verificationStatus === 'Verified').length;
          const allOk = c.documents.length > 0 && verified === c.documents.length;
          return (
            <div key={c.id} className="ad-tgroup">
              <div className="ad-tr">
                <span><b>{c.name}</b><small>{c.email}{c.phone ? ` · ${c.phone}` : ''}</small></span>
                <span>{c.category || '—'}</span><span>{when(c.createdAt)}</span><span>{num(c.events)}</span><span><Pill s={c.status} /></span>
                <span className="ad-actions"><button className={`btn btn-sm ${/pending/i.test(c.status) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Close' : /pending/i.test(c.status) ? 'Review' : 'Manage'}</button></span>
              </div>
              {open === c.id && (
                <div className="ad-detail">
                  <div className="ad-steps">
                    <span className="done">1 · Applied {when(c.createdAt)}</span>
                    <span className={allOk ? 'done' : ''}>2 · Documents verified ({verified}/{c.documents.length})</span>
                    <span className={/approved/i.test(c.status) ? 'done' : ''}>3 · {/approved/i.test(c.status) ? 'Approved — can sign in' : 'Approve to allow sign-in'}</span>
                  </div>
                  <div className="ad-doc-h"><b>KYC documents</b>{isSuper && c.documents.length > 0 && !allOk && <button className="btn btn-ghost btn-sm" onClick={() => verifyAll(c)}>Verify all documents</button>}</div>
                  {c.documents.length ? c.documents.map((d) => (
                    <div key={d.id} className="ad-doc">
                      <span><b>{String(d.documentType || 'Document').toUpperCase()}</b><small>{d.fileName} · {when(d.createdAt)}</small></span>
                      <Pill s={d.verificationStatus} />
                      {d.url && <a className="btn btn-ghost btn-sm" href={adminFileUrl(d.url)} target="_blank" rel="noreferrer">View</a>}
                      {isSuper && (d.verificationStatus === 'Verified'
                        ? <button className="btn btn-ghost btn-sm" onClick={() => doc(c, d, 'Pending')}>Mark pending</button>
                        : <button className="btn btn-primary btn-sm" onClick={() => doc(c, d, 'Verified')}>Verify</button>)}
                    </div>
                  )) : <p className="muted">No documents submitted.</p>}
                  {isSuper && (
                    <div className="ad-btns">
                      <button className="btn btn-primary btn-sm" disabled={!allOk || /approved/i.test(c.status)} title={allOk ? '' : 'Verify every document first'} onClick={() => status(c, 'Approved')}>Approve & give access</button>
                      {!/pending/i.test(c.status) && <button className="btn btn-ghost btn-sm" onClick={() => status(c, 'Pending')}>Set pending</button>}
                      {!/rejected/i.test(c.status) && <button className="btn btn-ghost btn-sm" onClick={() => status(c, 'Rejected')}>Reject</button>}
                      {!/suspended/i.test(c.status) && <button className="btn btn-ghost btn-sm ad-danger" onClick={() => status(c, 'Suspended')}>Suspend</button>}
                      {!allOk && <small className="muted">Verify every document to enable approval.</small>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="muted ad-empty">{tab === 'Pending' ? 'No applications waiting for review.' : 'No creators match.'}</p>}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- events */
export function AdminEvents() {
  const { data, reload, notify } = useAdmin();
  const [q, setQ, list] = useSearch(data.events, ['name', 'creatorName', 'city', 'venue', 'category', 'status', 'id']);
  const set = act((e, s) => setEventStatus(e.id, s), reload, notify, 'Event status updated');
  return (
    <>
      <Head title="Events" sub={`${num(data.events.length)} events`} q={q} setQ={setQ} />
      <div className="ad-table">
        <div className="ad-tr ad-th"><span>Event</span><span>Date</span><span>Sold</span><span>Revenue</span><span>Status</span><span /></div>
        {list.map((e) => (
          <div key={e.id} className="ad-tr">
            <span><b>{e.name}</b><small>{e.creatorName} · {[e.venue, e.city].filter(Boolean).join(', ')}</small></span>
            <span>{when(e.date)}</span><span>{num(e.bookingCount)}</span><span>{money(e.revenue)}</span><span><Pill s={e.status} /></span>
            <span className="ad-actions">
              <select className="select ad-select" value="" onChange={(ev) => ev.target.value && set(e, ev.target.value)} aria-label={`Change status of ${e.name}`}>
                <option value="">Change…</option>
                {['live', 'paused', 'blocked', 'completed', 'cancelled'].filter((s) => s !== e.status).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </span>
          </div>
        ))}
        {!list.length && <p className="muted ad-empty">No events match.</p>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ users */
export function AdminUsers() {
  const { data, reload, notify } = useAdmin();
  const [q, setQ, list] = useSearch(data.buyers, ['name', 'email', 'city', 'status', 'id']);
  const set = act((u, s) => setUserStatus(u.id, s), reload, notify, 'User status updated');
  return (
    <>
      <Head title="Users" sub={`${num(data.buyers.length)} registered users`} q={q} setQ={setQ} />
      <div className="ad-table">
        <div className="ad-tr ad-th"><span>User</span><span>City</span><span>Bookings</span><span>Joined</span><span>Status</span><span /></div>
        {list.map((u) => (
          <div key={u.id} className="ad-tr">
            <span><b>{u.name}</b><small>{u.email}</small></span><span>{u.city || '—'}</span><span>{num(u.bookings)}</span><span>{when(u.createdAt)}</span><span><Pill s={u.status} /></span>
            <span className="ad-actions">{/suspend/i.test(u.status)
              ? <button className="btn btn-ghost btn-sm" onClick={() => set(u, 'Active')}>Reactivate</button>
              : <button className="btn btn-ghost btn-sm ad-danger" onClick={() => set(u, 'Suspended')}>Suspend</button>}</span>
          </div>
        ))}
        {!list.length && <p className="muted ad-empty">No users match.</p>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- bookings */
export function AdminBookings() {
  const { data } = useAdmin();
  const [q, setQ, list] = useSearch(data.bookings, ['id', 'eventName', 'buyer', 'buyerEmail', 'ticketType', 'status']);
  return (
    <>
      <Head title="Bookings" sub={`${num(data.bookings.length)} bookings`} q={q} setQ={setQ} />
      <div className="ad-table">
        <div className="ad-tr ad-th"><span>Booking</span><span>Ticket</span><span>Qty</span><span>Total</span><span>Status</span><span>Booked</span></div>
        {list.map((b) => (
          <div key={b.id} className="ad-tr">
            <span><b>{b.eventName}</b><small className="mono">{b.id} · {b.buyer}</small></span><span>{b.ticketType}</span><span>{num(b.qty)}</span><span>{money(b.total)}</span><span><Pill s={b.status} /></span><span>{when(b.bookedAt)}</span>
          </div>
        ))}
        {!list.length && <p className="muted ad-empty">No bookings match.</p>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- payments */
export function AdminPayments() {
  const { data } = useAdmin();
  const [q, setQ, list] = useSearch(data.payments, ['txnid', 'bookingId', 'buyerEmail', 'status', 'gatewayPaymentId']);
  return (
    <>
      <Head title="Payments" sub={`${num(data.payments.length)} transactions`} q={q} setQ={setQ} />
      <div className="ad-table">
        <div className="ad-tr ad-th"><span>Transaction</span><span>Buyer</span><span>Amount</span><span>Status</span><span>Verified</span><span>Updated</span></div>
        {list.map((p) => (
          <div key={p.txnid} className="ad-tr">
            <span><b className="mono">{p.txnid}</b><small>{p.gatewayPaymentId ? `PayU ${p.gatewayPaymentId}` : p.error || ''}</small></span><span>{p.buyerEmail || '—'}</span><span>{money(p.amount)}</span><span><Pill s={p.status} /></span><span>{p.verified ? <Pill s="Verified" /> : <Pill s="Pending" />}</span><span>{when(p.updatedAt)}</span>
          </div>
        ))}
        {!list.length && <p className="muted ad-empty">No payments match.</p>}
      </div>
    </>
  );
}
