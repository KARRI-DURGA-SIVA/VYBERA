// Location logic ported from the BEE-OAK app (same city list, same OpenStreetMap
// lookups, same "near" rule: text match on city/area/state, or within 80 km).

export const NEAR_KM = 80;
const GEO_CACHE = 'beeoak.web.geocache';

export const INDIA_LOCATIONS = [
  { city: 'Bengaluru', state: 'Karnataka', lat: 12.971599, lng: 77.594566, area: 'Bangalore' },
  { city: 'Hyderabad', state: 'Telangana', lat: 17.385044, lng: 78.486671 },
  { city: 'Mumbai', state: 'Maharashtra', lat: 19.07609, lng: 72.877426 },
  { city: 'Delhi', state: 'Delhi', lat: 28.613939, lng: 77.209023 },
  { city: 'Chennai', state: 'Tamil Nadu', lat: 13.08268, lng: 80.270718 },
  { city: 'Pune', state: 'Maharashtra', lat: 18.52043, lng: 73.856744 },
  { city: 'Kolkata', state: 'West Bengal', lat: 22.572646, lng: 88.363895 },
  { city: 'Ahmedabad', state: 'Gujarat', lat: 23.022505, lng: 72.571362 },
  { city: 'Jaipur', state: 'Rajasthan', lat: 26.912434, lng: 75.787271 },
  { city: 'Goa', state: 'Goa', lat: 15.299326, lng: 74.123996 },
  { city: 'Kochi', state: 'Kerala', lat: 9.931233, lng: 76.267304 },
  { city: 'Bhubaneswar', state: 'Odisha', lat: 20.296059, lng: 85.824539 },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.686816, lng: 83.218482 },
  { city: 'Bhimavaram', state: 'Andhra Pradesh', lat: 16.544893, lng: 81.521241 },
  { city: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.506174, lng: 80.648015 },
  { city: 'Guntur', state: 'Andhra Pradesh', lat: 16.306652, lng: 80.436539 },
  { city: 'Anantapur', state: 'Andhra Pradesh', lat: 14.681887, lng: 77.600591, area: 'Anantapuram' },
  { city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.846694, lng: 80.946166 },
  { city: 'Chandigarh', state: 'Chandigarh', lat: 30.733315, lng: 76.779418 },
];

export const ALL_INDIA = { label: 'All India', all: true };

const tc = (t) => String(t || '').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
export const locationLabel = (l) => {
  if (!l || l.all) return 'All India';
  if (l.area || l.city) {
    const area = tc(l.area); const city = tc(l.city);
    if (area && city && area.toLowerCase() !== city.toLowerCase() && l.source === 'gps') return `${area}, ${city}`;
    if (city) return city;
  }
  if (l.area && l.city && l.area.toLowerCase() !== l.city.toLowerCase() && l.source === 'gps') return `${l.area}, ${l.city}`;
  return l.city || l.label || 'Current location';
};

export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function eventDistance(ev, loc) {
  if (!loc || loc.all) return null;
  const a = Number(ev.latitude || ev.lat || 0);
  const b = Number(ev.longitude || ev.lng || 0);
  if (!a || !b || !loc.lat || !loc.lng) return null;
  return distanceKm(Number(loc.lat), Number(loc.lng), a, b);
}

const norm = (s) => String(s || '').trim().toLowerCase();
const ALIASES = { bengaluru: ['bangalore', 'banglore', 'bengaluru'], bangalore: ['bangalore', 'banglore', 'bengaluru'] };

export function eventIsNear(ev, loc) {
  if (!loc || loc.all) return true;
  const hay = [ev.city, ev.venue, ev.name].map(norm).join(' ');
  const city = norm(loc.city || loc.label);
  const terms = [...(ALIASES[city] || [city]), norm(loc.area), norm(loc.state)].filter((t) => t.length > 2);
  if (terms.some((t) => hay.includes(t))) return true;
  const d = eventDistance(ev, loc);
  return d !== null && d <= NEAR_KM;
}

export function fmtKm(d) {
  if (d === null || d === undefined) return '';
  return d < 1 ? '< 1 km away' : `${d < 10 ? d.toFixed(1) : Math.round(d)} km away`;
}

// Browser GPS -> place name. Resolves to a location or rejects with a readable message.
export function detectLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('Location services are unavailable in this browser')); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      // OpenStreetMap allows ~1 lookup/sec, so reuse the last place name unless the visitor moved > 1 km.
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(GEO_CACHE) || 'null'); } catch { /* ignore */ }
      const fresh = cached && distanceKm(lat, lng, cached.lat, cached.lng) < 1 && (!cached.fallbackUntil || cached.fallbackUntil > Date.now());
      if (fresh) { resolve({ ...cached, lat, lng }); return; }
      let place;
      try {
        place = await reverseLookup(lat, lng);
      } catch {
        // Lookup unavailable (offline / rate-limited): use the nearest known city and retry in 10 minutes.
        const c = nearestCity(lat, lng);
        place = { lat, lng, city: c.city, state: c.state, source: 'gps', fallbackUntil: Date.now() + 10 * 60 * 1000 };
      }
      try { localStorage.setItem(GEO_CACHE, JSON.stringify(place)); } catch { /* ignore */ }
      resolve(place);
    }, (err) => {
      reject(new Error(err.code === 1 ? 'Location permission was denied' : err.code === 3 ? 'Location request timed out' : 'Current location is unavailable'));
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 });
  });
}

export function nearestCity(lat, lng) {
  return INDIA_LOCATIONS.reduce((best, c) => {
    const d = distanceKm(lat, lng, c.lat, c.lng);
    return d < best.d ? { ...c, d } : best;
  }, { d: Infinity });
}

export async function reverseLookup(lat, lng) {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=14&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('lookup failed');
  const a = (await r.json()).address || {};
  return {
    lat, lng, source: 'gps',
    area: a.suburb || a.neighbourhood || a.city_district || '',
    city: a.city || a.town || a.village || a.county || a.state_district || nearestCity(lat, lng).city,
    state: a.state || '',
  };
}

export async function searchPlaces(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('Location search failed');
  return (await r.json()).map((x) => {
    const a = x.address || {};
    return {
      lat: Number(x.lat), lng: Number(x.lon),
      city: a.city || a.town || a.village || a.county || x.name,
      area: a.suburb || a.neighbourhood || '',
      state: a.state || '',
      display: x.display_name,
    };
  });
}
