import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toggleSaved, useSaved } from '../lib/saved';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import Row from '../components/Row';
import EventCard, { Poster } from '../components/EventCard';
import { useApp } from '../lib/store';
import { eventStaff, mediaUrl, resolveRef, storage } from '../lib/api';
import { capacityLeft, categoryKey, cityOf, fmtINR, fmtLongDate, mapsLink, minPrice, priceLabel, tierRemaining } from '../lib/utils';

export function useEvent(id) {
  const { events } = useApp();
  if (!events) return undefined; // loading
  return events.find((e) => e.id === id) || null;
}

export function NotFoundEvent() {
  return (
    <div className="wrap section">
      <div className="empty">
        <div className="ic"><Icon name="ticket" size={28} /></div>
        <h3>Event not found</h3>
        <p>This event may have been removed by its creator or is no longer public.</p>
        <Link to="/explore" className="btn btn-primary">Browse events</Link>
      </div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="wrap section app-loader" role="status" aria-label="Loading">
      <span className="app-loader-logo"><img src="/logo.png" alt="" /></span>
      <span className="app-loader-bar" />
    </div>
  );
}

export default function Details() {
  const { id } = useParams();
  const ev = useEvent(id);
  const savedIds = useSaved();
  const { events, notify } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [staff, setStaff] = useState(null);
  const [picked, setPicked] = useState(() => storage.get(`beeoak.web.ref.${id}`, null));
  const isOpp = ev && ev.isOpportunity && ev.staffRecruitment;
  useEffect(() => {
    if (!isOpp) return;
    eventStaff(id).then((d) => setStaff(d.staff)).catch(() => setStaff([]));
    const ref = params.get('ref');
    if (ref) resolveRef(id, ref).then((r) => { setPicked(r.staffCode); storage.set(`beeoak.web.ref.${id}`, r.staffCode); notify(`Booking through ${r.name}`); }).catch(() => notify('That referral link is not valid for this event', 'err'));
  }, [id, isOpp]); // eslint-disable-line react-hooks/exhaustive-deps
  const bookUrl = (code) => `/event/${encodeURIComponent(id)}/book${code ? `?staff=${encodeURIComponent(code)}` : ''}`;
  // "Book tickets" shows all available tickets; a staff referral link (?ref=) keeps that staff member selected.
  const goBook = () => {
    nav(bookUrl(isOpp && params.get('ref') ? picked : null));
  };
  const similar = useMemo(() => (events || []).filter((e) => ev && e.id !== ev.id && (categoryKey(e.category) === categoryKey(ev.category) || cityOf(e) === cityOf(ev))), [events, ev]);

  if (ev === undefined) return <PageLoader />;
  if (!ev) return <NotFoundEvent />;
  const left = capacityLeft(ev);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: ev.name, url });
      else { await navigator.clipboard.writeText(url); notify('Event link copied to clipboard'); }
    } catch { /* cancelled */ }
  };

  return (
    <>
      <div className="m-bar">
        <button className="m-bar-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><Icon name="chevL" size={22} /></button>
        <b>{ev.name}</b>
        <button className={`m-bar-btn${savedIds.includes(ev.id) ? ' on' : ''}`} onClick={() => notify(toggleSaved(ev.id) ? 'Saved to your list' : 'Removed from saved')} aria-label="Save"><Icon name="heart" size={20} /></button>
        <button className="m-bar-btn" onClick={share} aria-label="Share"><Icon name="share" size={20} /></button>
      </div>
      <section className="dh dh2">
        <div className="dh-bg" style={{ backgroundImage: `url("${mediaUrl(ev.banner)}")` }} aria-hidden="true" />
        <div className="dh-shade" aria-hidden="true" />
        <div className="dh2-actions">
          <button className={`dh2-share${savedIds.includes(ev.id) ? ' on' : ''}`} onClick={() => notify(toggleSaved(ev.id) ? 'Saved to your list' : 'Removed from saved')} aria-pressed={savedIds.includes(ev.id)}>
            <Icon name="heart" size={18} /> {savedIds.includes(ev.id) ? 'Saved' : 'Save'}
          </button>
          <button className="dh2-share" onClick={share}><Icon name="share" size={18} /> Share</button>
        </div>
        <div className="wrap dh-inner">
          <div className="dh-poster reveal"><span className="dh-mbg" style={{ backgroundImage: `url("${mediaUrl(ev.banner)}")` }} aria-hidden="true" /><Poster ev={ev} /><span className="dh-mstrip">{ev.isOpportunity ? 'Opportunity event' : 'Live event'}</span></div>
          <div className="dh2-info reveal reveal-1">
            <h1>{ev.name}</h1>
            <p className="dh2-line">
              {[fmtLongDate(ev.date), ev.time ? `${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ''}` : null, [ev.venue, cityOf(ev)].filter(Boolean).join(', ')].filter(Boolean).map((x, k) => <span key={k}>{x}</span>)}
            </p>
            <div className="dh2-tags">
              <span>{ev.category}</span>
              <span className="m-only">{priceLabel(ev)}</span>
              
            </div>
            <button className="dh2-book" onClick={goBook}>Book tickets</button>
          </div>
        </div>
      </section>

      <div className="wrap ed ed-grid">
        <div className="ed-main">
        <section className="ed-sec reveal">
          <h2>About the event</h2>
          <p className="ed-about">{ev.description || 'Details for this event will be shared by the creator soon.'}</p>
        </section>

        <section className="ed-sec reveal reveal-1">
          <h2>Tickets</h2>
          <div className="ed-tickets">
            {(ev.tickets || []).map((t) => {
              const rem = tierRemaining(t);
              return (
                <button key={t.name} className={`ed-ticket${rem > 0 ? '' : ' out'}`} onClick={goBook}>
                  <span className="ed-tk-ic"><Icon name="ticket" size={38} /></span>
                  <span className="ed-tk-text"><b>{t.name}</b><small>{t.perks || 'Standard entry'}{rem > 0 ? ` · ${rem} left` : ' · Sold out'}</small></span>
                  <span className="ed-tk-price">{rem > 0 ? fmtINR(t.price) : 'Sold out'}{rem > 0}</span>
                </button>
              );
            })}
          </div>
          <p className="ed-note"><Icon name="shield" size={14} /> {minPrice(ev) === 0 ? 'Free registration' : 'Secure checkout'} · Instant QR ticket · {ev.minQty || 1}–{ev.maxQty || 10} tickets per booking</p>
        </section>

        {isOpp && (
          <section className="ed-sec reveal reveal-2" id="staff-profiles">
            <h2>Our staff</h2>
            <p className="ed-sub">Book through the person who invited you — your tickets are credited to them.</p>
            {staff === null ? <div className="cast-row">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="cast"><div className="skel cast-ph" /></div>)}</div>
              : staff.length ? (
                <div className="cast-wrap">
                  <div className="cast-row" id="cast-row">
                    {staff.map((s) => (
                      <button key={s.staffCode} className={`cast${picked === s.staffCode ? ' on' : ''}${s.available ? '' : ' out'}`} title={s.available ? `Book with ${s.name}` : `${s.name} — sold out`} onClick={() => {
                        if (!s.available) { notify(`${s.name} has no tickets left — choose another staff member`, 'err'); return; }
                        setPicked(s.staffCode); storage.set(`beeoak.web.ref.${id}`, s.staffCode); nav(bookUrl(s.staffCode));
                      }}>
                        <span className="cast-ph">
                          {s.photo ? <img src={mediaUrl(s.photo)} alt="" /> : <span className="cast-ini">{s.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>}
                        
                        </span>
                        <b>{s.name}</b>
                        <small className="mono">{s.staffCode}</small>
                        <small className={s.available ? 'cast-av' : 'cast-av out'}>{s.available ? `${s.available} tickets left` : 'Sold out'}</small>
                      </button>
                    ))}
                  </div>
                  {staff.length > 6 && <button className="cast-next" aria-label="Scroll staff" onClick={() => document.getElementById('cast-row')?.scrollBy({ left: 480, behavior: 'smooth' })}><Icon name="chevR" size={20} /></button>}
                </div>
              ) : <div className="empty" style={{ padding: 32 }}><h3>No staff members yet</h3><p>Staff for this event haven’t joined yet. Check back soon.</p></div>}
          </section>
        )}

        {(ev.media || []).length > 0 && (
          <section className="ed-sec reveal">
            <h2>Photos & video</h2>
            <div className="ed-media">
              {ev.media.map((m, k) => m.type === 'video'
                ? <video key={k} src={mediaUrl(m.url)} controls preload="metadata" />
                : <a key={k} href={mediaUrl(m.url)} target="_blank" rel="noreferrer"><img src={mediaUrl(m.url)} alt={`${ev.name} photo ${k + 1}`} loading="lazy" /></a>)}
            </div>
          </section>
        )}
        </div>
        <aside className="ed-side">
        <section className="ed-sec reveal reveal-2">
          <h2>Event details</h2>
          <div className="ed-facts">
            <div><span className="ic"><Icon name="cal" /></span><span><small>Date</small><b>{fmtLongDate(ev.date)}</b></span></div>
            <div><span className="ic"><Icon name="clock" /></span><span><small>Time</small><b>{ev.time || 'To be announced'}{ev.endTime ? ` – ${ev.endTime}` : ''}</b></span></div>
            <div><span className="ic"><Icon name="pin" /></span><span><small>Venue</small><b>{[ev.venue, cityOf(ev)].filter(Boolean).join(', ')}</b><a className="link" href={mapsLink(ev)} target="_blank" rel="noreferrer">Open in Google Maps →</a></span></div>
            <div><span className="ic"><Icon name="user" /></span><span><small>Hosted by</small><b>{ev.creatorName || 'BEE-OAK Creator'}</b></span></div>
            {left !== null && <div><span className="ic"><Icon name="users" /></span><span><small>Capacity</small><b>{Number(ev.capacity).toLocaleString('en-IN')} guests · {left.toLocaleString('en-IN')} spots left</b></span></div>}
          </div>
        </section>

        <section className="ed-sec reveal">
          <h2>Good to know</h2>
          <ul className="ed-list">
            <li>Your QR ticket appears instantly in My Bookings after payment.</li>
            <li>Carry a valid photo ID. Each QR admits the quantity booked.</li>
            <li>Tickets are non-transferable unless the creator states otherwise.</li>
            <li>Prices include an 8% convenience fee and 18% GST on that fee at checkout.</li>
          </ul>
        </section>
        </aside>
      </div>

      {similar.length > 0 && (
        <Row title="You might also like" seeAll={`/explore?cat=${categoryKey(ev.category)}`}>
          {similar.map((e) => <EventCard key={e.id} ev={e} />)}
        </Row>
      )}
      {createPortal(
        <div className="m-cta">
          <button onClick={goBook}>Book tickets</button>
        </div>, document.body)}
    </>
  );
}
