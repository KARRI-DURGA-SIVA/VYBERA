import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { canPayUpiNative, payWithUpiApp, submitPayU, storage } from '../../lib/api';
import { useCreator } from '../../lib/creatorStore';
import QRCode from 'qrcode';
import { appUrl } from '../../lib/env';
import { planConfirm, planPay, planSimulate, planStart } from '../../lib/creator';

// Organizer plan paywall shown before creating an event. Spec: 4 plans, monthly or yearly billing,
// a monthly credit allowance (1 credit = 1 digital ticket), check-ins never use credits.
export const PENDING_PLAN = 'beeoak.web.pendingPlan';
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const Check = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Included"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

const PERKS = (p, yearly) => [
  ['ticket', `${p.monthlyCredits.toLocaleString('en-IN')} ticket credits ${p.trial ? `for ${p.trialDays} days` : 'every month'}`],
  ['grid', `${p.featureCount}/${p.featureTotal} organizer features`],
  ['edit', 'Create & publish events'],
  ['card', 'Ticket tiers, prices & booking limits'],
  ['shield', 'Free QR check-ins — never use credits'],
  ['spark', '₹0 platform fee on this plan'],
  ['cal', p.trial ? `Free for ${p.trialDays} days · no payment` : yearly ? 'Billed once for 12 months' : 'Billed monthly · renews each month'],
];

export default function PlanWall({ plans, trial, trialAvailable, creditValue = 3.5, onActivated, current = null }) {
  const { notify } = useApp();
  const [period, setPeriod] = useState('yearly');
  const all = useMemo(() => [...(trial && trialAvailable ? [trial] : []), ...plans], [trial, trialAvailable, plans]);
  const [pick, setPick] = useState(() => (current && plans.some((p) => p.id === current.planId) ? current.planId : trial && trialAvailable ? trial.id : (plans.find((p) => p.popular) || plans[0]).id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sim, setSim] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const plan = all.find((p) => p.id === pick) || all[0];
  const yearly = period === 'yearly';
  const price = plan.trial ? 0 : yearly ? plan.annualPrice : plan.monthlyPrice;

  const subscribe = async () => {
    setErr(''); setBusy(true);
    try {
      if (!plan.trial) { setCheckout({ id: null, amount: price, plan, period }); setBusy(false); return; }
      const s = await planStart(plan.id, period);
      if (s.activated) { notify('Free trial started'); onActivated({ subscription: s.subscription, credits: s.credits }); return; }
      setCheckout({ id: s.subscriptionId, amount: s.amount, plan, period }); setBusy(false);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const simulate = async (outcome) => {
    setBusy(true);
    try {
      await planSimulate(sim.id, outcome);
      if (outcome === 'fail') { setSim(null); setErr('Payment failed. Your plan was not activated — you can try again.'); setBusy(false); return; }
      const r = await planConfirm(sim.id);
      storage.del(PENDING_PLAN);
      notify(`${r.subscription.plan} plan activated`);
      onActivated(r);
    } catch (e) { setErr(e.message); setSim(null); setBusy(false); }
  };

  return (
    <div className="pw">
      <div className="pw-head">
        <h1>BEE-OAK for organizers</h1>
        <p>Start free, then pick the plan that fits your events.</p>
        <div className="pw-toggle" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setPeriod('yearly')}>Yearly</button>
        </div>
      </div>

      <div className="pw-cards" role="radiogroup" aria-label="Plan">
        {all.map((p) => {
          const on = p.id === pick;
          const amt = p.trial ? 0 : yearly ? p.annualPrice : p.monthlyPrice;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} className={`pw-c${on ? ' on' : ''}${p.trial ? ' trial' : ''}${p.popular ? ' pop' : ''}`} onClick={() => setPick(p.id)}>
              {p.popular && <span className="pw-ribbon">Most popular</span>}
              {p.trial && <span className="pw-ribbon free">Start here</span>}
              {current?.planId === p.id && <span className="pw-ribbon cur">Current plan</span>}
              <span className="pw-c-name">{p.name}</span>
              <span className="pw-c-price">{inr(amt)}<small>{p.trial ? ` · ${p.trialDays} days` : `/${yearly ? 'year' : 'month'}`}</small></span>
              <span className="pw-c-sub">{p.trial ? 'No card needed · one-time' : yearly ? <>≈ {inr(Math.round(p.annualPrice / 12))}/month · save {inr(p.annualSaving)}</> : <>{inr(p.monthlyPrice * 12)} a year</>}</span>
              <span className="pw-c-credit"><b>{p.monthlyCredits.toLocaleString('en-IN')}</b> credits{p.trial ? '' : ' / month'}</span>
              <span className="pw-c-meter" aria-label={`${p.featureCount} of ${p.featureTotal} features`}><i style={{ width: `${(p.featureCount / p.featureTotal) * 100}%` }} /></span>
              <span className="pw-c-feat">{p.featureCount}/{p.featureTotal} features</span>
              <span className="pw-c-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="pw-perks">
        <div className="pw-perks-h"><b>{plan.name}</b><span>{plan.trial ? 'Free trial includes' : 'Everything in this plan'}</span></div>
        <ul>{PERKS(plan, yearly).map(([ic, t]) => <li key={t}><Icon name={ic} size={18} /><span>{t}</span><Check /></li>)}</ul>
        <p className="pw-note">1 credit = 1 digital ticket issued · credit value ₹{creditValue.toFixed(2)} each</p>
      </div>

      {err && <div className="alert err pw-err"><Icon name="info" />{err}</div>}
      {current && <div className="pw-current"><Icon name="info" size={18} /><span>You’re on <b>{current.plan}</b> until {new Date(current.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. You can choose a new plan when it ends — mid-term upgrades open soon.</span></div>}
      <button type="button" className={`pw-cta${plan.trial ? ' white' : ''}`} onClick={subscribe} disabled={busy || !!current}>
        {busy && <span className="spinner dark" />}{plan.trial ? `Start free trial · ₹0` : `Subscribe to ${plan.name} · ${inr(price)}/${yearly ? 'year' : 'month'}`}
      </button>
      <p className="pw-fine">{plan.trial ? `${plan.monthlyCredits} credits for ${plan.trialDays} days, then choose a plan to keep creating events.` : `${yearly ? 'Renews yearly' : 'Renews monthly'} · ${plan.monthlyCredits.toLocaleString('en-IN')} credits every month · cancel anytime`}</p>

      {checkout && <Checkout {...checkout} onClose={() => setCheckout(null)} onActivated={(r) => { setCheckout(null); notify(`${r.subscription.plan} plan activated`); onActivated(r); }} />}
      {sim && (
        <div className="modal-scrim">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Test payment" style={{ maxWidth: 440, textAlign: 'center' }}>
            <span className="eyebrow">Test payment gateway</span>
            <h2 style={{ margin: '8px 0 6px' }}>{inr(sim.amount)}</h2>
            <p className="muted" style={{ fontSize: 14 }}>The local server runs in payment-simulator mode, so no real money moves.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary btn-lg" onClick={() => simulate('success')} disabled={busy}>{busy && <span className="spinner" />}Pay {inr(sim.amount)}</button>
              <button className="btn btn-ghost" onClick={() => simulate('fail')} disabled={busy}>Simulate failed payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const UPI_APPS = [
  { key: 'gpay', name: 'Google Pay', icon: '/pay/googlepay.svg', color: '#1a73e8', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { key: 'phonepe', name: 'PhonePe', icon: '/pay/phonepe.svg', color: '#5f259f', pkg: 'com.phonepe.app' },
  { key: 'paytm', name: 'Paytm', icon: '/pay/paytm.svg', color: '#00baf2', pkg: 'net.one97.paytm' },
];
const isPhone = () => /Android|iPhone|iPad/i.test(navigator.userAgent);

// Checkout: order summary + PayU payment (UPI QR, UPI app, or card / net banking).
function Checkout({ amount, plan, period, onClose, onActivated }) {
  const { creator } = useCreator();
  const [method, setMethod] = useState(isPhone() ? 'app' : 'qr');
  const [name, setName] = useState(creator?.name || '');
  const [stage, setStage] = useState('form'); // form | qr | waiting | sim
  const [qr, setQr] = useState(''); const [subId, setSubId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const yearly = period === 'yearly';
  const label = `${plan.name} · ${yearly ? 'Yearly' : 'Monthly'}`;

  // Each payment attempt gets its own subscription id (PayU txnids are single-use).
  const fresh = async () => { const s = await planStart(plan.id, period); storage.set(PENDING_PLAN, s.subscriptionId); setSubId(s.subscriptionId); return s.subscriptionId; };
  const poll = async (id) => {
    for (let i = 0; i < 100; i++) {
      try { const r = await planConfirm(id); storage.del(PENDING_PLAN); onActivated(r); return; } catch (e) { if (e.status !== 402) { setErr(e.message); setStage('form'); setBusy(false); return; } }
      await new Promise((res) => setTimeout(res, 3000));
    }
    setErr('We haven’t received the payment yet. If money was debited, your plan activates within a few minutes.'); setStage('form'); setBusy(false);
  };

  const pay = async (app) => {
    setErr(''); setBusy(true);
    try {
      const id = await fresh();
      const ret = appUrl(`/creator/create?plan=${encodeURIComponent(id)}`);
      const viaUpi = method !== 'card';
      const p = await planPay(id, ret, { intent: viaUpi });
      if (p.mode === 'simulator') { setStage('sim'); setBusy(false); return; }
      if (p.mode === 'payu') { submitPayU(p.action, p.fields); return; }
      if (method === 'qr') { setQr(await QRCode.toDataURL(p.intentUrl, { width: 260, margin: 1, color: { dark: '#0b2a1c', light: '#ffffff' } })); setStage('qr'); poll(id); return; }
      setStage('waiting');
      if (canPayUpiNative()) await payWithUpiApp(p.intentUrl, app?.pkg); else window.location.href = p.intentUrl;
      poll(id);
    } catch (e) { setErr(e.message); setBusy(false); setStage('form'); }
  };
  const simulate = async (outcome) => {
    setBusy(true);
    try { await planSimulate(subId, outcome); if (outcome === 'fail') { setErr('Payment failed. Your plan was not activated.'); setStage('form'); setBusy(false); return; } const r = await planConfirm(subId); storage.del(PENDING_PLAN); onActivated(r); } catch (e) { setErr(e.message); setBusy(false); }
  };

  return createPortal(
    <div className="modal-scrim ck-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="ck" role="dialog" aria-modal="true" aria-label="Checkout">
        <div className="ck-top"><span className="ck-logo"><img src="/logo.png" alt="" /></span><b>Checkout</b><button type="button" className="ck-x" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button></div>
        <div className="ck-body">
          <section className="ck-sum">
            <small>Subscribe to {plan.name}</small>
            <div className="ck-amt">{inr(amount)}<span>per<br />{yearly ? 'year' : 'month'}</span></div>
            <div className="ck-line"><span><b>{label}</b><small>{yearly ? 'Billed once for 12 months' : 'Billed monthly'}</small></span><b>{inr(amount)}</b></div>
            <div className="ck-line"><span><b>{plan.monthlyCredits.toLocaleString('en-IN')} ticket credits / month</b><small>1 credit = 1 digital ticket · check-ins free</small></span><b>Included</b></div>
            <div className="ck-line sub"><span>Subtotal</span><b>{inr(amount)}</b></div>
            <div className="ck-line tot"><span>Total due today</span><b>{inr(amount)}</b></div>
            <p className="ck-tax">Prices are inclusive of applicable taxes.</p>
          </section>
          <section className="ck-pay">
            {stage === 'qr' ? (
              <div className="ck-qr">
                <h3>Authorize payment with your app</h3>
                <p>Scan this QR code with any UPI app and follow the steps to pay {inr(amount)}.</p>
                <span className="ck-qr-box"><img src={qr} alt="UPI payment QR code" /></span>
                <span className="ck-wait"><span className="spinner dark" /> Waiting for payment…</span>
                <small>UPI is supported in multiple apps</small>
                <span className="ck-apps">{UPI_APPS.map((a) => <i key={a.key} style={{ background: a.color }} title={a.name}><img src={a.icon} alt="" /></i>)}</span>
                <button type="button" className="ck-link" onClick={() => { setStage('form'); setBusy(false); }}>Use another method</button>
              </div>
            ) : stage === 'waiting' ? (
              <div className="ck-qr"><span className="spinner dark" style={{ width: 30, height: 30 }} /><h3>Complete the payment in your UPI app</h3><p>We’ll activate your plan as soon as PayU confirms it.</p><button type="button" className="ck-link" onClick={() => { setStage('form'); setBusy(false); }}>Cancel</button></div>
            ) : stage === 'sim' ? (
              <div className="ck-qr"><h3>Test payment gateway</h3><p>This local server simulates PayU — no real money moves.</p><button type="button" className="ck-btn" onClick={() => simulate('success')} disabled={busy}>{busy && <span className="spinner" />}Pay {inr(amount)}</button><button type="button" className="ck-link" onClick={() => simulate('fail')} disabled={busy}>Simulate failed payment</button></div>
            ) : (
              <>
                <h3>Pay securely</h3>
                <div className="ck-field ro"><span>Email</span><b>{creator?.email || '—'}</b></div>
                <div className="ck-field"><label htmlFor="ck-name">Name</label><input id="ck-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
                <h4>Payment method</h4>
                <div className="ck-methods" role="radiogroup" aria-label="Payment method">
                  {[['qr', 'qr', 'UPI · scan QR', 'Scan with any UPI app'], ['app', 'phone', 'UPI apps', 'Google Pay, PhonePe, Paytm'], ['card', 'card', 'Card / Net banking', 'Secure PayU checkout']].map(([k, ic, t, d]) => (
                    <button key={k} type="button" role="radio" aria-checked={method === k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)}><Icon name={ic} size={20} /><span><b>{t}</b><small>{d}</small></span><i /></button>
                  ))}
                </div>
                {method === 'app' && <div className="ck-appbtns">{UPI_APPS.map((a) => <button key={a.key} type="button" disabled={busy || !name.trim()} onClick={() => pay(a)}><i style={{ background: a.color }}><img src={a.icon} alt="" /></i>{a.name}</button>)}</div>}
                {method === 'qr' && <p className="ck-hint"><Icon name="qr" size={18} /> You’ll be shown a QR code to scan with your preferred UPI app.</p>}
                {err && <div className="alert err"><Icon name="info" />{err}</div>}
                {method !== 'app' && <button type="button" className="ck-btn" onClick={() => pay()} disabled={busy || !name.trim()}>{busy && <span className="spinner" />}Subscribe · {inr(amount)}</button>}
                <p className="ck-fine">By subscribing, you authorise BEE-OAK to charge you {inr(amount)} {yearly ? 'per year' : 'per month'} for the {plan.name} plan. Payments secured by <b>PayU</b>.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Shown right after a plan is activated.
export function PlanActivated({ sub, credits, onContinue }) {
  return (
    <div className="pw pw-done">
      <span className="pw-ok" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
      <h1>{sub.billingPeriod === 'trial' ? 'Your free trial is on' : `You’re on ${sub.plan}`}</h1>
      <p>{sub.billingPeriod === 'trial' ? 'Free trial' : sub.billingPeriod === 'yearly' ? 'Yearly plan' : 'Monthly plan'} · {sub.billingPeriod === 'trial' ? 'ends' : 'renews'} {new Date(sub.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      <div className="pw-credit-row">
        <span><b>{credits.allocated.toLocaleString('en-IN')}</b><small>Allocated</small></span>
        <span><b>{credits.consumed.toLocaleString('en-IN')}</b><small>Used</small></span>
        <span><b>{credits.remaining.toLocaleString('en-IN')}</b><small>Remaining</small></span>
      </div>
      <button type="button" className="pw-cta" onClick={onContinue}>Continue to create event <Icon name="chevR" size={18} /></button>
    </div>
  );
}

// Resolves a PayU return (?plan=SUB-…) into an activated plan, retrying while PayU settles.
export function usePlanReturn(planId, onDone) {
  useEffect(() => {
    if (!planId) return undefined;
    let stop = false;
    (async () => {
      for (let i = 0; i < 8 && !stop; i++) {
        try { const r = await planConfirm(planId); storage.del(PENDING_PLAN); if (!stop) onDone(r, null); return; } catch (e) {
          if (e.status !== 402) { if (!stop) onDone(null, e.message); return; }
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      if (!stop) onDone(null, 'We haven’t received payment confirmation yet. If you were charged, refresh in a minute.');
    })();
    return () => { stop = true; };
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
}
