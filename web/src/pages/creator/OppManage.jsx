import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { oppAddStaff, oppAllocate, oppManage, oppSettings, oppStaffDetail } from '../../lib/creator';
import { recruitLink } from '../../lib/staff';
import { fmtDate, fmtINR } from '../../lib/utils';
import { PageLoader } from '../Details';
import { CrHead } from './CreatorHome';

const money = (n) => (Number(n || 0) === 0 ? '₹0' : fmtINR(n));
const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function OppManage() {
  const { id } = useParams();
  const { notify } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('staff');
  const [qr, setQr] = useState('');
  const [add, setAdd] = useState(null);
  const [created, setCreated] = useState(null);
  const [alloc, setAlloc] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => { try { setD(await oppManage(id)); } catch (e) { setErr(e.message); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const link = d ? recruitLink(d.event.id, { code: d.settings.recruitCode }) : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: '#04331F', light: '#FFFFFF' } }).then(setQr); }, [link]);

  const byId = useMemo(() => Object.fromEntries((d?.staff || []).map((s) => [s.id, s])), [d]);
  const top = useMemo(() => [...(d?.staff || [])].sort((a, b) => b.progress.sold - a.progress.sold)[0], [d]);

  if (err) return <div className="empty"><h3>Can’t open this event</h3><p>{err}</p><Link to="/creator/events" className="btn btn-primary">My events</Link></div>;
  if (!d) return <PageLoader />;
  const T = d.totals;
  const primaries = d.staff.filter((s) => !s.parentId);
  const allocOf = (sid) => d.allocations.filter((a) => a.staffId === sid);

  return (
    <>
      <CrHead title={d.event.name} sub={`Opportunity event · ${fmtDate(d.event.date)} · ${d.event.venue}, ${d.event.city} · Event ID ${d.event.id}`}>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        <Link to={`/opportunity/event/${encodeURIComponent(d.event.id)}`} className="btn btn-ghost btn-sm">Public page</Link>
        <button className="btn btn-primary btn-sm" onClick={() => setAdd({ name: '', email: '', phone: '' })}>+ Add primary staff</button>
      </CrHead>

      <div className="kpis kpis-6" style={{ marginTop: 0 }}>
        {[['Total tickets', T.totalTickets], ['Allocated to staff', T.allocated], ['Purchased by staff', T.purchased], ['Sold to customers', T.sold], ['Remaining', T.remaining], ['Bookings', T.bookings]].map(([l, v]) => <div key={l} className="kpi"><small>{l}</small><b>{v}</b></div>)}
      </div>
      <div className="fin-row" style={{ marginTop: 16 }}>
        <div><small>Customer revenue (incl. fees)</small><b>{money(T.revenue)}</b></div>
        <div><small>Staff purchases received</small><b className="g">{money(T.staffPurchaseRevenue)}</b></div>
        <div><small>Payment status</small><b style={{ fontSize: 16 }}>{T.pendingStaffPayments ? `${T.pendingStaffPayments} staff payment(s) pending` : 'All staff payments settled'}</b></div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-h"><h3>Staff recruitment link</h3>
            <label className="sw"><input type="checkbox" checked={d.settings.recruitmentEnabled} onChange={async (e) => { await oppSettings(id, { recruitmentEnabled: e.target.checked }); notify(e.target.checked ? 'Recruitment opened' : 'Recruitment closed'); load(); }} /> Recruitment {d.settings.recruitmentEnabled ? 'open' : 'closed'}</label>
          </div>
          <div className="share-card">
            {qr && <img src={qr} alt="Recruitment QR code" />}
            <div className="share-body">
              <b>Primary staff join here</b><small>Anyone with this link joins directly under you. Each staff member then gets their own link for their team.</small>
              <div className="share-url mono" title={link}>{link}</div>
              <div className="share-actions">
                <button className="btn btn-primary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); notify('Recruitment link copied'); } catch { notify(link); } }}>Copy link</button>
                <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`Join my staff team for ${d.event.name} on BEE-OAK: ${link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <button className="btn btn-ghost btn-sm" onClick={async () => { await oppSettings(id, { regenerateCode: true }); notify('New link generated — the old one no longer works'); load(); }}>Regenerate</button>
              </div>
            </div>
          </div>
          <div className="settings-row">
            <span>Max levels <b>{d.settings.maxDepth}</b></span><span>Recruits per staff <b>{d.settings.maxDirectRecruits}</b></span><span>Staff pool <b>{d.settings.staffPool || 'All tickets'}</b></span><span>Purchase limit <b>{d.settings.minPurchase}–{d.settings.maxPurchase}</b></span>
          </div>
        </div>
        <div className="panel">
          <h3>Top performer</h3>
          {top && top.progress.sold > 0 ? (
            <div className="top-seller">
              <span className="avatar lg">{initials(top.name)}</span>
              <div><b>{top.name}</b><small className="mono">{top.staffCode}</small><div style={{ marginTop: 8 }}>{top.progress.sold} tickets · {money(top.progress.salesAmount)}</div></div>
            </div>
          ) : <p className="muted" style={{ fontSize: 14 }}>No staff sales yet.</p>}
          <h3 style={{ marginTop: 22 }}>Staff overview</h3>
          <div className="line-item"><span>Primary staff</span><b>{T.primaryStaff}</b></div>
          <div className="line-item"><span>Total staff (all levels)</span><b>{T.staffCount}</b></div>
          <div className="line-item"><span>Organizer pool left to sell to staff</span><b>{T.organizerPool}</b></div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="tabs" style={{ marginBottom: 18 }}>
          {[['staff', 'Staff-wise analytics'], ['tree', 'Hierarchy'], ['bookings', `Bookings (${d.bookings.length})`], ['payments', `Staff payments (${d.purchases.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'staff' && (d.staff.length ? (
          <div className="team-table">
            <div className="tt-head tt-org"><span>Staff</span><span>Allocated</span><span>Purchased</span><span>Sold</span><span>Remaining</span><span>Sales</span><span>Payment</span><span /></div>
            {[...d.staff].sort((a, b) => b.progress.sold - a.progress.sold).map((s) => (
              <div key={s.id} className="tt-row tt-org">
                <span className="tt-name"><span className="avatar sm">{initials(s.name)}</span><span><b>{s.name}{top && s.id === top.id && s.progress.sold > 0 ? ' ★' : ''}</b><small className="mono">{s.staffCode} · {s.parentId ? `under ${byId[s.parentId]?.staffCode}` : 'primary'}</small></span></span>
                <span>{s.progress.allocated}</span><span>{s.progress.purchased}</span><span>{s.progress.sold}</span><span>{s.progress.remaining}</span><span>{money(s.progress.salesAmount)}</span>
                <span><span className={`status ${s.progress.paymentStatus === 'Paid' ? 'up' : s.progress.paymentStatus === 'Payment pending' ? 'sbx' : 'past'}`}>{s.progress.paymentStatus === 'No purchases yet' ? '—' : s.progress.paymentStatus}</span></span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {!s.parentId && <button className="btn btn-ghost btn-sm" onClick={() => { const cur = allocOf(s.id)[0]; setAlloc({ staff: s, tierName: cur?.tierName || d.event.tickets[0]?.name, qty: cur?.qty ?? '', unitPrice: cur?.unitPrice ?? d.event.tickets[0]?.price ?? 0 }); }}>Allocate</button>}
                  <button className="icon-btn sm" aria-label={`Open ${s.name}`} onClick={async () => setDetail(await oppStaffDetail(id, s.id))}><Icon name="chevR" size={15} /></button>
                </span>
              </div>
            ))}
          </div>
        ) : <div className="empty" style={{ padding: 36 }}><h3>No staff yet</h3><p>Add primary staff, or share the recruitment link.</p><button className="btn btn-primary" onClick={() => setAdd({ name: '', email: '', phone: '' })}>Add primary staff</button></div>)}
        {tab === 'tree' && (
          <div className="tree">
            <div className="tree-root"><Icon name="spark" size={16} /> Organizer</div>
            {primaries.length ? <TreeLevel parentId={null} staff={d.staff} onOpen={async (s) => setDetail(await oppStaffDetail(id, s.id))} /> : <p className="muted">No staff yet.</p>}
          </div>
        )}
        {tab === 'bookings' && (d.bookings.length ? d.bookings.map((b) => <div key={b.id} className="line-item"><span>{b.buyer} · {b.tier} × {b.qty} · via <b>{b.staff}</b></span><b>{money(b.total)}</b></div>) : <p className="muted">No customer bookings yet.</p>)}
        {tab === 'payments' && (d.purchases.length ? d.purchases.map((p) => <div key={p.id} className="line-item"><span>{p.buyer} → {p.seller} · {p.qty} {p.tierName}</span><b>{money(p.total)} <span className={`status ${p.status === 'paid' ? 'up' : 'sbx'}`}>{p.status === 'paid' ? 'Paid' : 'Pending'}</span></b></div>) : <p className="muted">No staff ticket purchases yet.</p>)}
      </div>

      {add && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setAdd(null); }}>
          <form className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="Add primary staff" onSubmit={async (e) => {
            e.preventDefault();
            try { const r = await oppAddStaff(id, add); setAdd(null); setCreated({ ...r, name: add.name }); load(); } catch (ex) { notify(ex.message, 'err'); }
          }}>
            <div className="modal-head"><div><span className="eyebrow">Primary staff</span><h2>Add staff member</h2></div><button type="button" className="icon-btn" onClick={() => setAdd(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="form-grid">
              <div className="field full"><label htmlFor="ps-name">Full name</label><input id="ps-name" className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} autoFocus /></div>
              <div className="field"><label htmlFor="ps-email">Email</label><input id="ps-email" className="input" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></div>
              <div className="field"><label htmlFor="ps-phone">Phone</label><input id="ps-phone" className="input" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>If this email already has a BEE-OAK account it’s linked — no duplicate account is created. Otherwise a temporary password is generated.</p>
            <div className="wiz-foot"><button type="button" className="btn btn-ghost" onClick={() => setAdd(null)}>Cancel</button><button className="btn btn-primary">Add staff</button></div>
          </form>
        </div>
      )}
      {created && (
        <div className="modal-scrim">
          <div className="modal" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-label="Staff created">
            <span className="eyebrow">Staff added</span>
            <h2 style={{ margin: '6px 0 12px' }}>{created.name} · <span className="mono">{created.staff.staffCode}</span></h2>
            <div className="line-item"><span>Staff login email</span><b>{created.login.email}</b></div>
            {created.login.tempPassword ? <div className="line-item"><span>Temporary password</span><b className="mono" data-testid="temp-password">{created.login.tempPassword}</b></div> : <p className="muted" style={{ fontSize: 14 }}>They sign in with their existing BEE-OAK password.</p>}
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Share these with the staff member — they choose “Staff” on the BEE-OAK sign-in page. This password is shown only once.</p>
            <div className="wiz-foot"><span /><button className="btn btn-primary" onClick={() => setCreated(null)}>Done</button></div>
          </div>
        </div>
      )}
      {alloc && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setAlloc(null); }}>
          <form className="modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label="Allocate tickets" onSubmit={async (e) => {
            e.preventDefault();
            try { await oppAllocate(id, { staffId: alloc.staff.id, tierName: alloc.tierName, qty: Number(alloc.qty), unitPrice: Number(alloc.unitPrice) }); notify(`Allocated ${alloc.qty} ${alloc.tierName} tickets to ${alloc.staff.name}`); setAlloc(null); load(); } catch (ex) { notify(ex.message, 'err'); }
          }}>
            <div className="modal-head"><div><span className="eyebrow">Ticket allocation</span><h2>{alloc.staff.name}</h2></div><button type="button" className="icon-btn" onClick={() => setAlloc(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="form-grid">
              <div className="field full"><label htmlFor="oa-tier">Ticket category</label><select id="oa-tier" className="input select" style={{ height: 50 }} value={alloc.tierName} onChange={(e) => setAlloc({ ...alloc, tierName: e.target.value })}>{d.event.tickets.map((t) => <option key={t.name}>{t.name}</option>)}</select></div>
              <div className="field"><label htmlFor="oa-qty">Tickets to allocate</label><input id="oa-qty" className="input" type="number" min="0" value={alloc.qty} onChange={(e) => setAlloc({ ...alloc, qty: e.target.value })} /></div>
              <div className="field"><label htmlFor="oa-price">Staff buy price (per ticket)</label><input id="oa-price" className="input" type="number" min="0" value={alloc.unitPrice} onChange={(e) => setAlloc({ ...alloc, unitPrice: e.target.value })} /></div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>The staff member buys up to this many tickets from you at this price, then sells them to customers or passes them to their team.</p>
            <div className="wiz-foot"><button type="button" className="btn btn-ghost" onClick={() => setAlloc(null)}>Cancel</button><button className="btn btn-primary">Save allocation</button></div>
          </form>
        </div>
      )}
      {detail && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`${detail.staff.name} details`}>
            <div className="modal-head"><div><span className="eyebrow mono">{detail.staff.staffCode}</span><h2>{detail.staff.name}</h2><small className="muted">{detail.staff.email}{detail.staff.phone ? ` · ${detail.staff.phone}` : ''}</small></div><button className="icon-btn" onClick={() => setDetail(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="kpis" style={{ marginTop: 0, gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              {[['Purchased', detail.staff.progress.purchased], ['Sold', detail.staff.progress.sold], ['Remaining', detail.staff.progress.remaining], ['Sales', money(detail.staff.progress.salesAmount)]].map(([l, v]) => <div key={l} className="kpi"><small>{l}</small><b style={{ fontSize: 24 }}>{v}</b></div>)}
            </div>
            <h3 style={{ margin: '20px 0 8px' }}>Downstream team ({detail.team.length})</h3>
            {detail.team.length ? detail.team.map((t) => <div key={t.id} className="line-item"><span>{t.isDirect ? '' : '↳ '}{t.name} <small className="mono">{t.staffCode}</small></span><b>{t.progress.sold} sold · {money(t.progress.salesAmount)}</b></div>) : <p className="muted" style={{ fontSize: 14 }}>No recruits yet.</p>}
            <h3 style={{ margin: '20px 0 8px' }}>Booking history</h3>
            {detail.bookings.length ? detail.bookings.map((b) => <div key={b.id} className="line-item"><span>{b.buyer} · {b.tier} × {b.qty}</span><b>{money(b.amount)}</b></div>) : <p className="muted" style={{ fontSize: 14 }}>No bookings yet.</p>}
            <h3 style={{ margin: '20px 0 8px' }}>Payment history</h3>
            {detail.payments.length ? detail.payments.map((p) => <div key={p.id} className="line-item"><span>{p.qty} {p.tier} → {p.to}</span><b>{money(p.total)} <span className={`status ${p.status === 'paid' ? 'up' : 'sbx'}`}>{p.status}</span></b></div>) : <p className="muted" style={{ fontSize: 14 }}>No payments yet.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function TreeLevel({ parentId, staff, onOpen }) {
  const kids = staff.filter((s) => (s.parentId || null) === parentId);
  if (!kids.length) return null;
  return (
    <ul>
      {kids.map((s) => (
        <li key={s.id}>
          <button className="tree-node" onClick={() => onOpen(s)}>
            <span className="avatar sm">{initials(s.name)}</span>
            <span><b>{s.name}</b><small className="mono">{s.staffCode}</small></span>
            <span className="tree-stat">{s.progress.sold} sold · {money(s.progress.salesAmount)}</span>
          </button>
          <TreeLevel parentId={s.id} staff={staff} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
