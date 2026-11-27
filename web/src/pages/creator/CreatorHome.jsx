import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Poster } from '../../components/EventCard';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { analytics, creatorSession, myEvents, planStatus, scanLog, unlockFinance } from '../../lib/creator';
import { fmtDate, fmtINR, isPast } from '../../lib/utils';
import { PageLoader } from '../Details';

export function useCreatorData() {
  const { creator } = useCreator();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const [events, stats] = await Promise.all([myEvents(creator), analytics(creator)]);
      setData({ events, stats });
    } catch (e) { setErr(e.message); setData({ events: [], stats: null }); }
  }, [creator]);
  useEffect(() => { load(); }, [load]);
  return { data, err, reload: load };
}

export function CrHead({ title, sub, children }) {
  return (
    <div className="cr-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="cr-head-actions">{children}</div>}
    </div>
  );
}

const money = (n) => (Number(n || 0) === 0 ? '₹0' : fmtINR(n));

function PinGate({ onOpen }) {
  const { creator } = useCreator();
  const [pin, setPin] = useState(['', '', '', '']);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);
  const { notify } = useApp();

  const submit = async (code) => {
    setBusy(true); setErr('');
    try {
      const r = await unlockFinance(creator, code);
      notify(r.initialized ? 'Finance PIN set — keep it safe' : 'Finance unlocked');
      onOpen();
    } catch (e) { setErr(e.message); setPin(['', '', '', '']); refs.current[0]?.focus(); }
    setBusy(false);
  };
  const set = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = pin.map((x, k) => (k === i ? d : x));
    setPin(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) submit(next.join(''));
  };

  return (
    <div className="pin-gate">
      <div className="pin-ic"><Icon name="lock" size={26} /></div>
      <h3>Revenue & finance are locked</h3>
      <p>Enter your 4-digit finance PIN. First time? The PIN you enter now becomes your finance PIN.</p>
      <div className="pin-row">
        {pin.map((v, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} value={v} inputMode="numeric" type="password" maxLength={1} aria-label={`PIN digit ${i + 1}`}
            onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !v && i) refs.current[i - 1]?.focus(); }} disabled={busy} />
        ))}
      </div>
      {err && <div className="field-err" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  );
}

export function RevenueBars({ events }) {
  const max = Math.max(1, ...events.map((e) => e.revenue));
  if (!events.length) return <p className="muted" style={{ fontSize: 14 }}>No revenue data yet.</p>;
  return (
    <div className="bars">
      {events.map((e) => (
        <div key={e.id} className="bar-row">
          <span className="bar-name" title={e.name}>{e.name}</span>
          <span className="bar-track"><i style={{ width: `${Math.max(2, (e.revenue / max) * 100)}%` }} /></span>
          <span className="bar-val">{money(e.revenue)}<small>{e.tickets} tickets</small></span>
        </div>
      ))}
    </div>
  );
}

// Plan & credits summary (allocated / consumed / remaining, billing period, renewal date).
function PlanCard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (String(creatorSession.token()).startsWith('sandbox.')) return;
    planStatus().then(setD).catch(() => setD(null)); // hidden when the server has no plans
  }, []);
  if (!d) return null;
  const sub = d.subscription; const c = d.credits;
  if (!sub) {
    return (
      <div className="plan-card plan-none">
        <span><b>No organizer plan yet</b><small>Choose a plan to create events and issue tickets.</small></span>
        <Link to="/creator/create" className="btn btn-primary btn-sm">See plans</Link>
      </div>
    );
  }
  const pct = c.allocated ? Math.min(100, Math.round((c.consumed / c.allocated) * 100)) : 0;
  return (
    <div className="plan-card">
      <span className="plan-name"><small>Current plan</small><b>{sub.plan}</b><em>{sub.billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'} · renews {new Date(sub.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</em></span>
      <span className="plan-credits">
        <span className="plan-nums"><span><b>{c.remaining.toLocaleString('en-IN')}</b><small>credits left</small></span><span><b>{c.consumed.toLocaleString('en-IN')}</b><small>used</small></span><span><b>{c.allocated.toLocaleString('en-IN')}</b><small>allocated</small></span></span>
        <span className="plan-bar" aria-label={`${pct}% of credits used`}><i style={{ width: `${pct}%` }} /></span>
        <small className="muted">1 credit = 1 digital ticket · check-ins are free · {sub.monthlyCredits.toLocaleString('en-IN')} credits each month</small>
      </span>
    </div>
  );
}

export default function CreatorDashboard() {
  const { creator, financeOpen, setFinanceOpen } = useCreator();
  const { data, err, reload } = useCreatorData();
  const scans = scanLog(creator);
  if (!data) return <PageLoader />;
  const { events, stats } = data;
  const live = events.filter((e) => e.status === 'live' && !isPast(e));
  const cap = events.reduce((s, e) => s + Number(e.capacity || 0), 0);
  const sold = stats?.summary.tickets || 0;
  const today = new Date().toDateString();
  const checkins = scans.filter((s) => s.result === 'valid' && new Date(s.at).toDateString() === today).length;

  return (
    <>
      <CrHead title={`Hello, ${creator.name.split(' ')[0]}`} sub="Here’s how your events are doing.">
        <button className="btn btn-ghost btn-sm" onClick={reload}><Icon name="spark" size={14} /> Refresh</button>
        <Link to="/creator/create" className="btn btn-primary btn-sm"><Icon name="edit" size={14} /> New event</Link>
      </CrHead>
      {err && <div className="alert err" style={{ marginBottom: 18 }}><Icon name="info" />{err}</div>}
      <PlanCard />
      <div className="kpis" style={{ marginTop: 0 }}>
        <div className="kpi"><small>Tickets sold</small><b>{sold}</b><i>{sold ? 'across all events' : 'No sales yet'}</i></div>
        <div className="kpi"><small>Active events</small><b>{live.length}</b><i>{events.length} total</i></div>
        <div className="kpi"><small>Check-ins today</small><b>{checkins}</b><i>{checkins ? 'via QR scanner' : 'No check-ins yet'}</i></div>
        <div className="kpi"><small>Conversion</small><b>{cap ? Math.round((sold / cap) * 100) : 0}%</b><i>of total capacity</i></div>
      </div>
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-h"><h3>Revenue & finance</h3>{financeOpen && <Link to="/creator/revenue" className="see-all">Full revenue <Icon name="chevR" size={14} /></Link>}</div>
          {financeOpen ? (
            <>
              <div className="fin-row">
                <div><small>Gross revenue</small><b>{money(stats?.summary.gross)}</b></div>
                <div><small>Platform fee (8%)</small><b>{money(stats?.summary.fee)}</b></div>
                <div><small>Net payout</small><b className="g">{money(stats?.summary.net)}</b></div>
              </div>
              <RevenueBars events={(stats?.events || []).slice(0, 5)} />
            </>
          ) : <PinGate onOpen={() => setFinanceOpen(true)} />}
        </div>
        <div className="panel">
          <h3>Quick actions</h3>
          <div className="quick">
            {[['edit', 'Create event', 'Six steps to go live', '/creator/create'], ['qr', 'Open scanner', 'Check guests in by QR', '/creator/scanner'], ['users', 'Manage staff', 'Add team, assign tickets', '/creator/staff'], ['card', 'Revenue', 'Payouts & ticket sales', '/creator/revenue']].map(([ic, b, s, to]) => (
              <Link key={to} to={to}><span className="ic"><Icon name={ic} /></span><span><b>{b}</b><small>{s}</small></span><Icon name="chevR" className="arr" /></Link>
            ))}
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-h"><h3>Your events</h3><Link to="/creator/events" className="see-all">All events <Icon name="chevR" size={14} /></Link></div>
        <EventTable events={events.slice(0, 5)} stats={stats} />
      </div>
    </>
  );
}

function EventTable({ events, stats }) {
  if (!events.length) return (
    <div className="empty" style={{ padding: 40 }}>
      <div className="ic"><Icon name="cal" size={26} /></div>
      <h3>Create your first event</h3>
      <p>Upload a banner, add ticket tiers and go live in minutes.</p>
      <Link to="/creator/create" className="btn btn-primary">Create event</Link>
    </div>
  );
  const byId = Object.fromEntries((stats?.events || []).map((e) => [e.id, e]));
  return (
    <div className="ev-table">
      {events.map((e) => {
        const s = byId[e.id] || { tickets: e.bookingCount || 0, revenue: e.revenue || 0 };
        const past = isPast(e);
        return (
          <div key={e.id} className="ev-row">
            <span className="ev-thumb"><Poster ev={e} /></span>
            <span className="ev-main"><b>{e.name}</b><small>{fmtDate(e.date)} · {e.venue}, {e.city}</small></span>
            <span className={`status ${past ? 'past' : e.sandbox ? 'sbx' : 'up'}`}>{past ? 'Ended' : e.sandbox ? 'Live · sandbox' : e.status || 'live'}</span>
            <span className="ev-num"><b>{s.tickets}</b><small>sold / {e.capacity || '—'}</small></span>
            <span className="ev-num"><b>{money(s.revenue)}</b><small>revenue</small></span>
            {e.isOpportunity && !e.sandbox
              ? <Link to={`/creator/opportunity/${encodeURIComponent(e.id)}`} className="btn btn-gold btn-sm" title="Manage staff, allocations and analytics">Manage staff</Link>
              : <Link to={`/event/${encodeURIComponent(e.id)}`} className="icon-btn sm" title="View public page" aria-label={`View ${e.name}`}><Icon name="arrowR" size={15} /></Link>}
          </div>
        );
      })}
    </div>
  );
}

export function CreatorEvents() {
  const { data, reload } = useCreatorData();
  const [tab, setTab] = useState('live');
  const list = useMemo(() => (data?.events || []).filter((e) => (tab === 'live' ? !isPast(e) : isPast(e))), [data, tab]);
  if (!data) return <PageLoader />;
  return (
    <>
      <CrHead title="My events" sub={`${data.events.length} event${data.events.length === 1 ? '' : 's'} published`}>
        <button className="btn btn-ghost btn-sm" onClick={reload}>Refresh</button>
        <Link to="/creator/create" className="btn btn-primary btn-sm"><Icon name="edit" size={14} /> New event</Link>
      </CrHead>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Upcoming</button>
        <button className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past</button>
      </div>
      <div className="panel"><EventTable events={list} stats={data.stats} /></div>
    </>
  );
}

export function CreatorRevenue() {
  const { financeOpen, setFinanceOpen } = useCreator();
  const { data, reload } = useCreatorData();
  if (!data) return <PageLoader />;
  const s = data.stats?.summary || {};
  return (
    <>
      <CrHead title="Revenue & analytics" sub="Earnings across every event you host.">
        {financeOpen && <button className="btn btn-ghost btn-sm" onClick={reload}>Refresh</button>}
        {financeOpen && <button className="btn btn-ghost btn-sm" onClick={() => setFinanceOpen(false)}><Icon name="lock" size={14} /> Lock</button>}
      </CrHead>
      {!financeOpen ? <div className="panel"><PinGate onOpen={() => setFinanceOpen(true)} /></div> : (
        <>
          <div className="kpis" style={{ marginTop: 0 }}>
            <div className="kpi"><small>Gross revenue</small><b>{money(s.gross)}</b><i>from all events</i></div>
            <div className="kpi"><small>Net payout</small><b>{money(s.net)}</b><i>after 8% platform fee</i></div>
            <div className="kpi"><small>Tickets sold</small><b>{s.tickets || 0}</b></div>
            <div className="kpi"><small>Avg ticket price</small><b>{money(s.averageTicketPrice)}</b></div>
          </div>
          <div className="dash-grid">
            <div className="panel"><h3>Revenue by event</h3><RevenueBars events={data.stats?.events || []} /></div>
            <div className="panel">
              <h3>Payout status</h3>
              <div className="line-item"><span>Pending payout</span><b>{money(s.net)}</b></div>
              <div className="line-item"><span>Convenience fee (8%)</span><b>{money(s.fee)}</b></div>
              <div className="line-item"><span>Status</span><b><span className={`status ${s.gross ? 'sbx' : 'past'}`}>{s.payoutStatus}</span></b></div>
              <h3 style={{ marginTop: 26 }}>Top staff performance</h3>
              {(data.stats?.staff || []).length ? data.stats.staff.slice(0, 5).map((m) => (
                <div key={m.id} className="line-item"><span>{m.name} <small className="mono">@{m.staffId}</small></span><b>{m.soldTickets} sold · {money(m.earnings)}</b></div>
              )) : <p className="muted" style={{ fontSize: 14 }}>No staff yet. <Link className="link" to="/creator/staff">Add staff</Link></p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
