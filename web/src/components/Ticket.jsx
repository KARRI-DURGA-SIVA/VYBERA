import { useLayoutEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import { mediaUrl } from '../lib/api';
import { cityOf, fmtDate, fmtINR } from '../lib/utils';

// Ticket card: faded event artwork behind, title + QR on top, tear line, label/value rows.
export default function Ticket({ b }) {
  const { events } = useApp();
  const card = useRef(null);
  const cut = useRef(null);
  // Punch real see-through notches where the tear line sits.
  useLayoutEffect(() => {
    const set = () => { if (card.current && cut.current) card.current.style.setProperty('--cut-y', `${cut.current.offsetTop}px`); };
    set();
    const ro = new ResizeObserver(set);
    if (card.current) ro.observe(card.current);
    return () => ro.disconnect();
  }, []);
  const ev = (events || []).find((e) => e.id === b.eventId);
  const time = b.eventTime || ev?.time;
  const venue = b.eventVenue || (ev ? [ev.venue, cityOf(ev)].filter(Boolean).join(', ') : '');
  const status = b.sandbox ? 'Sandbox' : b.scannedAt ? 'Checked in' : (b.status || 'Confirmed').replace(/^./, (c) => c.toUpperCase());
  const banner = b.eventBanner || ev?.banner;
  const qty = Number(b.qty) || 1;
  const sub = [ev?.category, `${qty} ticket${qty > 1 ? 's' : ''}`, status].filter(Boolean).join(' · ');
  return (
    <article className="etk" ref={card}>
      {banner && <span className="etk-art" style={{ backgroundImage: `url("${mediaUrl(banner)}")` }} aria-hidden="true" />}
      <div className="etk-head">
        <div className="etk-title">
          <h2>{b.eventName}</h2>
          <p>{sub}</p>
        </div>
        <div className="etk-qr">{b.qrImage ? <img src={b.qrImage} alt={`QR code for booking ${b.id}`} /> : <span className="skel" />}</div>
      </div>

      <div className="etk-cut" ref={cut} aria-hidden="true" />

      <dl className="etk-rows">
        <div><dt>Date</dt><dd>{fmtDate(b.eventDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
        <div className="r"><dt>Time</dt><dd>{time || 'TBA'}</dd></div>
        {venue && <div className="full"><dt>Venue</dt><dd>{venue}</dd></div>}
        <div><dt>{b.ticketType || 'Ticket'}</dt><dd>{b.buyerName || b.buyer || b.buyerEmail}</dd></div>
        <div className="r"><dt>Paid</dt><dd>{fmtINR(b.total)}</dd></div>
      </dl>

      <p className="etk-foot">Booking <span className="mono">{b.id}</span> · {qty} ticket{qty > 1 ? 's' : ''}</p>
    </article>
  );
}
