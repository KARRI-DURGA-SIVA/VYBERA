import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { IS_SANDBOX, PENDING_PAY, computeTotals, confirmBooking, createBooking, session, simulatePayment, startBooking, startPayment, storage, submitPayU as goPayU } from '../lib/api';
import { displayName, fmtINR } from '../lib/utils';
import { DRAFT_KEY, Stepper, Summary } from './Booking';
import { PageLoader } from './Details';
import { appUrl } from '../lib/env';

const METHODS = [
  { key: 'upi', label: 'UPI', sub: 'GPay, PhonePe, Paytm & any UPI app', ic: 'UPI' },
  { key: 'card', label: 'Credit / Debit card', sub: 'Visa, Mastercard, RuPay', ic: <Icon name="card" /> },
  { key: 'nb', label: 'Net banking', sub: 'All major Indian banks', ic: <Icon name="globe" /> },
];


export default function Checkout() {
  const { user, events, notify } = useApp();
  const nav = useNavigate();
  const draft = storage.get(DRAFT_KEY, null);
  const [buyer, setBuyer] = useState({ name: displayName(user), email: user?.email || '', phone: user?.phone || '' });
  const [method, setMethod] = useState('upi');
  const [agree, setAgree] = useState(true);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [sim, setSim] = useState(null);

  if (!draft) return <Navigate to="/explore" replace />;
  if (!events) return <PageLoader />;
  const ev = events.find((e) => e.id === draft.eventId);
  const tier = ev?.tickets?.find((t) => t.name === draft.tierName);
  if (!ev || !tier) return <Navigate to="/explore" replace />;
  const totals = computeTotals(tier.price, draft.qty);
  const free = totals.total === 0;

  const validate = () => {
    const e = {};
    if (buyer.name.trim().length < 2) e.name = 'Enter the ticket holder’s full name';
    if (!/^\S+@\S+\.\S+$/.test(buyer.email)) e.email = 'Enter a valid email for your ticket';
    if (!/^[6-9]\d{9}$/.test(String(buyer.phone).replace(/\D/g, '').slice(-10))) e.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!agree) e.agree = 'Please accept the booking terms';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const done = (booking, msg) => {
    storage.del(DRAFT_KEY);
    notify(msg);
    nav(`/confirmation/${encodeURIComponent(booking.id)}`, { state: { booking } });
  };

  const pay = async () => {
    setFailure('');
    if (!validate()) return;
    setBusy(true);
    const b = { ...buyer, phone: String(buyer.phone).replace(/\D/g, '').slice(-10) };
    try {
      if (!IS_SANDBOX) {
        // Server prices the order, reserves inventory and validates the staff member for this event.
        const hold = await startBooking({ eventId: ev.id, tierName: tier.name, qty: draft.qty, staffCode: draft.staffCode, buyer: b });
        if (hold.booking) { done(hold.booking, 'Your free pass is confirmed'); return; }
        const p = await startPayment(hold.bookingId, session.token(), appUrl('/payment/return'));
        if (p.mode === 'simulator') { setSim({ id: hold.bookingId, amount: hold.total }); setBusy(false); return; }
        storage.set(PENDING_PAY, { kind: 'booking', id: hold.bookingId });
        goPayU(p.action, p.fields);
        return;
      }
      if (!free) await new Promise((r) => setTimeout(r, 1400)); // simulated gateway round-trip
      const payment = free ? { gateway: 'Free', status: 'Success' } : { gateway: 'PayU (sandbox)', method, status: 'Success' };
      const booking = await createBooking({ event: ev, tier, qty: draft.qty, buyer: b, user, payment });
      done(booking, free ? 'Your free pass is confirmed' : 'Payment successful — enjoy the show!');
    } catch (err) {
      setFailure(err.message || 'Payment could not start');
      setBusy(false);
    }
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

  const field = (k, label, props = {}) => (
    <div className={`field${props.full ? ' full' : ''}`}>
      <label htmlFor={`b-${k}`}>{label}</label>
      {k === 'phone' ? (
        <div className="phone-wrap"><span>+91</span><input id={`b-${k}`} className={`input${errors[k] ? ' err' : ''}`} value={buyer[k]} inputMode="numeric" maxLength={10} onChange={(e) => setBuyer({ ...buyer, [k]: e.target.value.replace(/\D/g, '') })} /></div>
      ) : (
        <input id={`b-${k}`} className={`input${errors[k] ? ' err' : ''}`} value={buyer[k]} type={props.type || 'text'} onChange={(e) => setBuyer({ ...buyer, [k]: e.target.value })} />
      )}
      {errors[k] && <span className="field-err">{errors[k]}</span>}
    </div>
  );

  return (
    <div className="wrap">
      <div className="page-head" style={{ paddingBottom: 18 }}>
        <div className="crumbs"><Link to="/">Home</Link><span>/</span><Link to={`/event/${encodeURIComponent(ev.id)}/book`}>{ev.name}</Link><span>/</span><span>Checkout</span></div>
        <h1 style={{ fontSize: 38 }}>Checkout</h1>
      </div>
      <Stepper step={1} />
      <div className="detail-body" style={{ paddingTop: 0 }}>
        <div>
          <div className="panel">
            <h3>Ticket holder</h3>
            <p className="muted" style={{ fontSize: 14, marginTop: -6, marginBottom: 18 }}>Your QR ticket is issued to these details.</p>
            <div className="form-grid">
              {field('name', 'Full name', { full: true })}
              {field('email', 'Email', { type: 'email' })}
              {field('phone', 'Mobile number')}
            </div>
          </div>
          {!free && (
            <div className="panel">
              <h3>Payment method</h3>
              {METHODS.map((m) => (
                <button key={m.key} type="button" className={`pay-opt${method === m.key ? ' on' : ''}`} onClick={() => setMethod(m.key)} aria-pressed={method === m.key}>
                  <span className="radio" style={method === m.key ? { borderColor: 'var(--forest)' } : null}>{method === m.key && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--forest)' }} />}</span>
                  <span className="ic">{m.ic}</span>
                  <span><b>{m.label}</b><small>{m.sub}</small></span>
                </button>
              ))}
              <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
                {IS_SANDBOX ? 'Sandbox mode: payment is simulated — no money moves and no booking reaches the production database.' : 'You’ll be redirected to PayU to complete payment securely.'}
              </p>
            </div>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, marginTop: 20, cursor: 'pointer' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--forest)' }} />
            <span className="muted">I agree to the booking terms. Tickets are non-refundable unless the event is cancelled by the creator.</span>
          </label>
          {errors.agree && <div className="field-err" style={{ marginTop: 6 }}>{errors.agree}</div>}
        </div>
        <aside className="sticky">
          <Summary ev={ev} tier={tier} qty={draft.qty} staff={draft.staffCode ? { name: draft.staffName, staffCode: draft.staffCode } : null}>
            {failure && <div className="alert err" style={{ marginTop: 16 }}><Icon name="info" /> {failure}</div>}
            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={pay} disabled={busy}>
              {busy ? <><span className="spinner" /> {free ? 'Confirming…' : 'Processing payment…'}</> : free ? 'Confirm free booking' : `Pay ${fmtINR(totals.total)}`}
            </button>
            <div className="secure"><Icon name="shield" size={14} /> 256-bit encrypted · Secured by PayU</div>
          </Summary>
        </aside>
      </div>
      {sim && (
        <div className="modal-scrim">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Test payment" style={{ maxWidth: 460, textAlign: 'center' }}>
            <span className="eyebrow">Test payment gateway</span>
            <h2 style={{ margin: '8px 0 6px' }}>{fmtINR(sim.amount)}</h2>
            <p className="muted" style={{ fontSize: 14 }}>The local server runs in payment-simulator mode, so no real money moves. The server records and verifies this payment exactly as it would a PayU callback.</p>
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
