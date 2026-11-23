import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import EventCard from '../components/EventCard';
import { useApp } from '../lib/store';
import { useSaved } from '../lib/saved';
import { PageLoader } from './Details';

export default function Saved() {
  const { events } = useApp();
  const ids = useSaved();
  if (!events) return <PageLoader />;
  const list = ids.map((id) => events.find((e) => e.id === id)).filter(Boolean);
  return (
    <div className="wrap">
      <div className="page-head"><h1>Saved</h1><p>Events you’ve saved for later.</p></div>
      {list.length ? <div className="grid">{list.map((e) => <EventCard key={e.id} ev={e} />)}</div> : (
        <div className="empty">
          <div className="ic"><Icon name="heart" size={28} /></div>
          <h3>Nothing saved yet</h3>
          <p>Tap the heart on any event to keep it here.</p>
          <Link to="/explore" className="btn btn-primary">Explore events</Link>
        </div>
      )}
    </div>
  );
}
