import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Poster } from '../../components/EventCard';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { analytics, creatorSession, myEvents, planStatus, scanLog, unlockFinance } from '../../lib/creator';
import { mediaUrl } from '../../lib/api';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Tickets sold per month of this year (by event date).
function SalesChart({ events, stats }) {
  const year = new Date().getFullYear();
  const byId = Object.fromEntries((stats?.events || []).map((e) => [e.id, e]));
  const months = Array(12).fill(0);
  events.forEach((e) => {
    const d = new Date(e.date);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === year) months[d.getMonth()] += Number((byId[e.id] || {}).tickets ?? e.bookingCount ?? 0);
  });
  const max = Math.max(...months);
  const now = new Date().getMonth();
  return (
    <div className="cd-chart">
      <div className="cd-chart-h"><b>Tickets sold</b><span>· by event month, {year}</span></div>
      <div className="cd-bars">
        {months.map((v, i) => (
          <div key={MONTHS[i]} className={`cd-bar${i === now ? ' now' : ''}`} title={`${MONTHS[i]}: ${v} tickets`}>
            <span className="cd-bar-track"><i style={{ height: `${max ? Math.max(4, (v / max) * 100) : 0}%` }} /></span>
            <small>{MONTHS[i]}</small>
          </div>
        ))}
      </div>
      {!max && (
        <div className="cd-chart-empty">
          <b>Ready to sell?</b>
          <p><em>No sales yet.</em> Publish an event and your ticket sales will show here month by month.</p>
        </div>
      )}
    </div>
  );
}

function Tile({ to, icon, title, sub, tone = '' }) {
  return (
    <Link to={to} className={`cd-tile ${tone}`}>
      <span className="cd-tile-ic"><Icon name={icon} size={22} /></span>
      <span><b>{title}</b><small>{sub}</small></span>
    </Link>
  );
}

export default function CreatorDashboard() {
  const { creator, financeOpen, setFinanceOpen } = useCreator();
  const { data, err, reload } = useCreatorData();
  const [plan, setPlan] = useState(null);
  useEffect(() => { if (!String(creatorSession.token()).startsWith('sandbox.')) planStatus().then(setPlan).catch(() => setPlan(null)); }, []);
  const scans = scanLog(creator);
  if (!data) return <PageLoader />;
  const { events, stats } = data;
  const live = events.filter((e) => e.status === 'live' && !isPast(e));
  const cap = events.reduce((s, e) => s + Number(e.capacity || 0), 0);
  const sold = stats?.summary.tickets || 0;
  const today = new Date().toDateString();
  const checkins = scans.filter((s) => s.result === 'valid' && new Date(s.at).toDateString() === today).length;
  const next = [...live].sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
  const sub = plan?.subscription; const credits = plan?.credits;
  const hasOpp = events.some((e) => e.isOpportunity);

  return (
    <div className="cd">
      <div className="cd-top">
        <h1>Welcome back, <b>{creator.name}</b> <span aria-hidden="true">👋</span></h1>
        <div className="cd-top-r">
          {credits && <span className="cd-pts" title="Ticket credits left"><Icon name="ticket" size={15} /> {credits.remaining.toLocaleString('en-IN')} credits</span>}
          <button className="btn btn-ghost btn-sm" onClick={reload}><Icon name="spark" size={14} /> Refresh</button>
        </div>
      </div>
      {err && <div className="alert err" style={{ marginBottom: 18 }}><Icon name="info" />{err}</div>}

      <div className="cd-hero-row">
        <section className="cd-hero">
          <div className="cd-hero-l">
            <span className="cd-kicker"><i />{sub ? 'Your plan' : 'Organizer plans'} <em>{sub ? sub.plan : 'Free trial'}</em></span>
            <h2>{sub ? 'Keep your events selling' : 'Start selling tickets'}</h2>
            <p>{sub ? `${credits.remaining.toLocaleString('en-IN')} of ${credits.allocated.toLocaleString('en-IN')} ticket credits left · ${sub.billingPeriod === 'trial' ? 'trial ends' : 'renews'} ${new Date(sub.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : 'Choose a plan — or start a ₹0 free trial — to publish events and issue QR tickets.'}</p>
            <ul>
              <li><Icon name="check" size={15} /> 1 credit = 1 ticket issued</li>
              <li><Icon name="check" size={15} /> Free QR check-ins</li>
              <li><Icon name="check" size={15} /> ₹0 platform fee</li>
            </ul>
            <Link to="/creator/plans" className="cd-hero-btn">{sub ? 'Upgrade plan' : 'See plans'} <Icon name="arrowR" size={15} /></Link>
          </div>
          <div className="cd-hero-r">
            <span className="cd-label">{next ? 'Up next' : 'Your first event'}</span>
            <Link to={next ? '/creator/events' : '/creator/create'} className="cd-next">
              {next?.banner ? <img src={mediaUrl(next.banner)} alt="" /> : <span className="cd-next-ph"><Icon name="cal" size={34} /></span>}
              <span className="cd-next-go"><Icon name={next ? 'chevR' : 'edit'} size={20} /></span>
            </Link>
            <small className="cd-caption">{next ? `${next.name} · ${fmtDate(next.date)}` : 'Create an event and it will show here'}</small>
          </div>
        </section>
        <SalesChart events={events} stats={stats} />
      </div>

      <div className="cd-stats">
        <div><small>Tickets sold</small><b>{sold.toLocaleString('en-IN')}</b></div>
        <div><small>Live events</small><b>{live.length}</b><i>{events.length} total</i></div>
        <div><small>Check-ins today</small><b>{checkins}</b></div>
        <div><small>Conversion</small><b>{cap ? Math.round((sold / cap) * 100) : 0}%</b><i>of capacity</i></div>
      </div>

      <div className="cd-board">
        <div className="cd-sec"><span className="dot g" />Create</div>
        <div className="cd-tiles">
          <Tile to="/creator/create" icon="edit" title="Create event" sub="Banner, tickets and go live" />
          <Tile to="/creator/events" icon="cal" title="My events" sub="Everything you’ve published" />
          <Tile to="/creator/plans" icon="spark" title="Upgrade plan" sub="Credits, features and billing" tone="gold" />
          <Tile to="/creator/scanner" icon="qr" title="QR scanner" sub="Check guests in at the gate" />
        </div>
        <div className="cd-sec"><span className="dot b" />Grow</div>
        <div className="cd-tiles">
          <Tile to="/creator/staff" icon="users" title="Staff" sub="Add team, assign tickets" />
          <Tile to={hasOpp ? `/creator/opportunity/${encodeURIComponent(events.find((e) => e.isOpportunity).id)}` : '/creator/create'} icon="shield" title="Opportunity network" sub={hasOpp ? 'Staff hierarchy and sales' : 'Create an Opportunity event'} />
          <Tile to="/creator/revenue" icon="card" title="Revenue" sub="Payouts and ticket sales" />
          <Tile to="/creator/events" icon="ticket" title="Bookings" sub="Who bought, per event" />
        </div>
        <div className="cd-sec"><span className="dot o" />Money</div>
        <div className="cd-money">
          {financeOpen ? (
            <div className="fin-row">
              <div><small>Gross revenue</small><b>{money(stats?.summary.gross)}</b></div>
              <div><small>Platform fee</small><b>{money(stats?.summary.fee)}</b></div>
              <div><small>Net payout</small><b className="g">{money(stats?.summary.net)}</b></div>
            </div>
          ) : <PinGate onOpen={() => setFinanceOpen(true)} />}
        </div>
        <div className="cd-sec"><span className="dot k" />Your events<Link to="/creator/events" className="see-all">All events <Icon name="chevR" size={14} /></Link></div>
        <div className="cd-money"><EventTable events={events.slice(0, 5)} stats={stats} /></div>
      </div>
    </div>
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
