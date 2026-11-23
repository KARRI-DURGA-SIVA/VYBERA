import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import Row from '../components/Row';
import EventCard, { Poster } from '../components/EventCard';
import { useApp } from '../lib/store';
import { categoryKey, fmtDate, fmtINR, isPast, parseDate } from '../lib/utils';
import { bookingPast, useMyBookings } from './MyBookings';
import { PageLoader } from './Details';

function Countdown({ date }) {
  const target = parseDate(date);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return null;
  const diff = Math.max(0, target - now);
  const parts = [['Days', Math.floor(diff / 864e5)], ['Hrs', Math.floor(diff / 36e5) % 24], ['Min', Math.floor(diff / 6e4) % 60], ['Sec', Math.floor(diff / 1e3) % 60]];
  return <div className="countdown">{parts.map(([l, v]) => <div key={l}><b>{String(v).padStart(2, '0')}</b><small>{l}</small></div>)}</div>;
}

export default function Dashboard() {
  const { user, events } = useApp();
  const bookings = useMyBookings();
  const stats = useMemo(() => {
    const l = bookings || [];
    return {
      total: l.length,
      upcoming: l.filter((b) => !bookingPast(b)).length,
      tickets: l.reduce((s, b) => s + Number(b.qty || 1), 0),
      spent: l.reduce((s, b) => s + Number(b.total || 0), 0),
    };
  }, [bookings]);
  const next = useMemo(() => (bookings || []).filter((b) => !bookingPast(b)).sort((a, b) => parseDate(a.eventDate) - parseDate(b.eventDate))[0], [bookings]);
  const recs = useMemo(() => {
    const liked = new Set((bookings || []).map((b) => categoryKey((events || []).find((e) => e.id === b.eventId)?.category)));
    const booked = new Set((bookings || []).map((b) => b.eventId));
    return (events || []).filter((e) => !booked.has(e.id)).sort((a, b) => (liked.has(categoryKey(b.category)) - liked.has(categoryKey(a.category))) || (isPast(a) - isPast(b)));
  }, [bookings, events]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="wrap" style={{ paddingTop: 36 }}>
        <div className="dash-hero reveal">
          <div style={{ position: 'relative' }}>
            <span className="eyebrow">Dashboard</span>
            <h1 style={{ marginTop: 8 }}>{greet}, {user.firstName || 'there'}.</h1>
            <p>{stats.upcoming ? `You have ${stats.upcoming} upcoming event${stats.upcoming > 1 ? 's' : ''}. Your tickets are ready.` : 'Nothing booked yet — let’s find your next night out.'}</p>
          </div>
          <Link to="/explore" className="btn btn-gold btn-lg" style={{ position: 'relative' }}>Find events <Icon name="arrowR" size={16} /></Link>
        </div>

        {bookings === null ? <PageLoader /> : (
          <>
            <div className="kpis">
              {[['Total bookings', stats.total], ['Upcoming events', stats.upcoming], ['Tickets purchased', stats.tickets], ['Total spent', fmtINR(stats.spent).replace('Free', '₹0')]].map(([l, v], i) => (
                <div key={l} className={`kpi reveal reveal-${i + 1}`}><small>{l}</small><b>{v}</b></div>
              ))}
            </div>
            <div className="dash-grid">
              <div className="panel reveal reveal-2">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <h3 style={{ margin: 0 }}>Next up</h3>
                  <Link to="/bookings" className="see-all">All bookings <Icon name="chevR" size={14} /></Link>
                </div>
                {next ? (
                  <div className="next-up">
                    <div className="img"><Poster ev={next} alt={next.eventName} /></div>
                    <div>
                      <span className="eyebrow">{next.qty} × {next.ticketType}</span>
                      <h2 style={{ marginTop: 6 }}>{next.eventName}</h2>
                      <p className="muted" style={{ marginTop: 6 }}>{fmtDate(next.eventDate, { weekday: 'long', day: 'numeric', month: 'long' })} · {next.eventVenue}</p>
                      <Countdown date={next.eventDate} />
                      <Link to={`/bookings/${encodeURIComponent(next.id)}`} state={{ booking: next }} className="btn btn-primary"><Icon name="qr" size={16} /> Show ticket QR</Link>
                    </div>
                  </div>
                ) : (
                  <div className="empty" style={{ padding: 36 }}>
                    <h3>No upcoming events</h3>
                    <p>Book an event and a live countdown will appear here.</p>
                    <Link to="/explore" className="btn btn-primary">Explore events</Link>
                  </div>
                )}
              </div>
              <div className="panel reveal reveal-3">
                <h3>Quick actions</h3>
                <div className="quick">
                  {[['ticket', 'My bookings', 'Tickets & QR codes', '/bookings'], ['search', 'Explore events', 'Browse by city & category', '/explore'], ['user', 'Edit profile', 'Name, phone & preferences', '/profile'], ['help', 'Help centre', 'Refunds, entry & payments', '/help']].map(([ic, b, s, to]) => (
                    <Link key={to} to={to}><span className="ic"><Icon name={ic} /></span><span><b>{b}</b><small>{s}</small></span><Icon name="chevR" className="arr" /></Link>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {recs.length > 0 && <Row title="Recommended for you" subtitle="Based on what you’ve booked" seeAll="/explore">{recs.map((e) => <EventCard key={e.id} ev={e} />)}</Row>}
    </>
  );
}
