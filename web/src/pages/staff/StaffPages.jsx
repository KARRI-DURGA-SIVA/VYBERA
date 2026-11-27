import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { PENDING_PAY, mediaUrl, simulatePayment, startPayment, storage, submitPayU, confirmBooking } from '../../lib/api';
import { customerLink, recruitLink, staffAllocate, staffConfirmPurchase, staffDashboard, staffInvite, staffPurchase, staffRegister, staffSession, staffTeamMember } from '../../lib/staff';
import { fmtDate, fmtINR } from '../../lib/utils';
import { PageLoader } from '../Details';
import { STAFF_LOGIN, appUrl } from '../../lib/env';
import HubShell from '../../components/HubShell';

const money = (n) => (Number(n || 0) === 0 ? '₹0' : fmtINR(n));
const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/* ---------------------------------------------------------------- layout */
export function StaffLayout() {
  const { toast, notify } = useApp();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  if (!staffSession.token()) return <Navigate to={STAFF_LOGIN} replace />;
  const user = staffSession.user();
  const list = staffSession.memberships();
  const m = pathname.match(/\/staff\/m\/([^/]+)/);
  const cur = m ? list.find((x) => String(x.memberId) === m[1]) : null;
  const groups = [
    ['Main menu', [
      ...(cur ? [{ to: `/staff/m/${cur.memberId}`, label: 'Dashboard', icon: 'grid', end: true }] : []),
      { to: '/staff', label: 'My events', icon: 'cal', end: true, badge: list.length },
    ]],
    ...(cur ? [['Selling', [
      { hash: 'buy', label: 'Buy tickets', icon: 'ticket' },
      { hash: 'share', label: 'Share & grow', icon: 'spark' },
      { hash: 'bookings', label: 'Customer bookings', icon: 'file' },
    ]], ['Team', [
      { hash: 'team', label: 'Below-staff progress', icon: 'users' },
      { hash: 'payments', label: 'Purchases & settlements', icon: 'card' },
    ]]] : []),
  ];
  const footer = cur ? (
    <div className="oh-credits">
      <div className="oh-credits-h"><span>Your staff ID</span><b>{cur.staffCode}</b></div>
      <p>{cur.eventName}</p>
      <Link to="/staff" className="oh-up"><Icon name="cal" size={16} /> {list.length > 1 ? 'Switch event' : 'My events'}</Link>
    </div>
  ) : null;
  return (
    <HubShell title="Staff hub" user={user} role={cur ? `Staff · ${cur.staffCode}` : 'Opportunity staff'} groups={groups} footer={footer} storeKey="beeoak.web.staffSide"
      onSignOut={() => { staffSession.clear(); notify('Signed out of staff mode'); nav(STAFF_LOGIN); }}
      subtitle={toast && <div className={`toast ${toast.tone === 'err' ? 'err' : ''}`} role="status"><span className="dot" />{toast.message}</div>}>
      <Outlet />
    </HubShell>
  );
}

/* ------------------------------------------------- membership selection */
export function StaffHome() {
  const list = staffSession.memberships();
  if (list.length === 1) return <Navigate to={`/staff/m/${list[0].memberId}`} replace />;
  return (
    <>
      <div className="cr-head"><div><h1>Choose an event</h1><p>You’re a staff member on {list.length} Opportunity events.</p></div></div>
      <div className="member-grid">
        {list.map((m) => (
          <Link key={m.memberId} to={`/staff/m/${m.memberId}`} className="member-card">
            <span className="mc-img">{m.eventBanner ? <img src={mediaUrl(m.eventBanner)} alt="" /> : null}</span>
            <span><b>{m.eventName}</b><small>{fmtDate(m.eventDate)} · Staff ID <span className="mono">{m.staffCode}</span></small></span>
            <Icon name="chevR" />
          </Link>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------- share (QR) */
function ShareCard({ title, sub, url, whatsappText }) {
  const [qr, setQr] = useState('');
  const { notify } = useApp();
  useEffect(() => { QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#04331F', light: '#FFFFFF' } }).then(setQr).catch(() => {}); }, [url]);
  return (
    <div className="share-card">
      {qr && <img src={qr} alt={`QR code for ${title}`} />}
      <div className="share-body">
        <b>{title}</b><small>{sub}</small>
        <div className="share-url mono" title={url}>{url}</div>
        <div className="share-actions">
          <button className="btn btn-primary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(url); notify('Link copied'); } catch { notify(url); } }}><Icon name="share" size={14} /> Copy link</button>
          <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${whatsappText} ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          {qr && <a className="btn btn-ghost btn-sm" href={qr} download={`${title.replace(/\W+/g, '-')}.png`}><Icon name="download" size={14} /> QR</a>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------- payment helper (staff) */
function usePay(onPaid) {
  const [sim, setSim] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notify } = useApp();
  const start = async (txnid, amount, returnPath) => {
    const p = await startPayment(txnid, staffSession.token(), appUrl('/payment/return'));
    if (p.mode === 'simulator') { setSim({ txnid, amount }); return; }
    storage.set(PENDING_PAY, { kind: 'purchase', id: txnid, returnPath });
    submitPayU(p.action, p.fields);
  };
  const modal = sim && (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Test payment" style={{ maxWidth: 460, textAlign: 'center' }}>
        <span className="eyebrow">Test payment gateway</span>
        <h2 style={{ margin: '8px 0 6px' }}>{money(sim.amount)}</h2>
        <p className="muted" style={{ fontSize: 14 }}>Payment simulator (local server). The server records and verifies it like a PayU callback.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await simulatePayment(sim.txnid, staffSession.token()); await onPaid(sim.txnid); } catch (e) { notify(e.message, 'err'); }
            setSim(null); setBusy(false);
          }}>{busy && <span className="spinner" />}Pay {money(sim.amount)}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={async () => { await simulatePayment(sim.txnid, staffSession.token(), 'fail').catch(() => {}); setSim(null); notify('Payment failed — no tickets were transferred', 'err'); }}>Simulate failed payment</button>
        </div>
      </div>
    </div>
  );
  return { start, modal };
}

/* ---------------------------------------------------------- dashboard */
export function StaffDashboard() {
  const { memberId } = useParams();
  const [params, setParams] = useSearchParams();
  const { notify } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [alloc, setAlloc] = useState(null);
  const load = useCallback(async () => {
    try { const x = await staffDashboard(memberId); setD(x); setErr(''); } catch (e) { setErr(e.message); }
  }, [memberId]);
  useEffect(() => { load(); }, [load]);

  const confirmPurchase = useCallback(async (pid) => {
    await staffConfirmPurchase(memberId, pid);
    notify('Payment verified — tickets added to your stock');
    await load();
  }, [memberId, notify, load]);
  const pay = usePay(confirmPurchase);
  // Returning from PayU
  useEffect(() => {
    const pid = params.get('purchase');
    if (!pid) return;
    setParams({}, { replace: true });
    confirmPurchase(pid).catch((e) => notify(e.message, 'err'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="empty"><div className="ic"><Icon name="lock" size={26} /></div><h3>Can’t open this dashboard</h3><p>{err}</p><Link to="/staff" className="btn btn-primary">Back</Link></div>;
  if (!d) return <PageLoader />;
  const { me, event, settings } = d;
  const p = me.progress;
  const team = d.team;
  const baseDepth = me.depth;


  return (
    <>
      <div className="staff-hero">
        <div>
          <span className="eyebrow">Staff progress · {event.name}</span>
          <h1>{me.name}</h1>
          <div className="staff-ids">
            <span>Staff ID <b className="mono">{me.staffCode}</b></span>
            <span>Event ID <b className="mono">{event.id}</b></span>
            <span>Parent <b className="mono">{me.parentStaffCode || 'Organizer'}</b></span>
            <span>{fmtDate(event.date)} · {event.venue}, {event.city}</span>
          </div>
        </div>
        <div className="ring" style={{ '--p': p.progress }}><b>{p.progress}%</b><small>sold</small></div>
      </div>

      <div className="kpis kpis-6">
        {[['Allocated', p.allocated], ['Purchased', p.purchased], ['Sold', p.sold], ['Remaining', p.remaining], ['Sales amount', money(p.salesAmount)], ['Bookings', p.bookingCount]].map(([l, v]) => (
          <div key={l} className="kpi"><small>{l}</small><b>{v}</b></div>
        ))}
      </div>
      <div className="pay-status"><Icon name="card" size={16} /> Payment status: <b>{p.paymentStatus}</b>{p.purchasePaid ? ` · ₹${p.purchasePaid.toLocaleString('en-IN')} paid to ${me.isPrimary ? 'organizer' : 'parent staff'}` : ''}{p.downstreamReceived ? ` · ₹${p.downstreamReceived.toLocaleString('en-IN')} received from your team` : ''}</div>

      <div className="dash-grid">
        <div id="share" className="panel">
          <h3>Share & grow</h3>
          <ShareCard title="Customer booking link" sub="Customers who book through this link are credited to you." url={customerLink(event.id, me.referralCode)} whatsappText={`Book ${event.name} on BEE-OAK through me:`} />
          {settings.canRecruit && <ShareCard title="Staff recruitment link" sub={`Invite people to join under you (max ${settings.maxDirectRecruits} direct recruits).`} url={recruitLink(event.id, { ref: me.referralCode })} whatsappText={`Join my team for ${event.name} on BEE-OAK:`} />}
        </div>
        <div id="buy" className="panel">
          <div className="panel-h"><h3>Buy tickets</h3><span className="muted" style={{ fontSize: 13 }}>from {me.isPrimary ? 'the organizer' : `${me.parentName || 'your parent staff'}`}</span></div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: -6, marginBottom: 14 }}>Buy tickets, pay {me.isPrimary ? 'the organizer' : 'your parent staff'}, then sell them to customers through your profile and links.</p>
          <div className="buy-list">
            {(d.buyable || []).map((t) => (
              <BuyRow key={t.tierName} t={t} mine={d.stock[t.tierName] || 0} settings={settings} onBuy={async (qty) => {
                try {
                  const r = await staffPurchase(memberId, { tierName: t.tierName, qty });
                  if (r.purchase.status === 'paid') { notify('Tickets added to your stock'); load(); return; }
                  await pay.start(r.purchase.id, r.purchase.total, `/staff/m/${memberId}`);
                } catch (ex) { notify(ex.message, 'err'); }
              }} />
            ))}
          </div>
          {d.allocations.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Allocation from {me.isPrimary ? 'organizer' : 'parent staff'}: {d.allocations.map((a) => `${a.tierName} ${a.qty} @ ${money(a.unitPrice)}`).join(' · ')}</p>}
        </div>
      </div>

      <div id="team" className="panel" style={{ marginTop: 24 }}>
        <div className="panel-h"><h3>Below-staff progress</h3><span className="muted" style={{ fontSize: 13 }}>{team.length} member{team.length === 1 ? '' : 's'} in your downline</span></div>
        {team.length ? (
          <div className="team-table">
            <div className="tt-head"><span>Staff</span><span>Purchased</span><span>Sold</span><span>Remaining</span><span>Sales</span><span>Progress</span><span /></div>
            {team.map((t) => (
              <div key={t.id} className="tt-row">
                <span className="tt-name" style={{ paddingLeft: (t.depth - baseDepth - 1) * 22 }}>
                  {t.depth - baseDepth > 1 && <i className="tt-branch" />}
                  <span className="avatar sm">{initials(t.name)}</span>
                  <span><b>{t.name}</b><small className="mono">{t.staffCode}{t.isDirect ? ' · direct' : ''}</small></span>
                </span>
                <span>{t.progress.purchased}</span><span>{t.progress.sold}</span><span>{t.progress.remaining}</span><span>{money(t.progress.salesAmount)}</span>
                <span className="bar-track"><i style={{ width: `${t.progress.progress}%` }} /></span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {t.isDirect && <button className="btn btn-ghost btn-sm" onClick={() => setAlloc({ staff: t, tierName: event.tiers[0]?.name, qty: '', unitPrice: event.tiers[0]?.price ?? 0 })}>Allocate</button>}
                  <button className="icon-btn sm" aria-label={`View ${t.name}`} onClick={async () => { try { setDetail(await staffTeamMember(memberId, t.id)); } catch (e) { notify(e.message, 'err'); } }}><Icon name="chevR" size={15} /></button>
                </span>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ fontSize: 14 }}>No one has joined under you yet. Share your recruitment link to build your team.</p>}
      </div>

      <div className="dash-grid">
        <div id="bookings" className="panel">
          <h3>Customer bookings through you</h3>
          {d.bookings.length ? d.bookings.map((b) => <div key={b.id} className="line-item"><span>{b.buyer} · {b.tier} × {b.qty}</span><b>{money(b.amount)}</b></div>) : <p className="muted" style={{ fontSize: 14 }}>No bookings yet — share your customer link.</p>}
        </div>
        <div id="payments" className="panel">
          <h3>Purchases & settlements</h3>
          {d.purchases.length ? d.purchases.map((x) => (
            <div key={x.id} className="line-item"><span>{x.direction === 'bought' ? `Bought from ${x.counterparty}` : `Sold to ${x.counterparty}`} · {x.qty} {x.tierName}</span><b>{money(x.total)} <span className={`status ${x.status === 'paid' ? 'up' : 'sbx'}`}>{x.status === 'paid' ? 'Paid' : 'Pending'}</span></b></div>
          )) : <p className="muted" style={{ fontSize: 14 }}>No ticket purchases yet.</p>}
        </div>
      </div>

      {detail && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`${detail.staff.name} progress`}>
            <div className="modal-head"><div><span className="eyebrow mono">{detail.staff.staffCode}</span><h2>{detail.staff.name}</h2></div><button className="icon-btn" onClick={() => setDetail(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="kpis" style={{ marginTop: 0, gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              {[['Purchased', detail.staff.progress.purchased], ['Sold', detail.staff.progress.sold], ['Remaining', detail.staff.progress.remaining], ['Sales', money(detail.staff.progress.salesAmount)]].map(([l, v]) => <div key={l} className="kpi"><small>{l}</small><b style={{ fontSize: 24 }}>{v}</b></div>)}
            </div>
            <h3 style={{ margin: '20px 0 8px' }}>Their team</h3>
            {detail.team.length ? detail.team.map((t) => <div key={t.id} className="line-item"><span>{t.name} <small className="mono">{t.staffCode}</small></span><b>{t.progress.sold} sold · {money(t.progress.salesAmount)}</b></div>) : <p className="muted" style={{ fontSize: 14 }}>No recruits yet.</p>}
            <h3 style={{ margin: '20px 0 8px' }}>Bookings</h3>
            {detail.bookings.length ? detail.bookings.map((b) => <div key={b.id} className="line-item"><span>{b.buyer} · {b.tier} × {b.qty}</span><b>{money(b.amount)}</b></div>) : <p className="muted" style={{ fontSize: 14 }}>No bookings yet.</p>}
          </div>
        </div>
      )}
      {alloc && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setAlloc(null); }}>
          <form className="modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label="Allocate tickets" onSubmit={async (e) => {
            e.preventDefault();
            try { await staffAllocate(memberId, { staffId: alloc.staff.id, tierName: alloc.tierName, qty: Number(alloc.qty), unitPrice: Number(alloc.unitPrice) }); notify(`Allocated ${alloc.qty} tickets to ${alloc.staff.name}`); setAlloc(null); load(); } catch (ex) { notify(ex.message, 'err'); }
          }}>
            <div className="modal-head"><div><span className="eyebrow">Allocate tickets</span><h2>{alloc.staff.name}</h2></div><button type="button" className="icon-btn" onClick={() => setAlloc(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="form-grid">
              <div className="field full"><label htmlFor="al-tier">Ticket category</label><select id="al-tier" className="input select" style={{ height: 50 }} value={alloc.tierName} onChange={(e) => setAlloc({ ...alloc, tierName: e.target.value })}>{event.tiers.map((t) => <option key={t.name}>{t.name}</option>)}</select></div>
              <div className="field"><label htmlFor="al-qty">Ticket quota</label><input id="al-qty" className="input" type="number" min="0" value={alloc.qty} onChange={(e) => setAlloc({ ...alloc, qty: e.target.value })} /></div>
              <div className="field"><label htmlFor="al-price">Price they pay you (per ticket)</label><input id="al-price" className="input" type="number" min="0" value={alloc.unitPrice} onChange={(e) => setAlloc({ ...alloc, unitPrice: e.target.value })} /></div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Your recruits buy tickets from your stock within this quota. You can only allocate up to your own allocation.</p>
            <div className="wiz-foot"><button type="button" className="btn btn-ghost" onClick={() => setAlloc(null)}>Cancel</button><button className="btn btn-primary">Save allocation</button></div>
          </form>
        </div>
      )}
      {pay.modal}
    </>
  );
}

function BuyRow({ t, mine, settings, onBuy }) {
  const max = Math.min(t.canBuy, settings.maxPurchase);
  const [qty, setQty] = useState(Math.min(Math.max(settings.minPurchase, 10), Math.max(settings.minPurchase, max)));
  const [busy, setBusy] = useState(false);
  const q = Math.min(Math.max(Number(qty) || 0, 0), Math.max(max, 0));
  return (
    <div className={`buy-row${max < settings.minPurchase ? ' off' : ''}`}>
      <div className="br-info">
        <b>{t.tierName}</b>
        <small>{t.perks ? `${t.perks} · ` : ''}{money(t.price)} per ticket{t.price !== t.ticketPrice ? ` (customer price ${money(t.ticketPrice)})` : ''}</small>
        <span className="br-stats"><span><b>{t.available}</b> available</span><span><b>{mine}</b> in your stock</span>{t.quotaLeft !== null && <span><b>{t.quotaLeft}</b> quota left</span>}</span>
      </div>
      {max >= settings.minPurchase ? (
        <div className="br-buy">
          <input className="input" type="number" min={settings.minPurchase} max={max} value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Quantity of ${t.tierName}`} />
          <button className="btn btn-primary btn-sm" disabled={busy || q < settings.minPurchase} onClick={async () => { setBusy(true); await onBuy(q); setBusy(false); }}>
            {busy ? <span className="spinner" /> : null}Buy & pay {money(q * t.price)}
          </button>
        </div>
      ) : <span className="status past">Sold out</span>}
    </div>
  );
}

/* --------------------------------------------- recruitment join page */
export function StaffJoin() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { notify } = useApp();
  const nav = useNavigate();
  const ref = params.get('ref'); const code = params.get('code');
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [photo, setPhoto] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { staffInvite(id, { ref, code }).then(setInv).catch((e) => setErr(e.message)); }, [id, ref, code]);

  const up = (k) => (e) => { setF({ ...f, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: '' }); };
  const join = async (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Enter a valid email';
    if (f.password.length < 8) er.password = 'Use at least 8 characters';
    setErrors(er);
    if (Object.values(er).some(Boolean)) return;
    setBusy(true);
    try {
      // Existing BEE-OAK accounts are linked (same email + password); new emails get an account.
      const r = await staffRegister({ eventId: id, ref: ref || undefined, code: code || undefined, photo: photo || undefined, ...f, email: f.email.trim() });
      staffSession.save({ user: { name: r.membership.name, email: f.email.trim() } });
      notify(`Welcome to the team — your Staff ID is ${r.membership.staffCode}`);
      nav(`/staff/m/${r.membership.memberId}`, { replace: true });
    } catch (ex) { notify(ex.message, 'err'); setBusy(false); }
  };
  const pickPhoto = (file) => { if (!file) return; const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(file); };

  if (err) return <div className="wrap section"><div className="empty"><div className="ic"><Icon name="lock" size={26} /></div><h3>Recruitment link not valid</h3><p>{err}</p><Link to="/opportunities" className="btn btn-primary">Browse Opportunity events</Link></div></div>;
  if (!inv) return <PageLoader />;
  const fe = (k) => errors[k] && <span className="field-err">{errors[k]}</span>;
  return (
    <div className="wrap" style={{ maxWidth: 1040, paddingTop: 40 }}>
      <div className="join-grid">
        <div className="join-event">
          {inv.event.banner && <img src={mediaUrl(inv.event.banner)} alt="" />}
          <div className="join-id"><span>Event ID</span><b className="mono">{inv.event.id}</b></div>
          <h1 style={{ fontSize: 34, margin: '12px 0 8px' }}>{inv.event.name}</h1>
          <p className="muted">{fmtDate(inv.event.date)} · {inv.event.venue}, {inv.event.city} · by {inv.event.organizer}</p>
          <div className="alert ok" style={{ marginTop: 16 }}><Icon name="users" /> {inv.parent ? <>You’re joining under <b>{inv.parent.name}</b> ({inv.parent.staffCode}).</> : <>You’re joining as primary staff, invited by the organizer.</>}</div>
          <p className="muted" style={{ fontSize: 14, marginTop: 14 }}>As staff you get your own Staff ID, a customer booking link and QR code, a progress dashboard and your own recruitment link.</p>
        </div>
        <form className="panel join-form" onSubmit={join} noValidate>
          <h3>Join with your BEE-OAK account</h3>
          <p className="muted" style={{ fontSize: 14, margin: '-6px 0 18px' }}>Already have a BEE-OAK account? Use the same email and password — it will be linked.</p>
          <div className="cr-form">
            <div className="field"><label htmlFor="j-name">Full name</label><input id="j-name" className={`input${errors.name ? ' err' : ''}`} value={f.name} onChange={up('name')} autoComplete="name" />{fe('name')}</div>
            <div className="form-grid">
              <div className="field"><label htmlFor="j-email">Email</label><input id="j-email" type="email" className={`input${errors.email ? ' err' : ''}`} value={f.email} onChange={up('email')} autoComplete="email" />{fe('email')}</div>
              <div className="field"><label htmlFor="j-phone">Phone</label><input id="j-phone" className="input" value={f.phone} onChange={up('phone')} inputMode="tel" autoComplete="tel-national" /></div>
            </div>
            <div className="field"><label htmlFor="j-pw">Password</label><input id="j-pw" type="password" className={`input${errors.password ? ' err' : ''}`} value={f.password} onChange={up('password')} placeholder="At least 8 characters" autoComplete="new-password" />{fe('password')}</div>
            <label className={`join-photo${photo ? ' on' : ''}`}>
              <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files[0])} />
              <span className="jp-img">{photo ? <img src={photo} alt="Profile preview" /> : <Icon name="user" size={20} />}</span>
              <span><b>Profile photo</b><small>{photo ? 'Photo added — click to change' : 'Optional · shown to customers on the event page'}</small></span>
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy && <span className="spinner" />}Join as staff <Icon name="arrowR" size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------ PayU return handler */
export function PaymentReturn() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState('Verifying your payment…');
  const pending = useMemo(() => storage.get(PENDING_PAY, null), []);
  useEffect(() => {
    const txnid = params.get('txnid') || pending?.id;
    const status = params.get('status');
    if (!txnid) { setMsg('No payment to verify.'); return; }
    storage.del(PENDING_PAY);
    if (status === 'failed') { setMsg('Payment failed or was cancelled. Nothing was charged for these tickets.'); return; }
    if (pending?.kind === 'purchase') { nav(`${pending.returnPath}?purchase=${encodeURIComponent(txnid)}`, { replace: true }); return; }
    confirmBooking(txnid).then((r) => nav(`/confirmation/${encodeURIComponent(r.booking.id)}`, { replace: true, state: { booking: r.booking } })).catch((e) => setMsg(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="wrap section"><div className="empty"><div className="ic"><Icon name="card" size={26} /></div><h3>{msg}</h3><Link to="/bookings" className="btn btn-primary">My bookings</Link></div></div>;
}
