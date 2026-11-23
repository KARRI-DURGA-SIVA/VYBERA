import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import PromoBanner from '../components/PromoBanner';
import Row from '../components/Row';
import EventCard, { CardSkeleton } from '../components/EventCard';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { CATEGORIES, categoryKey, isPast, minPrice, parseDate } from '../lib/utils';
import { eventDistance, eventIsNear, locationLabel } from '../lib/location';

export function useCityEvents() {
  const { events } = useApp();
  return events;
}

function NearYou({ events }) {
  const { location, locStatus, openLocPicker, locate } = useApp();
  const near = useMemo(() => (events || [])
    .filter((e) => eventIsNear(e, location))
    .sort((a, b) => (isPast(a) - isPast(b)) || ((eventDistance(a, location) ?? 1e9) - (eventDistance(b, location) ?? 1e9))), [events, location]);
  if (location.all || !events) return null;
  return (
    <Row title={<>Events near <span className="hl">{locationLabel(location)}</span></>}
      subtitle={location.source === 'gps' ? 'Detected from your current location · within 80 km' : 'Within 80 km of your selected city'} seeAll={near.length ? '/explore?near=1' : null}>
      {near.length ? near.map((ev) => <EventCard key={ev.id} ev={ev} />) : (
        <div className="near-empty">
          <Icon name="pin" size={26} />
          <div>
            <b>No events within 80 km of {locationLabel(location)} yet</b>
            <p>Creators near you haven’t published anything yet. Try another city or browse everything on BEE-OAK.</p>
          </div>
          <div className="near-actions">
            <button className="btn btn-ghost btn-sm" onClick={openLocPicker}>Change location</button>
            {location.source !== 'gps' && <button className="btn btn-ghost btn-sm" onClick={() => locate()} disabled={locStatus === 'detecting'}>Use my location</button>}
            <Link to="/explore" className="btn btn-primary btn-sm">Browse all events</Link>
          </div>
        </div>
      )}
    </Row>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="wrap section">
      <div className="empty">
        <div className="ic"><Icon name="info" size={28} /></div>
        <h3>We couldn’t load events</h3>
        <p>{message}</p>
        <button className="btn btn-primary" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}

export default function Home() {
  const { eventsError, loadEvents, user } = useApp();
  const events = useCityEvents();
  const loading = events === null;

  const sorted = useMemo(() => {
    if (!events) return [];
    // Upcoming first (soonest), then past (most recent first)
    const up = events.filter((e) => !isPast(e)).sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const past = events.filter(isPast).sort((a, b) => parseDate(b.date) - parseDate(a.date));
    return [...up, ...past];
  }, [events]);
  const trending = useMemo(() => [...(events || [])].sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0)), [events]);
  const free = sorted.filter((e) => minPrice(e) === 0);
  const counts = useMemo(() => {
    const c = {};
    (events || []).forEach((e) => { const k = categoryKey(e.category); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [events]);

  const skeletons = Array.from({ length: 5 }, (_, i) => <CardSkeleton key={i} />);

  return (
    <>
      <Hero events={trending.slice(0, 5)} />
      <PromoBanner events={trending} />
      {eventsError && <ErrorState message={eventsError} onRetry={() => loadEvents(true)} />}
      <NearYou events={events} />

      <Row title="Recommended for you" subtitle="" seeAll="/explore">
        {loading ? skeletons : sorted.map((ev, i) => <EventCard key={ev.id} ev={ev} promoted={i === 0} />)}
      </Row>

      

      <Row title="Trending now" subtitle="" seeAll="/explore?sort=popular">
        {loading ? skeletons : trending.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </Row>

      {free.length > 0 && (
        <Row title="Free to attend" subtitle="" seeAll="/explore?price=free">
          {free.map((ev) => <EventCard key={ev.id} ev={ev} />)}
        </Row>
      )}

     

     

      {!user && (
        <section className="section">
          
        </section>
      )}
    </>
  );
}
