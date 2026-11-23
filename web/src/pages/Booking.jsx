import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Poster } from '../components/EventCard';
import { useApp } from '../lib/store';
import {
  IS_SANDBOX, PENDING_PAY, computeTotals, confirmBooking, createBooking, eventInventory, eventStaff, mediaUrl,
  session, simulatePayment, startBooking, startPayment, storage, submitPayU,
  canPayUpiNative, payWithUpiApp, waitForPayment,
} from '../lib/api';
import { cityOf, displayName, fmtDate, fmtINR, isPast, tierRemaining } from '../lib/utils';
import { NotFoundEvent, PageLoader, useEvent } from './Details';
import { appUrl } from '../lib/env';

export const DRAFT_KEY = 'beeoak.web.draft';
export const MAX_QTY = 10;

export function Stepper({ step }) {
  const steps = ['Select tickets', 'Checkout', 'Confirmed'];
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'contents' }}>
          <div className={`step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}><i>{i < step ? '✓' : i + 1}</i><span>{s}</span></div>
          {i < steps.length - 1 && <div className="step-line" />}
        </div>
      ))}
    </div>
  );
}

// Used by the Checkout page (kept for older links).
export function Summary({ ev, tier, qty, staff, children }) {
  const t = computeTotals(tier?.price || 0, qty);
  return (
    <div className="panel">
      <div className="summary-ev">
        <div style={{ width: 72, height: 96, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0, background: 'var(--forest)' }}><Poster ev={ev} /></div>
        <div><b>{ev.name}</b><small>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ''}</small><small>{[ev.venue, cityOf(ev)].filter(Boolean).join(', ')}</small></div>
      </div>
      {staff && <div className="line-item"><span>Booking through</span><b>{staff.name} <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{staff.staffCode}</span></b></div>}
      {tier ? (
        <>
          <div className="line-item"><span>{tier.name} × {qty}</span><b>{t.subtotal === 0 ? 'Free' : fmtINR(t.subtotal)}</b></div>
          <div className="line-item"><span>Convenience fee ({t.feeRate}%)</span><b>{t.fee ? fmtINR(t.fee) : '—'}</b></div>
          <div className="line-item"><span>GST on fee ({t.gstRate}%)</span><b>{t.gst ? fmtINR(t.gst) : '—'}</b></div>
          <div className="line-total"><span>Total payable</span><span>{t.total === 0 ? 'Free' : fmtINR(t.total)}</span></div>
        </>
      ) : <p className="muted" style={{ fontSize: 14 }}>Select a ticket category to see your total.</p>}
      {children}
    </div>
  );
}

const METHODS = [
  { key: 'upi', label: 'Pay by any UPI app', ic: 'qr', title: 'Pay by any UPI app', items: [['qr', 'Scan QR or pay with UPI ID', 'GPay, PhonePe, Paytm, BHIM and all UPI apps']] },
  { key: 'card', label: 'Debit / Credit card', ic: 'card', title: 'Debit / Credit card', items: [['card', 'Visa, Mastercard, RuPay, Amex', 'Card details are entered securely on PayU']] },
  { key: 'nb', label: 'Net banking', ic: 'globe', title: 'Net banking', items: [['globe', 'All major Indian banks', 'SBI, HDFC, ICICI, Axis, Kotak and more']] },
  { key: 'wallet', label: 'Mobile wallets', ic: 'phone', title: 'Mobile wallets', items: [['phone', 'Paytm, PhonePe, Amazon Pay', 'Pay from your wallet balance']] },
];
const UPI_APPS = [
  { key: 'phonepe', name: 'PhonePe', icon: '/pay/phonepe.svg', color: '#5f259f', pkg: 'com.phonepe.app' },
  { key: 'paytm', name: 'Paytm', icon: '/pay/paytm.svg', color: '#00baf2', pkg: 'net.one97.paytm' },
  { key: 'gpay', name: 'Google Pay', icon: '/pay/googlepay.svg', color: '#1a73e8', pkg: 'com.google.android.apps.nbu.paisa.user' },
];
const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// "✎ 1 Ticket" button that turns into an in-place − n + stepper (min → max the buyer may take).
function QtyPicker({ value, options, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const min = options.length ? options[0] : 1;
  const max = options.length ? options[options.length - 1] : 1;
  const off = disabled || !options.length;
  if (!open || off) {
    return (
      <div className="qp">
        <button type="button" className="qp-btn" onClick={() => setOpen(true)} disabled={off} aria-label="Change ticket quantity">
          <Icon name="edit" size={16} /> {value} Ticket{value > 1 ? 's' : ''}
        </button>
      </div>
    );
  }
  return (
    <div className="qp qp-step" role="group" aria-label="Ticket quantity">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer tickets">−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More tickets">+</button>
    </div>
  );
}

// One page: staff → tickets → quantity → ticket holder → payment → summary + pay.
export default function Booking({ mode = 'select' }) {
  const isPay = mode === 'pay';
  const { id } = useParams();
  const [params] = useSearchParams();
  const ev = useEvent(id);
  const nav = useNavigate();
  const loc = useLocation();
  const { user, notify } = useApp();
  const draft = storage.get(DRAFT_KEY, null);
  const same = draft?.eventId === id;
  const [tierName, setTierName] = useState(same ? draft.tierName : '');
  const [qty, setQty] = useState(same ? draft.qty : 1);
  const [staffCode, setStaffCode] = useState(isPay && same ? (draft.staffCode || '') : (params.get('staff') || ''));
  const [staffList, setStaffList] = useState(null);
  const [inv, setInv] = useState(null);
  const [buyer, setBuyer] = useState(isPay && same && draft.buyer ? draft.buyer : { name: displayName(user), email: user?.email || '', phone: user?.phone || '' });
  const [method, setMethod] = useState('upi');
  const [upiOpen, setUpiOpen] = useState(false);
  const [upiApp, setUpiApp] = useState(null);
  const [payNote, setPayNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [sim, setSim] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const isOpp = !!(ev && ev.isOpportunity && ev.staffRecruitment);

  useEffect(() => { if (user) setBuyer((b) => ({ name: b.name || displayName(user), email: b.email || user.email || '', phone: b.phone || user.phone || '' })); }, [user]);
  useEffect(() => {
    if (!ev || IS_SANDBOX) return;
    eventInventory(id).then(setInv).catch(() => setInv(null));
    if (isOpp) eventStaff(id).then((d) => setStaffList(d.staff)).catch(() => setStaffList([]));
  }, [ev, id, isOpp]);

  const staff = useMemo(() => (staffList || []).find((s) => s.staffCode === staffCode) || null, [staffList, staffCode]);
  if (ev === undefined) return <PageLoader />;
  if (!ev) return <NotFoundEvent />;
  if (isPay && !same) return <Navigate to={`/event/${encodeURIComponent(id)}/book`} replace />;

  const available = (t) => {
    if (IS_SANDBOX) return tierRemaining(t);
    if (isOpp) {
      if (staff) return staff.stock?.[t.name] || 0;
      // No staff selected: booking directly from the organizer's available tickets.
      const o = inv?.tiers.find((i) => i.name === t.name);
      return o ? o.available : null;
    }
    const x = inv?.tiers.find((i) => i.name === t.name);
    return x ? x.available : tierRemaining(t);
  };
  const tier = (ev.tickets || []).find((t) => t.name === tierName);
  const minQ = ev.minQty || 1;
  const maxQ = Math.max(minQ, ev.maxQty || MAX_QTY);
  const avail = tier ? available(tier) : null;
  const cap = avail === null ? maxQ : Math.min(maxQ, avail);
  const q = Math.min(Math.max(qty, minQ), Math.max(minQ, cap));
  const qtyOptions = Array.from({ length: Math.max(0, cap - minQ + 1) }, (_, i) => minQ + i);
  const totals = computeTotals(tier?.price || 0, q);
  const free = totals.total === 0;

  const validate = () => {
    const e = {};
    if (!tier) e.tier = 'Choose a ticket category';
    else if (avail !== null && avail < q) e.tier = staff ? `${staff.name} has only ${avail} ${tier.name} tickets left` : `Only ${avail} ${tier.name} tickets left`;
    if (buyer.name.trim().length < 2) e.name = 'Enter the ticket holder’s full name';
    if (!/^\S+@\S+\.\S+$/.test(buyer.email)) e.email = 'Enter a valid email for your ticket';
    if (!/^[6-9]\d{9}$/.test(String(buyer.phone).replace(/\D/g, '').slice(-10))) e.phone = 'Enter a valid 10-digit mobile number';
    setErrors(e);
    if (Object.keys(e).length) document.querySelector('.bk1-sec .field-err, .bk1-err')?.closest('.bk1-sec')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !Object.keys(e).length;
  };

  // Step 1 → step 2: save the selection and open the payment page.
  const proceed = () => {
    if (!user) { nav('/login', { state: { from: loc.pathname + loc.search } }); return; }
    if (!validate()) return;
    if (free) { pay(); return; }
    storage.set(DRAFT_KEY, { eventId: ev.id, tierName: tier.name, qty: q, staffCode: staff ? staff.staffCode : '', buyer });
    nav(`/event/${encodeURIComponent(ev.id)}/pay`);
  };
  const staffPending = isOpp && !!staffCode && !staff;

  const done = (booking, msg) => { storage.del(DRAFT_KEY); notify(msg); nav(`/confirmation/${encodeURIComponent(booking.id)}`, { state: { booking } }); };

  const pay = async (app = null) => {
    setFailure('');
    if (!user) { nav('/login', { state: { from: loc.pathname + loc.search } }); return; }
    if (!validate()) return;
    setBusy(true);
    const b = { ...buyer, phone: String(buyer.phone).replace(/\D/g, '').slice(-10) };
    try {
      if (!IS_SANDBOX) {
        const hold = await startBooking({ eventId: ev.id, tierName: tier.name, qty: q, staffCode: isOpp && staff ? staff.staffCode : undefined, buyer: b });
        if (hold.booking) { done(hold.booking, 'Your free pass is confirmed'); return; }
        const viaApp = !!(app?.pkg && canPayUpiNative());
        const p = await startPayment(hold.bookingId, session.token(), appUrl('/payment/return'), { intent: viaApp });
        if (p.mode === 'simulator') { setSim({ id: hold.bookingId, amount: hold.total }); setBusy(false); return; }
        if (p.mode === 'intent') {
          // Open PhonePe / GPay / Paytm directly, then confirm with PayU and issue the QR ticket.
          setPayNote(`Complete the payment in ${app.name}…`);
          await payWithUpiApp(p.intentUrl, app.pkg);
          setPayNote('Confirming your payment…');
          const st = await waitForPayment(hold.bookingId, session.token());
          setPayNote('');
          if (st === 'success') { const r = await confirmBooking(hold.bookingId); done(r.booking, 'Payment successful — enjoy the show!'); return; }
          setFailure(st === 'failed' ? 'Payment failed or was cancelled. No money was taken for this booking — you can try again.' : 'We haven’t received confirmation from your UPI app yet. If money was debited, your ticket will appear in My Bookings shortly.');
          setBusy(false); return;
        }
        storage.set(PENDING_PAY, { kind: 'booking', id: hold.bookingId });
        submitPayU(p.action, p.fields);
        return;
      }
      if (!free) await new Promise((r) => setTimeout(r, 1200));
      const booking = await createBooking({ event: ev, tier, qty: q, buyer: b, user, payment: free ? { gateway: 'Free', status: 'Success' } : { gateway: 'PayU (sandbox)', method, status: 'Success' } });
      done(booking, free ? 'Your free pass is confirmed' : 'Payment successful — enjoy the show!');
    } catch (err) { setFailure(err.message || 'Payment could not start'); setBusy(false); }
  };

  const simulate = async (outcome) => {
    setBusy(true);
    try {
      await simulatePayment(sim.id, session.token(), outcome);
      if (outcome === 'fail') { setSim(null); setFailure('Payment failed. Your tickets were not booked — you can try again.'); setBusy(false); return; }
      const r = await confirmBooking(sim.id);
      done(r.booking, 'Payment verified — enjoy the show!');
    } catch (err) { setFailure(err.message); setSim(null); setBusy(false); }
  };

  const err = (k) => errors[k] && <span className="field-err bk1-err">{errors[k]}</span>;
  const pm = METHODS.find((m) => m.key === method) || METHODS[0];
  const editing = editOpen || !!(errors.name || errors.email || errors.phone) || !buyer.name || !buyer.phone || !buyer.email;

  return (
    <div className={`bk2${isPay ? ' bk2-paymode' : ''}`}>
      <div className="bk2-top">
        <div className="wrap bk2-top-in">
          <button type="button" className="bk2-back" aria-label="Back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(`/event/${encodeURIComponent(ev.id)}`))}><Icon name="chevL" size={22} /></button>
          <div>
            <b className="m-only bk2-mtitle">{isPay ? 'Payment' : 'Confirm booking'}</b>
            <b className="d-only">{ev.name}{ev.category ? ` (${ev.category})` : ''}</b>
            <small>{[ev.venue, cityOf(ev)].filter(Boolean).join(', ')} | {fmtDate(ev.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{ev.time ? ` | ${ev.time}` : ''}</small>
          </div>
          {isPay && <span className="bk2-secure"><Icon name="lock" size={15} /> Secure checkout</span>}
        </div>
      </div>

      <div className="wrap bk2-grid">
        {/* ---------------- left ---------------- */}
        <div className="bk2-left">
          {isPast(ev) && <div className="alert info"><Icon name="info" /> This event’s date has passed. Bookings remain open only while the creator keeps the event live.</div>}

          {!isPay && (<>
          {isOpp && (
            <div className="bk2-card">
              <div className="bk2-card-h"><h3>Staff member</h3><span>{staff ? <>Booking through <b>{staff.name}</b> · <button type="button" className="bk2-link" onClick={() => setStaffCode('')}>Book from organizer instead</button></> : 'Showing the organizer’s available tickets — or pick a staff member to book through them'}</span></div>
              <div className="bk2-card-b">
                {staffList === null ? <div className="skel" style={{ height: 56 }} /> : staffList.length ? (
                  <div className="bk2-staff">
                    {staffList.map((s) => (
                      <button key={s.staffCode} type="button" className={`bk2-st${s.staffCode === staffCode ? ' on' : ''}${s.available ? '' : ' out'}`} aria-pressed={s.staffCode === staffCode}
                        onClick={() => (!s.available ? notify(`${s.name} has no tickets left`, 'err') : setStaffCode(s.staffCode === staffCode ? '' : s.staffCode))}>
                        <span className="bk2-st-ph">{s.photo ? <img src={mediaUrl(s.photo)} alt="" /> : initials(s.name)}{s.staffCode === staffCode && <i><Icon name="check" size={11} stroke={3} /></i>}</span>
                        <span className="bk2-st-t"><b>{s.name}</b><small><span className="mono">{s.staffCode}</span> · {s.available ? `${s.available} left` : 'Sold out'}</small></span>
                      </button>
                    ))}
                  </div>
                ) : <p className="muted">No staff members have joined this event yet.</p>}
                {err('staff')}
              </div>
            </div>
          )}

          <div className="bk2-card">
            <div className="bk2-card-h"><h3>Tickets</h3><span>{minQ}–{maxQ} per booking · one QR admits the group</span></div>
            <div className="bk2-card-b">
              <div className="bk2-tiers">
                {(ev.tickets || []).map((t) => {
                  const a = available(t);
                  const off = a !== null && a <= 0;
                  return (
                    <button key={t.name} type="button" className={`bk2-tier${tierName === t.name ? ' on' : ''}${off ? ' out' : ''}`} aria-pressed={tierName === t.name}
                      onClick={() => (off ? notify(isOpp ? 'This staff member has no tickets left in this category' : 'This ticket type is sold out', 'err') : setTierName(t.name))}>
                      <span className="tc-info">
                        <b>{t.name}</b>
                        <small>{t.perks || 'Standard entry'}</small>
                      </span>
                      <span className="tc-price"><b>{fmtINR(t.price)}</b><small>{a === null ? 'Checking…' : off ? 'Sold out' : `${a} available`}</small></span>
                    </button>
                  );
                })}
              </div>
              {err('tier')}
              <div className="bk1-qty">
                <span>Quantity</span>
                <QtyPicker value={q} options={qtyOptions} disabled={!tier} onChange={setQty} />
              </div>
            </div>
          </div>

          </>)}

          {isPay && !free && (
            <div className="m-pay">
              <div className="m-pay-amt"><span>Amount payable</span><b>{fmtINR(totals.total)}</b></div>
              <h6>Payment options</h6>
              <div className="m-pay-list">
                {METHODS.map((m) => (m.key === 'upi' ? (
                  <div key={m.key} className={`m-upi${upiOpen ? ' open' : ''}`}>
                    <button type="button" onClick={() => setUpiOpen((o) => !o)} disabled={busy || !tier} aria-expanded={upiOpen}>
                      <span className="m-pay-ic"><Icon name={m.ic} size={20} /></span>
                      <span><b>{m.label}</b><small>{m.items[0][2]}</small></span>
                      <Icon name="chevR" size={18} />
                    </button>
                    {upiOpen && (
                      <div className="m-upi-apps">
                        {UPI_APPS.map((a) => (
                          <button key={a.key} type="button" disabled={busy} onClick={() => { setMethod('upi'); setUpiApp(a); pay(a); }}>
                            <span className="upi-logo" style={{ '--upi': a.color }}><img src={a.icon} alt="" /></span>
                            <b>{a.name}</b>
                            {busy && upiApp?.key === a.key ? <span className="spinner dark" /> : <Icon name="chevR" size={16} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button key={m.key} type="button" onClick={() => { setMethod(m.key); setUpiApp(null); pay(); }} disabled={busy || !tier}>
                    <span className="m-pay-ic"><Icon name={m.ic} size={20} /></span>
                    <span><b>{m.label}</b><small>{m.items[0][2]}</small></span>
                    <Icon name="chevR" size={18} />
                  </button>
                )))}
              </div>
              {payNote && <div className="alert ok" style={{ margin: '12px 16px 0' }}><span className="spinner dark" />{payNote}</div>}
              {failure && <div className="alert err" style={{ margin: '12px 16px 0' }}><Icon name="info" />{failure}</div>}
              <div className="m-pay-note">
                <b>Note</b>
                <ol><li>Tickets once booked can’t be exchanged or refunded unless the event is cancelled.</li><li>Carry a valid photo ID. Your QR ticket appears instantly in My Bookings.</li></ol>
                <span><Icon name="shield" size={14} /> {IS_SANDBOX ? 'Sandbox mode: payment is simulated.' : 'Payments secured by PayU · 256-bit encryption'}</span>
              </div>
            </div>
          )}
          {isPay && !free && (
            <div className="bk2-card bk2-pay">
              <div className="bk2-card-h"><h3>Payment options</h3></div>
              <div className="bk2-pay-grid">
                <div className="bk2-pay-tabs" role="tablist" aria-label="Payment method">
                  {METHODS.map((m) => (
                    <button key={m.key} type="button" role="tab" aria-selected={method === m.key} className={method === m.key ? 'on' : ''} onClick={() => setMethod(m.key)}>
                      <Icon name={m.ic} size={20} /> {m.label}
                    </button>
                  ))}
                </div>
                <div className="bk2-pay-body">
                  <h4>{pm.title}</h4>
                  {pm.items.map(([ic, t, d]) => (
                    <button key={t} type="button" className="bk2-pay-opt" onClick={() => pay()} disabled={busy || !tier}>
                      <Icon name={ic} size={24} />
                      <span><b>{t}</b><small>{d}</small></span>
                      <Icon name="chevR" size={18} />
                    </button>
                  ))}
                  <p className="bk2-pay-note"><Icon name="shield" size={14} /> {IS_SANDBOX ? 'Sandbox mode: payment is simulated.' : 'Payments secured by PayU · 256-bit encryption'}</p>
                  <p className="bk2-pay-note">Tickets can’t be exchanged or refunded unless the event is cancelled. Carry a valid photo ID.</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ---------------- right ---------------- */}
        <aside className="bk2-right">
          <div className="bk2-box">
            <div className="bk2-ev">
              <div>
                <b>{ev.name}</b>
                <strong>{fmtDate(ev.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{ev.time ? ` | ${ev.time}` : ''}</strong>
                <small>{tier ? `${tier.name} × ${q}` : 'Choose a ticket'}</small>
                <small>{[ev.venue, cityOf(ev)].filter(Boolean).join(', ')}</small>
              </div>
              <div className="bk2-ev-r"><span className="bk2-qty">{q}</span><span className="bk2-mt"><Icon name="ticket" size={14} /> M-Ticket</span></div>
            </div>
            {isOpp && (staff
              ? <div className="bk2-band"><b>Booking through {staff.name}</b><span>Staff ID <span className="mono">{staff.staffCode}</span> — this booking is credited to them.</span></div>
              : !staffPending && <div className="bk2-band org"><b>Booking from the organizer</b><span>Tickets come directly from {ev.creatorName || 'the organizer'}.</span></div>)}
          </div>

          <div className="bk2-box bk2-lines">
            <div><span>Ticket(s) price</span><b>{fmtINR(totals.subtotal).replace('Free', '₹0.00')}</b></div>
            <div><span>Convenience fee ({totals.feeRate}%)</span><b>{totals.fee ? fmtINR(totals.fee) : '₹0.00'}</b></div>
            <div><span>GST on fee ({totals.gstRate}%)</span><b>{totals.gst ? fmtINR(totals.gst) : '₹0.00'}</b></div>
            <div className="bk2-total"><span>Order total</span><b>{free ? 'Free' : fmtINR(totals.total)}</b></div>
          </div>

          <div className="bk2-box">
            <div className="bk2-box-h"><h4>For sending booking details</h4>{user && !editing && <button type="button" className="bk2-edit" onClick={() => setEditOpen(true)}><Icon name="edit" size={14} /> Edit</button>}</div>
            {!user ? (
              <div className="bk1-signin"><span>Sign in to book — your ticket is saved to your account.</span><Link to="/login" state={{ from: loc.pathname + loc.search }} className="btn btn-primary btn-sm">Sign in</Link></div>
            ) : editing ? (
              <div className="bk2-form">
                <div className="field"><label htmlFor="b-name">Full name</label><input id="b-name" className={`input${errors.name ? ' err' : ''}`} value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />{err('name')}</div>
                <div className="field"><label htmlFor="b-email">Email</label><input id="b-email" type="email" className={`input${errors.email ? ' err' : ''}`} value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />{err('email')}</div>
                <div className="field"><label htmlFor="b-phone">Mobile number</label><div className="phone-wrap"><span>+91</span><input id="b-phone" className={`input${errors.phone ? ' err' : ''}`} value={buyer.phone} inputMode="numeric" maxLength={10} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value.replace(/\D/g, '') })} /></div>{err('phone')}</div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  const e = {};
                  if (buyer.name.trim().length < 2) e.name = 'Enter the ticket holder’s full name';
                  if (!/^\S+@\S+\.\S+$/.test(buyer.email)) e.email = 'Enter a valid email';
                  if (!/^[6-9]\d{9}$/.test(String(buyer.phone).replace(/\D/g, '').slice(-10))) e.phone = 'Enter a valid 10-digit mobile number';
                  setErrors((x) => ({ staff: x.staff, tier: x.tier, ...e }));
                  if (!Object.keys(e).length) setEditOpen(false);
                }}>Save details</button>
              </div>
            ) : (
              <p className="bk2-contact">+91-{buyer.phone} | {buyer.email}<br />{buyer.name}</p>
            )}
          </div>

          <div className="bk2-box bk2-payable">
            <div className="bk2-tot"><span className="m-tot-l">{isPay ? 'Amount payable' : 'Total'}</span><b>{free ? 'Free' : fmtINR(totals.total)}</b></div>
            {failure && <div className="alert err"><Icon name="info" />{failure}</div>}
            <p className="bk2-consent">By proceeding, I consent to complete this transaction.</p>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => (isPay ? pay() : proceed())} disabled={busy || !tier || staffPending}>
              {busy ? <><span className="spinner" /> Processing…</> : staffPending ? 'Loading…' : !user ? 'Sign in to book' : !tier ? 'Select a ticket' : free ? 'Confirm free booking' : isPay ? `Pay ${fmtINR(totals.total)}` : `Proceed to pay ${fmtINR(totals.total)}`}
            </button>
            {isPay && <Link to={`/event/${encodeURIComponent(ev.id)}/book${staff ? `?staff=${encodeURIComponent(staff.staffCode)}` : ''}`} className="bk2-change">← Change tickets</Link>}
          </div>
        </aside>
      </div>

      {sim && (
        <div className="modal-scrim">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Test payment" style={{ maxWidth: 460, textAlign: 'center' }}>
            {upiApp ? (
              <div className="upi-sim-head"><span className="upi-logo lg" style={{ '--upi': upiApp.color }}><img src={upiApp.icon} alt="" /></span><b>Pay with {upiApp.name}</b></div>
            ) : <span className="eyebrow sim-eyebrow">Test payment gateway</span>}
            <h2 style={{ margin: '8px 0 6px' }}>{fmtINR(sim.amount)}</h2>
            <p className="muted" style={{ fontSize: 14 }}>The server runs in payment-simulator mode, so no real money moves. It records and verifies this payment exactly as it would a PayU callback.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <button className="btn btn-primary btn-lg" onClick={() => simulate('success')} disabled={busy}>{busy && <span className="spinner" />}Pay {fmtINR(sim.amount)}</button>
              <button className="btn btn-ghost" onClick={() => simulate('fail')} disabled={busy}>Simulate failed payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
