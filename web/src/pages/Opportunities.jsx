import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import EventCard, { CardSkeleton, Poster } from '../components/EventCard';
import { eventStaff, mediaUrl } from '../lib/api';
import { useApp } from '../lib/store';
import { locationLabel } from '../lib/location';
import { categoryKey, cityOf, fmtDate, isPast, parseDate, priceLabel } from '../lib/utils';

// Career-building categories from the app. "Opportunity" is the app's own home row.
export const OPP_KINDS = [
  { key: 'Opportunity', label: 'Opportunity events', icon: 'brief', blurb: 'Book through the staff member who invited you.' },
]
const KEYS = OPP_KINDS.map((k) => k.key);

export function useOpportunities() {
  const { events } = useApp();
  return useMemo(() => {
    if (!events) return null;
    return events
      .filter((e) => KEYS.includes(categoryKey(e.category)))
      .sort((a, b) => (isPast(a) - isPast(b)) || (parseDate(a.date) - parseDate(b.date)));
  }, [events]);
}

export function OpportunitySection() {
  const list = useOpportunities();
  const { location } = useApp();
  const counts = useMemo(() => Object.fromEntries(OPP_KINDS.map((k) => [k.key, (list || []).filter((e) => categoryKey(e.category) === k.key).length])), [list]);
  const shown = (list || []).slice(0, 3);

  return (
    <section className="section">
      <div className="wrap">
        <div className="opp">
          <div className="opp-intro">
            <span className="eyebrow">Opportunities</span>
            <h2>Find what moves you <em>forward.</em></h2>
            <p>Opportunity, startup and college events posted by creators on BEE-OAK, all in one place. Book them like any other event.</p>
            <div className="opp-kinds">
              {OPP_KINDS.map((k) => (
                <Link key={k.key} to={`/opportunities?type=${k.key}`} className="opp-kind">
                  <span className="ic"><Icon name={k.icon} size={18} /></span>
                  <span><b>{k.label}</b><small>{counts[k.key] ? `${counts[k.key]} live` : 'Opening soon'}</small></span>
                  <Icon name="chevR" size={16} className="arr" />
                </Link>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
              <Link to="/opportunities" className="btn btn-gold">Explore opportunities <Icon name="arrowR" size={16} /></Link>
              <Link to="/contact?topic=creator" className="btn opp-ghost">Post an opportunity</Link>
            </div>
          </div>
          <div className="opp-cards">
            {list === null ? [0, 1, 2].map((k) => <CardSkeleton key={k} />) : (
              <>
                {shown.map((e) => <EventCard key={e.id} ev={e} />)}
                {Array.from({ length: 3 - shown.length }, (_, k) => (
                  <Link key={k} to="/contact?topic=creator" className="opp-slot">
                    <span className="opp-slot-num mono">{String(shown.length + k + 1).padStart(2, '0')}</span>
                    <Icon name="spark" size={26} />
                    <b>{k === 0 && !shown.length ? `No opportunities in ${locationLabel(location)} yet` : 'This spot is open'}</b>
                    <small>Hosting a hiring drive, hackathon or workshop? Publish it on BEE-OAK.</small>
                    <span className="opp-slot-cta">Post an opportunity →</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const ini = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

function StaffStack({ staff }) {
  if (!staff) return <span className="op-stack-empty">Loading staff…</span>;
  if (!staff.length) return <span className="op-stack-empty">Staff joining soon</span>;
  return (
    <span className="op-stack">
      {staff.slice(0, 4).map((s) => <i key={s.staffCode} title={s.name}>{s.photo ? <img src={mediaUrl(s.photo)} alt="" /> : ini(s.name)}</i>)}
      <em>{staff.length} staff{staff.length > 4 ? ` · +${staff.length - 4}` : ''}</em>
    </span>
  );
}

export default function Opportunities() {
  const list = useOpportunities();
  const [staffBy, setStaffBy] = useState({});
  useEffect(() => {
    (list || []).forEach((e) => {
      if (staffBy[e.id]) return;
      eventStaff(e.id).then((d) => setStaffBy((m) => ({ ...m, [e.id]: d.staff }))).catch(() => setStaffBy((m) => ({ ...m, [e.id]: [] })));
    });
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (list || []).slice().sort((a, b) => (isPast(a) - isPast(b)) || (parseDate(a.date) - parseDate(b.date)));

  return (
    <section className="opx">
      <div className="wrap">
        {list === null ? (
          <div className="opx-grid">{[0, 1].map((k) => <div key={k} className="op-spot opx-skel" />)}</div>
        ) : shown.length ? (
          <div className="opx-grid">
            {shown.map((e) => (
              <Link key={e.id} to={`/event/${encodeURIComponent(e.id)}`} className="op-spot opx-glass">
                <span className="opx-bg" style={{ backgroundImage: `url("${mediaUrl(e.banner)}")` }} aria-hidden="true" />
                <span className="op-spot-ph"><Poster ev={e} eager /></span>
                <span className="op-spot-body">
                  
                  <b>{e.name}</b>
                  <small>{fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}{e.time ? ` · ${e.time}` : ''}</small>
                  <small>{[e.venue, cityOf(e)].filter(Boolean).join(', ')}</small>
                  <StaffStack staff={staffBy[e.id]} />
                  <span className="op-spot-cta"> <span>View event <Icon name="arrowR" size={14} /></span></span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="opx-empty"><Icon name="brief" size={28} /><b>No opportunity events right now</b><small>New ones are posted by creators regularly.</small></div>
        )}
      </div>
    </section>
  );
}
