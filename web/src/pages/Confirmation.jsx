import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import Ticket from '../components/Ticket';
import { getBooking } from '../lib/api';
import { fmtINR } from '../lib/utils';
import { Stepper } from './Booking';
import { PageLoader } from './Details';
import { publicUrl } from '../lib/env';

export function useBooking(id) {
  const { state } = useLocation();
  const [b, setB] = useState(state?.booking?.id === id ? state.booking : undefined);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (b) return;
    getBooking(id).then(setB).catch((e) => { setErr(e.message); setB(null); });
  }, [id, b]);
  return [b, err];
}

export function downloadQr(b) {
  if (!b?.qrImage) return;
  const a = document.createElement('a');
  a.href = b.qrImage;
  a.download = `BEE-OAK-${b.id}.png`;
  a.click();
}

export async function shareTicket(b) {
  const url = b.eventId ? publicUrl(`/event/${encodeURIComponent(b.eventId)}`) : publicUrl();
  const text = `I'm going to ${b.eventName}! Booked on BEE-OAK.`;
  try {
    if (navigator.share) await navigator.share({ title: b.eventName, text, url });
    else await navigator.clipboard.writeText(`${text} ${url}`);
  } catch { /* cancelled */ }
}

export default function Confirmation() {
  const { id } = useParams();
  const [b, err] = useBooking(id);
  if (b === undefined) return <PageLoader />;
  if (!b) return (
    <div className="wrap section"><div className="empty"><div className="ic"><Icon name="ticket" size={28} /></div><h3>Booking not found</h3><p>{err}</p><Link to="/bookings" className="btn btn-primary">Go to My bookings</Link></div></div>
  );

  return (
    <div className="wrap etk-confirm" style={{ maxWidth: 980 }}>
      <div style={{ paddingTop: 36 }}><Stepper step={3} /></div>
      <div className="confirm-hero">
        <div className="check"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
        <h1 className="reveal" style={{ fontSize: 42 }}>You’re going!</h1>
        <p className="muted reveal reveal-1" style={{ marginTop: 10, fontSize: 17 }}>
          Booking <span className="mono" style={{ color: 'var(--ink)' }}>{b.id}</span> is confirmed{b.total ? ` · ${fmtINR(b.total)} paid` : ''}. A copy has been saved to My Bookings.
        </p>
      </div>
      <div className="reveal reveal-2"><Ticket b={b} /></div>
      <div className="etk-actions reveal reveal-3">
        <button className="btn btn-primary btn-lg btn-block" onClick={() => downloadQr(b)}><Icon name="download" size={18} /> Download QR</button>
        <button className="etk-share" onClick={() => shareTicket(b)}>Share <Icon name="share" size={20} /></button>
        <Link className="etk-link" to="/bookings">View my bookings</Link>
      </div>
    </div>
  );
}
