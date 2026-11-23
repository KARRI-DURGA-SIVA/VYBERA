import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import Ticket from '../components/Ticket';
import { Poster } from '../components/EventCard';
import { useApp } from '../lib/store';
import { getMyBookings } from '../lib/api';
import { fmtDate, fmtINR, isPast } from '../lib/utils';
import { PageLoader } from './Details';
import { downloadQr, shareTicket, useBooking } from './Confirmation';

export function useMyBookings() {
  const { user } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    getMyBookings(user).then((l) => live && setList(l)).catch(() => live && setList([]));
    return () => { live = false; };
  }, [user]);
  return list;
}

export const bookingPast = (b) => isPast({ date: b.eventDate }) || b.status === 'used' || !!b.scannedAt;

export default function MyBookings() {
  const list = useMyBookings();
  const [picked, setPicked] = useState(null);
  // Default to whichever tab actually has bookings, unless the user chose one.
  const tab = picked || (list && list.length && !list.some((b) => !bookingPast(b)) ? 'past' : 'upcoming');
  const setTab = setPicked;
  const shown = useMemo(() => (list || []).filter((b) => (tab === 'upcoming' ? !bookingPast(b) : bookingPast(b))), [list, tab]);
  const counts = useMemo(() => ({ up: (list || []).filter((b) => !bookingPast(b)).length, past: (list || []).filter(bookingPast).length }), [list]);

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="crumbs"><Link to="/dashboard">Dashboard</Link><span>/</span><span>My bookings</span></div>
          <h1>My bookings</h1>
          <p>All your tickets in one place. Open any booking to show its QR at the gate.</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === 'upcoming' ? 'on' : ''} onClick={() => setTab('upcoming')}>Upcoming ({counts.up})</button>
          <button role="tab" className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past ({counts.past})</button>
        </div>
      </div>
      {list === null ? <PageLoader /> : shown.length ? shown.map((b, i) => (
        <Link key={b.id} to={`/bookings/${encodeURIComponent(b.id)}`} state={{ booking: b }} className={`bk reveal reveal-${Math.min(i + 1, 4)}`}>
          <div className="bk-img"><Poster ev={b} alt={b.eventName} /></div>
          <div>
            <h3>{b.eventName}</h3>
            <div className="bk-meta">
              <span><Icon name="cal" size={15} />{fmtDate(b.eventDate)}</span>
              <span><Icon name="pin" size={15} />{b.eventVenue || '—'}</span>
              <span><Icon name="ticket" size={15} />{b.qty} × {b.ticketType}</span>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>{b.id}</div>
          </div>
          <div className="bk-right">
            <span className={`status ${bookingPast(b) ? 'past' : b.sandbox ? 'sbx' : 'up'}`}>{bookingPast(b) ? 'Completed' : b.sandbox ? 'Sandbox' : 'Confirmed'}</span>
            <b style={{ fontSize: 18 }}>{fmtINR(b.total)}</b>
            <span className="see-all">View ticket <Icon name="chevR" size={14} /></span>
          </div>
        </Link>
      )) : (
        <div className="empty">
          <div className="ic"><Icon name="ticket" size={28} /></div>
          <h3>{tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}</h3>
          <p>{tab === 'upcoming' ? 'When you book an event, your QR ticket will appear here.' : 'Events you’ve attended will show up here.'}</p>
          <Link to="/explore" className="btn btn-primary">Explore events</Link>
        </div>
      )}
    </div>
  );
}

export function BookingDetail() {
  const { id } = useParams();
  const [b, err] = useBooking(id);
  if (b === undefined) return <PageLoader />;
  if (!b) return <div className="wrap section"><div className="empty"><div className="ic"><Icon name="ticket" size={28} /></div><h3>Ticket not found</h3><p>{err}</p><Link to="/bookings" className="btn btn-primary">Back to bookings</Link></div></div>;
  return (
    <div className="wrap etk-page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div className="crumbs"><Link to="/bookings">My bookings</Link><span>/</span><span className="mono">{b.id}</span></div>
        <h1 style={{ fontSize: 38 }}>Your ticket</h1>
      </div>
      <Ticket b={b} />
      <div className="etk-actions">
        <button className="btn btn-primary btn-lg btn-block" onClick={() => downloadQr(b)}><Icon name="download" size={18} /> Download QR</button>
        <button className="etk-share" onClick={() => shareTicket(b)}>Share <Icon name="share" size={20} /></button>
        {b.eventId && <Link className="etk-link" to={`/event/${encodeURIComponent(b.eventId)}`}>View event page</Link>}
      </div>
    </div>
  );
}
