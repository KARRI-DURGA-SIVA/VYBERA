import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Poster } from '../components/EventCard';
import { useApp } from '../lib/store';
import { storage } from '../lib/api';
import { eventIsNear } from '../lib/location';
import { capacityLeft, cityOf, isPast } from '../lib/utils';

const RECENT = 'beeoak.web.recentSearches';

function ResultRow({ ev }) {
  return (
    <Link to={`/event/${encodeURIComponent(ev.id)}`} className="srch-row">
      <span className="srch-row-ph"><Poster ev={ev} /></span>
      <span className="srch-row-t"><b>{ev.name}</b><small>{ev.category || 'Event'}</small></span>
    </Link>
  );
}

// Phone search screen (bottom bar → Search).
export default function Search() {
  const { events, location } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [recent, setRecent] = useState(() => storage.get(RECENT, []));
  const term = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term) return [];
    return (events || []).filter((e) => [e.name, e.venue, cityOf(e), e.category, e.creatorName, e.description]
      .filter(Boolean).some((f) => String(f).toLowerCase().includes(term)));
  }, [events, term]);

  const live = useMemo(() => [...(events || [])].sort((a, b) => Number(isPast(a)) - Number(isPast(b))), [events]);
  // Trending: most tickets sold first, then soonest.
  const trending = useMemo(() => [...live].sort((a, b) => {
    const sold = (e) => { const cap = Number(e.capacity) || 0; const left = capacityLeft(e); return left === null ? 0 : cap - left; };
    return Number(isPast(a)) - Number(isPast(b)) || sold(b) - sold(a) || String(a.date).localeCompare(String(b.date));
  }).slice(0, 10), [live]);
  // Recommended: events near the chosen city, topped up with everything else.
  const recommended = useMemo(() => {
    const near = live.filter((e) => eventIsNear(e, location));
    const rest = live.filter((e) => !near.includes(e));
    return [...near, ...rest].slice(0, 12);
  }, [live, location]);

  const remember = (v) => {
    const s = v.trim(); if (!s) return;
    const next = [s, ...recent.filter((r) => r.toLowerCase() !== s.toLowerCase())].slice(0, 6);
    setRecent(next); storage.set(RECENT, next);
  };
  const submit = (e) => { e.preventDefault(); remember(q); setParams(q.trim() ? { q: q.trim() } : {}, { replace: true }); document.activeElement?.blur(); };
  const pick = (v) => { setQ(v); remember(v); setParams({ q: v }, { replace: true }); };

  return (
    <div className="srch">
      <form className="srch-bar" onSubmit={submit} role="search">
        <button type="button" className="m-back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><Icon name="chevL" size={22} /></button>
        <label className="srch-field">
          <button type="button" className="srch-back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><Icon name="chevL" size={22} /></button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for events, venues, cities…" autoFocus enterKeyHint="search" aria-label="Search" />
          {q && <button type="button" onClick={() => { setQ(''); setParams({}, { replace: true }); }} aria-label="Clear search"><Icon name="x" size={16} /></button>}
        </label>
      </form>

      {!term ? (
        <>
          {recent.length > 0 && (
            <section className="srch-sec">
              <div className="srch-h"><h2>Recent searches</h2><button onClick={() => { setRecent([]); storage.set(RECENT, []); }}>Clear</button></div>
              <div className="srch-recent">{recent.map((r) => <button key={r} onClick={() => pick(r)}><Icon name="clock" size={15} />{r}</button>)}</div>
            </section>
          )}
          {trending.length > 0 && (
            <section className="srch-sec">
              <div className="srch-h"><h2>Trending now</h2></div>
              <div className="srch-trend">{trending.map((e) => <ResultRow key={e.id} ev={e} />)}</div>
            </section>
          )}
          {recommended.length > 0 && (
            <section className="srch-sec">
              <div className="srch-h"><h2>Recommended for you</h2></div>
              <div className="srch-reco">
                {recommended.map((e) => (
                  <Link key={e.id} to={`/event/${encodeURIComponent(e.id)}`} className="srch-reco-card">
                    <span className="srch-reco-ph"><Poster ev={e} /></span>
                    <b>{e.name}</b>
                    <small>{[e.category, cityOf(e)].filter(Boolean).join(' | ')}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="srch-sec">
          <div className="srch-h"><h2>{results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No matches'}</h2></div>
          {results.length ? <div className="srch-trend">{results.map((e) => <ResultRow key={e.id} ev={e} />)}</div>
            : <p className="muted">Nothing found for “{q.trim()}”. Try an event name, venue or city.</p>}
        </section>
      )}
    </div>
  );
}
