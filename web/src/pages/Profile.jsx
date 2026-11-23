import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCreator } from '../lib/creatorStore';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { ThemeSwitch } from '../lib/theme';
import { IS_SANDBOX, storage } from '../lib/api';
import { displayName, initials } from '../lib/utils';
import { useMyBookings } from './MyBookings';

const PREFS_KEY = 'beeoak.web.prefs';

export default function Profile() {
  const { user, saveProfile, notify, setSignOutAsk } = useApp();
  const bookings = useMyBookings();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'details';
  const setTab = (t) => setParams(t === 'details' ? {} : { tab: t }, { replace: true });
  const [form, setForm] = useState({ firstName: user.firstName || '', lastName: user.lastName || '', city: user.city || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [prefs, setPrefs] = useState(() => storage.get(PREFS_KEY, { reminders: true, offers: false, whatsapp: true }));
  const dirty = form.firstName !== (user.firstName || '') || form.lastName !== (user.lastName || '') || form.city !== (user.city || '');

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (form.firstName.trim().length < 2) { setErr('Enter a valid first name'); return; }
    setBusy(true);
    try { await saveProfile({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), city: form.city.trim() }); notify('Profile updated'); } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const togglePref = (k) => { const n = { ...prefs, [k]: !prefs[k] }; setPrefs(n); storage.set(PREFS_KEY, n); };

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="crumbs"><Link to="/dashboard">Dashboard</Link><span>/</span><span>Profile</span></div>
        <h1>Profile & settings</h1>
      </div>
      <div className="profile-grid">
        <aside className="panel profile-card">
          <span className="avatar lg">{initials(user)}</span>
          <h3>{displayName(user)}</h3>
          <p className="muted" style={{ fontSize: 14 }}>{user.email}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 18 }}>
            <div><b style={{ fontSize: 22 }}>{bookings ? bookings.length : '–'}</b><div className="muted" style={{ fontSize: 12.5 }}>Bookings</div></div>
            <div><b style={{ fontSize: 22 }}>{user.city || '—'}</b><div className="muted" style={{ fontSize: 12.5 }}>City</div></div>
          </div>
          <nav className="side-nav">
            <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}><Icon name="user" /> Personal details</button>
            <button className={tab === 'prefs' ? 'on' : ''} onClick={() => setTab('prefs')}><Icon name="bell" /> Notifications</button>
            <button className={tab === 'security' ? 'on' : ''} onClick={() => setTab('security')}><Icon name="lock" /> Security</button>
            <button className={tab === 'creator' ? 'on' : ''} onClick={() => setTab('creator')}><Icon name="spark" /> Creator mode</button>
            <Link to="/bookings"><Icon name="ticket" /> My bookings</Link>
            <button onClick={() => setSignOutAsk(true)}><Icon name="logout" /> Sign out</button>
          </nav>
        </aside>
        <div>
          {tab === 'details' && (
            <form className="panel pd-form" onSubmit={save}>
              <h3>Personal details</h3>
              <p className="muted" style={{ fontSize: 14, marginTop: -6, marginBottom: 22 }}>This name appears on your tickets.</p>
              <div className="form-grid">
                <div className="field"><label htmlFor="p-fn">First name</label><input id="p-fn" className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                <div className="field"><label htmlFor="p-ln">Last name</label><input id="p-ln" className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
                <div className="field"><label htmlFor="p-em">Email</label><input id="p-em" className="input" value={user.email || ''} readOnly /></div>
                <div className="field"><label htmlFor="p-ph">Mobile</label><input id="p-ph" className="input" value={user.phone ? `+91 ${user.phone}` : '—'} readOnly /></div>
                <div className="field full"><label htmlFor="p-city">City</label><input id="p-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              </div>
              {err && <div className="alert err" style={{ marginTop: 18 }}><Icon name="info" />{err}</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn btn-primary" disabled={!dirty || busy}>{busy ? <span className="spinner" /> : null} Save changes</button>
                <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => setForm({ firstName: user.firstName || '', lastName: user.lastName || '', city: user.city || '' })}>Discard</button>
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>Email and mobile are verified identifiers and can be changed from the BEE-OAK app or by contacting support.</p>
            </form>
          )}
          {tab === 'prefs' && (
            <div className="panel">
              <div className="pref"><div><b>Appearance</b><small>Choose light or dark</small></div><ThemeSwitch /></div>
              <h3 style={{ marginTop: 22 }}>Notifications</h3>
              {[['reminders', 'Event reminders', 'A reminder 24 hours and 2 hours before your event'], ['whatsapp', 'Ticket on WhatsApp', 'Receive your QR ticket on WhatsApp after booking'], ['offers', 'Offers & new events', 'Occasional picks from your city']].map(([k, t, s]) => (
                <div key={k} className="pref"><div><b>{t}</b><small>{s}</small></div><button className={`toggle${prefs[k] ? ' on' : ''}`} onClick={() => togglePref(k)} aria-pressed={prefs[k]} aria-label={t} /></div>
              ))}
            </div>
          )}
          {tab === 'creator' && <CreatorTab />}
          {tab === 'security' && (
            <div className="panel">
              <h3>Security</h3>
              <div className="pref"><div><b>Password</b><small>Reset your password using a secure email link</small></div><Link to="/login?mode=forgot" className="btn btn-ghost btn-sm">Reset password</Link></div>
              <div className="pref"><div><b>Signed-in session</b><small>{IS_SANDBOX && String(user.id).startsWith('SBX') ? 'Sandbox account stored in this browser' : 'Secure 30-day session token'}</small></div><button className="btn btn-ghost btn-sm" onClick={() => setSignOutAsk(true)}>Sign out</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatorTab() {
  const { creator, logout } = useCreator();
  const { notify } = useApp();
  if (!creator) return (
    <div className="panel creator-tab">
      <div className="creator-hero">
        <span className="eyebrow">Creator mode</span>
        <h2>Host events on BEE-OAK</h2>
        <p>Switch to creator mode to publish events, sell tiered tickets, track revenue, add staff and scan tickets at the gate — the same tools as the BEE-OAK creator app.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          <Link to="/creator" className="btn btn-gold btn-lg">Switch to creator mode <Icon name="arrowR" size={16} /></Link>
          <Link to="/creator?mode=apply" className="btn btn-lg" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.3)' }}>Apply for creator access</Link>
        </div>
      </div>
      <div className="creator-feats">
        {[['edit', 'Publish events', 'Banner, details, venue, tiers — live in six steps'], ['card', 'Revenue & payouts', 'Protected by your 4-digit finance PIN'], ['qr', 'QR check-in', 'Scan tickets with your laptop camera'], ['users', 'Staff', 'Gates, roles and ticket allocations']].map(([i, t, d]) => (
          <div key={t}><span className="ic"><Icon name={i} /></span><b>{t}</b><small>{d}</small></div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="panel">
      <h3>Creator mode</h3>
      <div className="pref"><div><b>{creator.name}</b><small>{creator.email} · {creator.category || 'Creator'} · KYC {creator.kycStatus || 'Approved'}</small></div><span className="status up">Active</span></div>
      <div className="pref"><div><b>Creator dashboard</b><small>Events, revenue, staff and QR scanner</small></div><Link to="/creator" className="btn btn-primary btn-sm">Open dashboard</Link></div>
      <div className="pref"><div><b>Publish a new event</b><small>Six-step wizard, same as the app</small></div><Link to="/creator/create" className="btn btn-ghost btn-sm">Create event</Link></div>
      <div className="pref"><div><b>Exit creator mode</b><small>Signs out of your creator account on this browser</small></div><button className="btn btn-ghost btn-sm" onClick={() => { logout(); notify('Signed out of creator mode'); }}>Exit creator mode</button></div>
    </div>
  );
}
