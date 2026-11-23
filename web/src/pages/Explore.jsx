import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EventCard, { CardSkeleton } from '../components/EventCard';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { CATEGORIES, categoryKey, isPast, minPrice, parseDate } from '../lib/utils';
import { useCityEvents, ErrorState } from './Home';
import { eventDistance, eventIsNear, locationLabel } from '../lib/location';

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const { eventsError, loadEvents, location } = useApp();
  const events = useCityEvents();
  const cat = params.get('cat') || 'All';
  const price = params.get('price') || 'all';
  const when = params.get('when') || 'all';
  const sort = params.get('sort') || 'date';
  const q = params.get('q') || '';
  const near = params.get('near') === '1' && !location.all;


  const list = useMemo(() => {
    if (!events) return null;
    const s = q.toLowerCase();
    let r = events.filter((e) => {
      if (cat !== 'All' && categoryKey(e.category) !== cat && !(cat === 'Free' && minPrice(e) === 0)) return false;
      if (price === 'free' && minPrice(e) !== 0) return false;
      if (price === 'paid' && minPrice(e) === 0) return false;
      if (when === 'upcoming' && isPast(e)) return false;
      if (when === 'past' && !isPast(e)) return false;
      if (near && !eventIsNear(e, location)) return false;
      if (s && ![e.name, e.venue, e.city, e.category, e.description, e.creatorName].join(' ').toLowerCase().includes(s)) return false;
      return true;
    });
    if (sort === 'popular') r = [...r].sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0));
    else if (sort === 'price') r = [...r].sort((a, b) => minPrice(a) - minPrice(b));
    else if (sort === 'distance') r = [...r].sort((a, b) => (eventDistance(a, location) ?? 1e9) - (eventDistance(b, location) ?? 1e9));
    else r = [...r].sort((a, b) => (isPast(a) - isPast(b)) || (eventIsNear(b, location) - eventIsNear(a, location)) || (parseDate(a.date) - parseDate(b.date)));
    return r;
  }, [events, cat, price, when, sort, q, near, location]);


  return (
    <div className="wrap explore-page">
      <div className="page-head">
        <div className="crumbs"><Link to="/"></Link><span></span><span></span></div>
        <h1>{q ? <>Results for “{q}”</> : cat !== 'All' ? CATEGORIES.find((c) => c.key === cat)?.label : 'All events'}</h1>
        <p>{location.all ? 'Every live event on BEE-OAK.' : `Events near ${locationLabel(location)} are shown first.`}</p>
      </div>

      {eventsError ? <ErrorState message={eventsError} onRetry={() => loadEvents(true)} /> : list === null ? (
        <div className="grid">{Array.from({ length: 10 }, (_, i) => <CardSkeleton key={i} />)}</div>
      ) : list.length ? (
        <>
          <p className="muted" style={{ marginBottom: 18, fontSize: 14 }}>{list.length} event{list.length > 1 ? 's' : ''}</p>
          <div className="grid">{list.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
        </>
      ) : (
        <div className="empty">
          <div className="ic"><Icon name="search" size={28} /></div>
          <h3>No events match these filters</h3>
          <p>Try another category, widen the date range or switch city.</p>
          <button className="btn btn-primary" onClick={() => setParams({}, { replace: true })}>Reset filters</button>
        </div>
      )}
    </div>
  );
}
