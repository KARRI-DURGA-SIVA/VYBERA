import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import EventCard from '../../components/EventCard';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { IS_SANDBOX } from '../../lib/api';
import { publishEvent } from '../../lib/creator';
import { CREATE_CATEGORIES } from '../../lib/utils';
import { searchPlaces } from '../../lib/location';
import { fmtINR, fmtLongDate } from '../../lib/utils';
import { CrHead } from './CreatorHome';

const CAT_INFO = {
  Opportunity: { icon: 'brief', d: 'Staff-based selling with recruitment, referral links and hierarchy tracking' },
  Music: { icon: 'music', d: 'Concerts, gigs and DJ nights' },
  Food: { icon: 'food', d: 'Food festivals, tastings and pop-ups' },
  Free: { icon: 'gift', d: 'Free registration — tickets are ₹0' },
  'College Art': { icon: 'college', d: 'Campus fests, exhibitions and art shows' },
  Comedy: { icon: 'comedy', d: 'Stand-up, improv and open mics' },
};
const PRESETS = {
  'Free event': [{ name: 'Free Entry', price: 0, qty: 200, perks: 'Open access' }],
  'General + VIP': [{ name: 'General Admission', price: 499, qty: 300, perks: 'Standard entry' }, { name: 'VIP Pass', price: 1499, qty: 50, perks: 'VIP lounge + Merch' }],
  'Concert tiers': [{ name: 'Early Bird', price: 399, qty: 100, perks: 'Limited early pricing' }, { name: 'Silver', price: 799, qty: 300, perks: 'Standing zone' }, { name: 'Gold', price: 1499, qty: 150, perks: 'Front zone' }, { name: 'Platinum', price: 2999, qty: 50, perks: 'Fan pit + Meet & greet' }],
  Conference: [{ name: 'Delegate', price: 999, qty: 200, perks: 'All sessions + lunch' }, { name: 'Student', price: 299, qty: 100, perks: 'All sessions, valid ID' }],
};
const VIS = [
  { key: 'Public', icon: 'globe', t: 'Public', d: 'Anyone can discover and book' },
  { key: 'Private', icon: 'lock', t: 'Private', d: 'Only people with the link' },
  { key: 'Invite Only', icon: 'mail', t: 'Invite only', d: 'You control who gets invited' },
];
const to12h = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const DRAFT = 'beeoak.web.creator.draft';

export default function CreateEvent() {
  const { creator } = useCreator();
  const { notify, loadEvents } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [extra, setExtra] = useState([]);
  const [preview, setPreview] = useState('');
  const [ev, setEv] = useState(() => {
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); if (d) return d; } catch { /* ignore */ }
    return { name: '', category: '', description: '', date: '', start: '18:00', end: '', venue: '', city: '', capacity: '', latitude: '', longitude: '', visibility: 'Public', tickets: PRESETS['General + VIP'], minQty: 1, maxQty: 10,
      opp: { recruitmentEnabled: true, staffPool: '', maxDepth: 4, maxDirectRecruits: 25, minPurchase: 1, maxPurchase: 500, commissionRate: 0 } };
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState({ q: '', results: [], busy: false });

  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify(ev)); } catch { /* ignore */ } }, [ev]);
  const isOpp = ev.category === 'Opportunity';
  const isFree = ev.category === 'Free';
  const STEPS = ['Category', 'Media', 'Details', 'Venue', 'Tickets', ...(isOpp ? ['Staff & recruitment'] : []), 'Preview', 'Publish'];
  const last = STEPS.length - 1;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const up = (k) => (e) => setEv({ ...ev, [k]: e.target.value });

  const pickFile = (f) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErrors({ banner: 'Choose a JPG or PNG image' }); return; }
    if (f.size > 20 * 1024 * 1024) { setErrors({ banner: 'Image must be under 20 MB' }); return; }
    setErrors({}); setFile(f); setPreview(URL.createObjectURL(f));
  };

  const today = new Date().toISOString().slice(0, 10);
  const validate = (s) => {
    const e = {};
    const n = STEPS[s];
    if (n === 'Category' && !ev.category) e.category = 'Choose a category to continue';
    if (n === 'Media' && !file) e.banner = 'Upload a banner to continue';
    if (n === 'Details') {
      if (ev.name.trim().length < 3) e.name = 'Give your event a name';
      if (!ev.date) e.date = 'Pick a date'; else if (ev.date < today) e.date = 'Date can’t be in the past';
      if (!ev.start) e.start = 'Pick a start time';
      if (ev.description.trim().length < 10) e.description = 'Describe the event in at least 10 characters';
    }
    if (n === 'Venue') {
      if (!ev.venue.trim()) e.venue = 'Enter the venue name';
      if (!ev.city.trim()) e.city = 'Enter the city';
      if (!(Number(ev.capacity) > 0)) e.capacity = 'Enter capacity';
    }
    if (n === 'Tickets') {
      if (!(Number(ev.minQty) >= 1) || Number(ev.maxQty) < Number(ev.minQty)) e.qty = 'Maximum must be at least the minimum';
      const valid = ev.tickets.filter((t) => t.name.trim() && Number(t.qty) > 0 && Number(t.price) >= 0);
      if (!valid.length) e.tickets = 'Add at least one ticket tier with a name and quantity';
      else if (valid.reduce((a, t) => a + Number(t.qty), 0) > Number(ev.capacity)) e.tickets = `Total tickets exceed venue capacity (${ev.capacity})`;
    }
    if (n === 'Staff & recruitment' && Number(ev.opp.staffPool) > ev.tickets.reduce((a, t) => a + Number(t.qty || 0), 0)) e.opp = 'Staff pool can’t exceed total tickets';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const next = () => { if (validate(step)) setStep(step + 1); };

  const findVenue = async () => {
    const q = geo.q.trim() || [ev.venue, ev.city].filter(Boolean).join(', ');
    if (q.length < 3) return;
    setGeo({ ...geo, busy: true });
    try { setGeo({ q, results: await searchPlaces(q), busy: false }); } catch { setGeo({ q, results: [], busy: false }); notify('Map search is unavailable right now', 'err'); }
  };

  const tier = (i, k, v) => setEv({ ...ev, tickets: ev.tickets.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });

  const payload = () => ({
    minQty: Number(ev.minQty), maxQty: Number(ev.maxQty),
    ...(isOpp ? { opportunity: { ...ev.opp, staffPool: Number(ev.opp.staffPool) || 0 } } : {}),
    name: ev.name.trim(), category: ev.category, description: ev.description.trim(), date: ev.date, time: to12h(ev.start), endTime: to12h(ev.end),
    venue: ev.venue.trim(), city: ev.city.trim(), capacity: Number(ev.capacity), latitude: ev.latitude || null, longitude: ev.longitude || null,
    visibility: ev.visibility, tickets: isFree ? ev.tickets.map((t) => ({ ...t, price: 0 })) : ev.tickets,
  });

  const publish = async () => {
    setBusy(true);
    try {
      const res = await publishEvent(creator, payload(), file, extra);
      const saved = res.event;
      sessionStorage.removeItem(DRAFT);
      await loadEvents(true);
      notify(`“${saved.name}” is live · Event ID ${saved.id}`);
      nav(saved.isOpportunity && !saved.sandbox ? `/creator/opportunity/${encodeURIComponent(saved.id)}` : '/creator/events');
    } catch (e) { notify(e.message, 'err'); setBusy(false); }
  };

  const previewEv = { ...payload(), id: 'preview', banner: preview, time: to12h(ev.start), creatorName: creator.name, bookingCount: 0 };
  const err = (k) => errors[k] && <span className="field-err">{errors[k]}</span>;

  return (
    <>
      <CrHead title="Create event" sub={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}${ev.category ? ` · ${ev.category}` : ''}`} />
      <div className="wiz-steps">
        {STEPS.map((s, i) => (
          <button key={s} className={`wiz-step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`} onClick={() => i < step && setStep(i)} disabled={i > step}>
            <i>{i < step ? '✓' : i + 1}</i><span>{s}</span>
          </button>
        ))}
      </div>

      <div className="panel wiz-panel">
        {STEPS[step] === 'Category' && (
          <>
            <h3>Choose a category</h3>
            <p className="muted wiz-sub">The category decides the workflow. Only Opportunity events use staff recruitment, referral links and staff-wise sales tracking.</p>
            <div className="cat-cards">
              {CREATE_CATEGORIES.map((c) => (
                <button type="button" key={c} className={`cat-card${ev.category === c ? ' on' : ''}${c === 'Opportunity' ? ' cat-opp' : ''}`} onClick={() => setEv({ ...ev, category: c, tickets: c === 'Free' ? [{ name: 'Free Entry', price: 0, qty: Number(ev.capacity) || 200, perks: 'Free registration' }] : ev.category === 'Free' ? PRESETS['General + VIP'] : ev.tickets })} aria-pressed={ev.category === c}>
                  <span className="ic"><Icon name={CAT_INFO[c].icon} size={22} /></span>
                  <b>{c}</b><small>{CAT_INFO[c].d}</small>
                  {c === 'Opportunity' && <span className="cat-badge">Staff workflow</span>}
                </button>
              ))}
            </div>
            {err('category')}
          </>
        )}

        {STEPS[step] === 'Media' && (
          <>
            <h3>Upload banner</h3>
            <p className="muted wiz-sub">A tall poster works best (3:4). It’s the first thing buyers see.</p>
            <label className={`drop${preview ? ' has' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}>
              <input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files[0])} data-testid="banner-input" />
              {preview ? <img src={preview} alt="Banner preview" /> : (
                <span className="drop-empty"><Icon name="download" size={30} /><b>Drop an image or click to upload</b><small>JPG, PNG · max 20 MB{IS_SANDBOX ? ' · under 3 MB in sandbox' : ''}</small></span>
              )}
            </label>
            {err('banner')}
            <div className="field" style={{ marginTop: 20 }}>
              <label>Event photos & video <span className="muted">(optional)</span></label>
              <label className="kyc" style={{ maxWidth: 420 }}>
                <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden data-testid="media-input" onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const tooBig = files.find((f) => f.size > (f.type.startsWith('video/') ? 20 : 8) * 1024 * 1024);
                  if (tooBig) { notify(`${tooBig.name} is too large (photos 8 MB, video 20 MB)`, 'err'); return; }
                  setExtra([...extra, ...files].slice(0, 8));
                }} />
                <Icon name="download" size={18} /><span><b>Add photos or a video</b><small>Up to 8 files · photos 8 MB · video 20 MB</small></span>
              </label>
              {extra.length > 0 && (
                <div className="media-chips">
                  {extra.map((f, i) => <span key={i} className="pill-l">{f.type.startsWith('video/') ? '🎬' : '🖼'} {f.name} <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>×</button></span>)}
                </div>
              )}
            </div>
          </>
        )}

        {STEPS[step] === 'Details' && (
          <>
            <h3>Event details</h3>
            <p className="muted wiz-sub">Tell people what your event is about.</p>
            <div className="form-grid">
              <div className="field full"><label htmlFor="e-name">Event name</label><input id="e-name" className={`input${errors.name ? ' err' : ''}`} value={ev.name} onChange={up('name')} />{err('name')}</div>
              <div className="field"><label htmlFor="e-date">Event date</label><input id="e-date" type="date" min={today} className={`input${errors.date ? ' err' : ''}`} value={ev.date} onChange={up('date')} />{err('date')}</div>
              <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label htmlFor="e-start">Start time</label><input id="e-start" type="time" className="input" value={ev.start} onChange={up('start')} /></div>
                <div className="field"><label htmlFor="e-end">End time <span className="muted">(optional)</span></label><input id="e-end" type="time" className="input" value={ev.end} onChange={up('end')} /></div>
              </div>
              <div className="field full"><label htmlFor="e-desc">Description</label><textarea id="e-desc" className={`input${errors.description ? ' err' : ''}`} value={ev.description} onChange={up('description')} placeholder="Line-up, what to expect, who it’s for…" />{err('description')}</div>
            </div>
          </>
        )}

        {STEPS[step] === 'Venue' && (
          <>
            <h3>Venue</h3>
            <p className="muted wiz-sub">Where is your event happening? Pinning it on the map shows buyers how far away it is.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="e-venue">Venue name</label><input id="e-venue" className={`input${errors.venue ? ' err' : ''}`} value={ev.venue} onChange={up('venue')} />{err('venue')}</div>
              <div className="field"><label htmlFor="e-city">City</label><input id="e-city" className={`input${errors.city ? ' err' : ''}`} value={ev.city} onChange={up('city')} />{err('city')}</div>
              <div className="field"><label htmlFor="e-cap">Capacity</label><input id="e-cap" type="number" min="1" className={`input${errors.capacity ? ' err' : ''}`} value={ev.capacity} onChange={up('capacity')} />{err('capacity')}</div>
              <div className="field full"><label htmlFor="e-geo">Pin on map <span className="muted">(optional)</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input id="e-geo" className="input" placeholder="Search address, e.g. Phoenix Marketcity, Bengaluru" value={geo.q} onChange={(e) => setGeo({ ...geo, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findVenue(); } }} />
                  <button type="button" className="btn btn-ghost" onClick={findVenue} disabled={geo.busy}>{geo.busy ? <span className="spinner dark" /> : <Icon name="search" size={16} />} Find</button>
                </div>
                {geo.results.length > 0 && (
                  <div className="loc-results" style={{ marginTop: 8 }}>
                    {geo.results.map((r) => (
                      <button type="button" key={`${r.lat},${r.lng}`} className="loc-row" onClick={() => { setEv({ ...ev, latitude: r.lat.toFixed(6), longitude: r.lng.toFixed(6), city: ev.city || r.city }); setGeo({ ...geo, results: [] }); }}>
                        <Icon name="pin" size={16} /><span><b>{r.area ? `${r.area}, ${r.city}` : r.city}</b><small>{r.display}</small></span>
                      </button>
                    ))}
                  </div>
                )}
                {ev.latitude && <div className="alert ok" style={{ marginTop: 10 }}><Icon name="check" /> Pinned at {ev.latitude}, {ev.longitude} <a className="link" style={{ marginLeft: 'auto' }} href={`https://www.google.com/maps/search/?api=1&query=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer">Open in Google Maps</a></div>}
              </div>
            </div>
          </>
        )}

        {STEPS[step] === 'Tickets' && (
          <>
            <h3>Ticket tiers</h3>
            <p className="muted wiz-sub">{isFree ? 'Free event — every ticket category is ₹0 and customers register without payment.' : 'Set up pricing for each ticket category. Buyers pay an 8% convenience fee + GST on top.'}</p>
            {!isFree && <div className="chips" style={{ marginBottom: 18 }}>
              <span className="muted" style={{ fontSize: 13.5, alignSelf: 'center' }}>Quick presets:</span>
              {Object.keys(PRESETS).map((p) => <button type="button" key={p} className="chip" onClick={() => setEv({ ...ev, tickets: PRESETS[p].map((t) => ({ ...t })) })}>{p}</button>)}
            </div>}
            <div className="tier-edit-head"><span>Tier name</span><span>Price (₹)</span><span>Quantity</span><span>Perks</span><span /></div>
            {ev.tickets.map((t, i) => (
              <div key={i} className="tier-edit">
                <input className="input" aria-label={`Tier ${i + 1} name`} value={t.name} onChange={(e) => tier(i, 'name', e.target.value)} placeholder="e.g. General" />
                <input className="input" aria-label={`Tier ${i + 1} price`} type="number" min="0" value={isFree ? 0 : t.price} disabled={isFree} onChange={(e) => tier(i, 'price', e.target.value)} />
                <input className="input" aria-label={`Tier ${i + 1} quantity`} type="number" min="1" value={t.qty} onChange={(e) => tier(i, 'qty', e.target.value)} />
                <input className="input" aria-label={`Tier ${i + 1} perks`} value={t.perks} onChange={(e) => tier(i, 'perks', e.target.value)} placeholder="What’s included" />
                <button type="button" className="icon-btn" onClick={() => setEv({ ...ev, tickets: ev.tickets.filter((_, j) => j !== i) })} aria-label={`Remove tier ${i + 1}`} disabled={ev.tickets.length === 1}><Icon name="x" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setEv({ ...ev, tickets: [...ev.tickets, { name: '', price: 0, qty: 50, perks: '' }] })}>+ Add ticket tier</button>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Total: {ev.tickets.reduce((a, t) => a + Number(t.qty || 0), 0)} tickets of {ev.capacity || '—'} capacity</p>
            {err('tickets')}
            <div className="form-grid" style={{ marginTop: 18, maxWidth: 480 }}>
              <div className="field"><label htmlFor="e-min">Minimum per booking</label><input id="e-min" type="number" min="1" className="input" value={ev.minQty} onChange={up('minQty')} /></div>
              <div className="field"><label htmlFor="e-max">Maximum per booking</label><input id="e-max" type="number" min="1" max="50" className="input" value={ev.maxQty} onChange={up('maxQty')} /></div>
            </div>
            {err('qty')}
          </>
        )}

        {STEPS[step] === 'Staff & recruitment' && (
          <>
            <h3>Staff & recruitment</h3>
            <p className="muted wiz-sub">Opportunity tickets are sold by staff. You allocate tickets to primary staff, they buy and sell them, and recruit staff below them.</p>
            <label className="sw" style={{ marginBottom: 18 }}><input type="checkbox" checked={ev.opp.recruitmentEnabled} onChange={(e) => setEv({ ...ev, opp: { ...ev.opp, recruitmentEnabled: e.target.checked } })} /> Enable staff recruitment (customers must book through a staff member)</label>
            <div className="form-grid">
              {[['staffPool', 'Tickets for staff distribution', 'Blank = all tickets'], ['maxDepth', 'Hierarchy levels allowed', 'e.g. 4 = organizer → X → X1 → X1A'], ['maxDirectRecruits', 'Recruits per staff member', ''], ['commissionRate', 'Staff commission %', 'Informational, shown to staff'], ['minPurchase', 'Minimum staff purchase', 'Tickets per purchase'], ['maxPurchase', 'Maximum staff purchase', 'Tickets per purchase']].map(([k, l, h]) => (
                <div key={k} className="field"><label htmlFor={`o-${k}`}>{l}</label><input id={`o-${k}`} type="number" min="0" className="input" value={ev.opp[k]} placeholder={h} onChange={(e) => setEv({ ...ev, opp: { ...ev.opp, [k]: e.target.value } })} />{h && <small className="muted" style={{ fontSize: 12 }}>{h}</small>}</div>
              ))}
            </div>
            {err('opp')}
            <div className="alert info" style={{ marginTop: 18 }}><Icon name="info" /> After publishing you get a unique recruitment link + QR, and a management dashboard to add primary staff and allocate tickets (e.g. 500 each to X, Y and Z).</div>
          </>
        )}

        {STEPS[step] === 'Preview' && (
          <>
            <h3>Preview</h3>
            <p className="muted wiz-sub">How buyers will see your event.</p>
            <div className="wiz-preview">
              <div style={{ width: 230 }}><EventCard ev={previewEv} /></div>
              <div className="wiz-preview-info">
                <span className="eyebrow">{ev.category}{isOpp ? ' · staff workflow' : ''}</span>
                <h2>{ev.name}</h2>
                <p className="muted">{fmtLongDate(ev.date)} · {to12h(ev.start)}{ev.end ? ` – ${to12h(ev.end)}` : ''}</p>
                <p className="muted">{ev.venue}, {ev.city} · {ev.capacity} capacity</p>
                <p style={{ margin: '14px 0', whiteSpace: 'pre-line' }}>{ev.description}</p>
                {ev.tickets.map((t, i) => <div key={i} className="line-item"><span>{t.name} · {t.perks || 'Standard entry'} · {t.qty} tickets</span><b>{fmtINR(t.price)}</b></div>)}
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{ev.minQty}–{ev.maxQty} tickets per booking{extra.length ? ` · ${extra.length} photo/video file${extra.length > 1 ? 's' : ''}` : ''}{isOpp ? ` · recruitment ${ev.opp.recruitmentEnabled ? 'on' : 'off'}, ${ev.opp.maxDepth} levels` : ''}</p>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setStep(0)}><Icon name="edit" size={14} /> Edit from start</button>
              </div>
            </div>
          </>
        )}

        {STEPS[step] === 'Publish' && (
          <>
            <h3>Ready to go live?</h3>
            <p className="muted wiz-sub">{isOpp ? 'Publishing generates your Event ID and staff recruitment link, then opens the Opportunity management dashboard.' : 'Publishing generates your Event ID and lists the event in its category for customer booking.'}</p>
            <div className="vis-grid">
              {VIS.map((v) => (
                <button type="button" key={v.key} className={`vis${ev.visibility === v.key ? ' on' : ''}`} onClick={() => setEv({ ...ev, visibility: v.key })} aria-pressed={ev.visibility === v.key}>
                  <span className="ic"><Icon name={v.icon} size={20} /></span><b>{v.t}</b><small>{v.d}</small>
                </button>
              ))}
            </div>
            {IS_SANDBOX && <div className="alert info" style={{ marginTop: 18 }}><Icon name="info" /> Sandbox mode: the event is published in this browser only — it appears on the BEE-OAK home page here and can be booked and scanned, but nothing is written to the production database.</div>}
          </>
        )}

        <div className="wiz-foot">
          <button type="button" className="btn btn-ghost" onClick={() => (step ? setStep(step - 1) : nav('/creator'))}>{step ? '← Back' : 'Cancel'}</button>
          {step < last ? (
            <button type="button" className="btn btn-primary" onClick={next}>{STEPS[step] === 'Preview' ? 'Looks good → Set visibility' : 'Continue →'}</button>
          ) : (
            <button type="button" className="btn btn-gold btn-lg" onClick={publish} disabled={busy}>{busy && <span className="spinner dark" />}Publish event live</button>
          )}
        </div>
      </div>
    </>
  );
}
