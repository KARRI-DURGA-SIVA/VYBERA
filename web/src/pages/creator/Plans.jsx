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

const PERKS = (p, yearly) => [
  ['ticket', `${p.monthlyCredits.toLocaleString('en-IN')} ticket credits ${p.trial ? `for ${p.trialDays} days` : 'every month'}`],
  ['grid', `${p.featureCount}/${p.featureTotal} organizer features`],
  ['edit', 'Create & publish events'],
  ['card', 'Ticket tiers, prices & booking limits'],
  ['shield', 'Free QR check-ins — never use credits'],
  ['spark', '₹0 platform fee on this plan'],
  ['cal', p.trial ? `Free for ${p.trialDays} days · no payment` : yearly ? 'Billed once for 12 months' : 'Billed monthly · renews each month'],
];

export default function PlanWall({ plans, trial, trialAvailable, creditValue = 3.5, onActivated }) {
  const { notify } = useApp();
  const [period, setPeriod] = useState('yearly');
  const all = useMemo(() => [...(trial && trialAvailable ? [trial] : []), ...plans], [trial, trialAvailable, plans]);
  const [pick, setPick] = useState(() => (trial && trialAvailable ? trial.id : (plans.find((p) => p.popular) || plans[0]).id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sim, setSim] = useState(null);
  const plan = all.find((p) => p.id === pick) || all[0];
  const yearly = period === 'yearly';
  const price = plan.trial ? 0 : yearly ? plan.annualPrice : plan.monthlyPrice;
  const maxSave = useMemo(() => Math.max(...plans.map((p) => Math.round((p.annualSaving / (p.monthlyPrice * 12)) * 100))), [plans]);

  const subscribe = async () => {
    setErr(''); setBusy(true);
    try {
      const s = await planStart(plan.id, period);
      if (s.activated) { notify('Free trial started'); onActivated({ subscription: s.subscription, credits: s.credits }); return; }
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
        <h1>BEE-OAK for organizers</h1>
        <p>Start free, then pick the plan that fits your events.</p>
        <div className="pw-toggle" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setPeriod('yearly')}>Yearly <em>Save up to {maxSave}%</em></button>
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
      <button type="button" className={`pw-cta${plan.trial ? ' white' : ''}`} onClick={subscribe} disabled={busy}>
        {busy && <span className="spinner dark" />}{plan.trial ? `Start free trial · ₹0` : `Subscribe to ${plan.name} · ${inr(price)}/${yearly ? 'year' : 'month'}`}
      </button>
      <p className="pw-fine">{plan.trial ? `${plan.monthlyCredits} credits for ${plan.trialDays} days, then choose a plan to keep creating events.` : `${yearly ? 'Renews yearly' : 'Renews monthly'} · ${plan.monthlyCredits.toLocaleString('en-IN')} credits every month · cancel anytime`}</p>

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
