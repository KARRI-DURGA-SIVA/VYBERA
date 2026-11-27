import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { submitPayU, storage } from '../../lib/api';
import { appUrl } from '../../lib/env';
import { planConfirm, planPay, planSimulate, planStart } from '../../lib/creator';

// Organizer plan paywall shown before creating an event. Spec: 4 plans, monthly or yearly billing,
// a monthly credit allowance (1 credit = 1 digital ticket), check-ins never use credits.
export const PENDING_PLAN = 'beeoak.web.pendingPlan';
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const Check = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Included"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

export default function PlanWall({ plans, creditValue = 3.5, onActivated }) {
  const { notify } = useApp();
  const [period, setPeriod] = useState('yearly');
  const [pick, setPick] = useState(() => (plans.find((p) => p.popular) || plans[0]).id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sim, setSim] = useState(null);
  const plan = plans.find((p) => p.id === pick) || plans[0];
  const yearly = period === 'yearly';
  const price = yearly ? plan.annualPrice : plan.monthlyPrice;
  const maxSave = useMemo(() => Math.max(...plans.map((p) => Math.round((p.annualSaving / (p.monthlyPrice * 12)) * 100))), [plans]);

  const subscribe = async () => {
    setErr(''); setBusy(true);
    try {
      const s = await planStart(plan.id, period);
      storage.set(PENDING_PLAN, s.subscriptionId);
      const p = await planPay(s.subscriptionId, appUrl(`/creator/create?plan=${encodeURIComponent(s.subscriptionId)}`));
      if (p.mode === 'simulator') { setSim({ id: s.subscriptionId, amount: p.amount }); setBusy(false); return; }
      submitPayU(p.action, p.fields);
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
        <span className="pw-spark" aria-hidden="true">
          <svg width="46" height="46" viewBox="0 0 48 48" fill="currentColor"><path d="M22 4c1.4 9.6 6.4 14.6 16 16-9.6 1.4-14.6 6.4-16 16-1.4-9.6-6.4-14.6-16-16 9.6-1.4 14.6-6.4 16-16Z" /><path d="M38 30c.6 4 2.6 6 6.6 6.6-4 .6-6 2.6-6.6 6.6-.6-4-2.6-6-6.6-6.6 4-.6 6-2.6 6.6-6.6Z" opacity=".75" /></svg>
        </span>
        <h1>Choose your organizer plan</h1>
        <p>Pick a plan to start creating events on BEE-OAK.</p>
        <div className="pw-toggle" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setPeriod('yearly')}>Yearly <em>Save up to {maxSave}%</em></button>
        </div>
      </div>

      <div className="pw-plans" role="radiogroup" aria-label="Plan">
        {plans.map((p) => {
          const on = p.id === pick;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} className={`pw-plan${on ? ' on' : ''}`} onClick={() => setPick(p.id)}>
              <span className="pw-plan-top"><b>{p.name}</b>{p.popular && <span className="pw-badge">Most popular</span>}</span>
              <span className="pw-price">{inr(yearly ? p.annualPrice : p.monthlyPrice)}<small>/{yearly ? 'year' : 'month'}</small></span>
              <span className="pw-sub">{yearly ? <>Save {inr(p.annualSaving)} vs monthly</> : <>{inr(p.monthlyPrice * 12)} /year if paid monthly</>}</span>
              <span className="pw-credits"><Icon name="ticket" size={15} /> {p.monthlyCredits.toLocaleString('en-IN')} ticket credits / month</span>
            </button>
          );
        })}
      </div>

      <div className="pw-table" role="table" aria-label="Compare plans">
        <div className="pw-row pw-row-h" role="row">
          <span role="columnheader">What you get</span>
          {plans.map((p) => <span key={p.id} role="columnheader" className={p.id === pick ? 'on' : ''}>{p.name}</span>)}
        </div>
        <div className="pw-row" role="row"><span role="cell">Ticket credits / month</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}>{p.monthlyCredits.toLocaleString('en-IN')}</span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Organizer features</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}>{p.featureCount}/{p.featureTotal}</span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Credit value (₹{creditValue.toFixed(2)} each)</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}>{inr(p.creditReferenceValue)}</span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Event creation & publishing</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}><Check /></span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Free QR check-ins (no credits)</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}><Check /></span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Platform fee</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}>₹0</span>)}</div>
        <div className="pw-row" role="row"><span role="cell">Full feature set (44/44)</span>{plans.map((p) => <span key={p.id} role="cell" className={p.id === pick ? 'on' : ''}>{p.featureCount >= p.featureTotal ? <Check /> : <i className="pw-dash" aria-label="Not included" />}</span>)}</div>
      </div>

      {err && <div className="alert err pw-err"><Icon name="info" />{err}</div>}
      <button type="button" className="pw-cta" onClick={subscribe} disabled={busy}>{busy && <span className="spinner dark" />}Subscribe to {plan.name} · {inr(price)}/{yearly ? 'year' : 'month'}</button>
      <p className="pw-fine">{yearly ? 'Billed once for 12 months' : 'Billed monthly'} · {plan.monthlyCredits.toLocaleString('en-IN')} credits every month · 1 credit = 1 digital ticket issued</p>

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

// Shown right after a plan is activated.
export function PlanActivated({ sub, credits, onContinue }) {
  return (
    <div className="pw pw-done">
      <span className="pw-ok" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
      <h1>You’re on {sub.plan}</h1>
      <p>{sub.billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'} plan · renews {new Date(sub.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
