import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { GATES, STAFF_ROLES, addStaff, myEvents, staffList } from '../../lib/creator';
import { PageLoader } from '../Details';
import { CrHead } from './CreatorHome';
import { publicUrl } from '../../lib/env';

const genPw = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);

export default function Staff() {
  const { creator } = useCreator();
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { const [d, evs] = await Promise.all([staffList(creator), myEvents(creator)]); setData(d); setEvents(evs); } catch (e) { notify(e.message, 'err'); setData({ staff: [], summary: {} }); }
  }, [creator, notify]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <PageLoader />;

  return (
    <>
      <CrHead title="Manage staff" sub="Add scanners, sellers and gate managers, and assign them ticket blocks.">
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Add staff</button>
      </CrHead>
      <div className="kpis" style={{ marginTop: 0, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="kpi"><small>Total staff</small><b>{data.summary.totalStaff || 0}</b></div>
        <div className="kpi"><small>Tickets sold by staff</small><b>{data.summary.ticketsSold || 0}</b></div>
        <div className="kpi"><small>Staff revenue</small><b>₹{Number(data.summary.revenue || 0).toLocaleString('en-IN')}</b></div>
      </div>
      <div className="panel" style={{ marginTop: 24 }}>
        {data.staff.length ? (
          <div className="staff-list">
            {data.staff.map((m) => (
              <div key={m.id} className="staff-row">
                <span className="avatar">{m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span className="ev-main"><b>{m.name} {m.sandbox && <span className="status sbx" style={{ marginLeft: 6 }}>Sandbox</span>}</b><small className="mono">@{m.staffId}{m.phone ? ` · ${m.phone}` : ''}</small></span>
                <span className="pill-l">{m.role || 'Scanner'}</span>
                <span className="pill-l">{m.assignedGate || 'No gate'}</span>
                <span className="ev-num"><b>{m.soldTickets || 0}/{m.assignedTickets || 0}</b><small>sold / assigned</small></span>
                <button className="icon-btn sm" title="Copy staff share link" aria-label={`Copy share link for ${m.name}`} onClick={async () => {
                  const url = m.shareUrl || publicUrl(`/explore?staff=${encodeURIComponent(m.shareToken || m.staffId)}`);
                  try { await navigator.clipboard.writeText(url); notify('Staff share link copied'); } catch { notify(url); }
                }}><Icon name="share" size={15} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: 40 }}>
            <div className="ic"><Icon name="users" size={26} /></div>
            <h3>No staff yet</h3>
            <p>Add team members to scan tickets at the gate or sell ticket blocks for you.</p>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>Add staff member</button>
          </div>
        )}
      </div>
      {open && <AddStaff events={events} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </>
  );
}

function AddStaff({ events, onClose, onSaved }) {
  const { creator } = useCreator();
  const { notify } = useApp();
  const [f, setF] = useState({ name: '', phone: '', email: '', staffId: '', role: 'Scanner', assignedGate: '', eventId: '', tierName: '', allocationMode: 'creator_quota', qty: '', commissionRate: '', purchasePrice: '', resalePrice: '', password: genPw() });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ev = events.find((e) => e.id === f.eventId);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { const m = await addStaff(creator, { ...f, staffId: f.staffId || f.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') }); notify(`${m.name || f.name} added · password ${f.password}`); onSaved(); } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add staff member" noValidate>
        <div className="modal-head"><div><span className="eyebrow">Staff</span><h2>Add staff member</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="s-name">Full name</label><input id="s-name" className="input" value={f.name} onChange={up('name')} autoFocus /></div>
          <div className="field"><label htmlFor="s-phone">Phone</label><input id="s-phone" className="input" value={f.phone} onChange={up('phone')} /></div>
          <div className="field"><label htmlFor="s-email">Staff email</label><input id="s-email" className="input" value={f.email} onChange={up('email')} /></div>
          <div className="field"><label htmlFor="s-id">Staff login ID</label><input id="s-id" className="input mono" value={f.staffId} onChange={up('staffId')} placeholder="auto from name" /></div>
          <div className="field"><label htmlFor="s-role">Role</label><select id="s-role" className="input select" style={{ height: 50 }} value={f.role} onChange={up('role')}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="field"><label htmlFor="s-gate">Assigned gate</label><select id="s-gate" className="input select" style={{ height: 50 }} value={f.assignedGate} onChange={up('assignedGate')}><option value="">No gate</option>{GATES.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="field"><label htmlFor="s-ev">Assign to event</label><select id="s-ev" className="input select" style={{ height: 50 }} value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value, tierName: '' })}><option value="">— Assign later —</option>{events.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          {ev && <div className="field"><label htmlFor="s-tier">Ticket tier</label><select id="s-tier" className="input select" style={{ height: 50 }} value={f.tierName} onChange={up('tierName')}><option value="">Select a tier</option>{(ev.tickets || []).map((t) => <option key={t.name}>{t.name}</option>)}</select></div>}
          {ev && f.tierName && (
            <>
              <div className="field full"><label>Allocation type</label>
                <div className="tabs">
                  <button type="button" className={f.allocationMode === 'creator_quota' ? 'on' : ''} onClick={() => setF({ ...f, allocationMode: 'creator_quota' })}>Sells on your behalf</button>
                  <button type="button" className={f.allocationMode === 'staff_owned' ? 'on' : ''} onClick={() => setF({ ...f, allocationMode: 'staff_owned' })}>Buys inventory from you</button>
                </div>
              </div>
              <div className="field"><label htmlFor="s-qty">Tickets to assign</label><input id="s-qty" type="number" min="1" className="input" value={f.qty} onChange={up('qty')} /></div>
              {f.allocationMode === 'creator_quota'
                ? <div className="field"><label htmlFor="s-com">Commission % (optional)</label><input id="s-com" type="number" min="0" max="100" className="input" value={f.commissionRate} onChange={up('commissionRate')} /></div>
                : <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field"><label htmlFor="s-buy">Buy price</label><input id="s-buy" type="number" className="input" value={f.purchasePrice} onChange={up('purchasePrice')} /></div>
                    <div className="field"><label htmlFor="s-res">Resale price</label><input id="s-res" type="number" className="input" value={f.resalePrice} onChange={up('resalePrice')} /></div>
                  </div>}
            </>
          )}
          <div className="field full"><label htmlFor="s-pw">Temporary password</label>
            <div style={{ display: 'flex', gap: 10 }}><input id="s-pw" className="input mono" value={f.password} onChange={up('password')} /><button type="button" className="btn btn-ghost" onClick={() => setF({ ...f, password: genPw() })}>Generate</button></div>
          </div>
        </div>
        {err && <div className="alert err" style={{ marginTop: 16 }}><Icon name="info" />{err}</div>}
        <div className="wiz-foot"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}Add staff member</button></div>
      </form>
    </div>
  );
}
