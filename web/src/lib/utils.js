export const CATEGORIES = [
  { key: 'All', label: 'All', icon: '✦' },
  { key: 'Opportunity', label: 'Opportunity', icon: '◆' },
  { key: 'Music', label: 'Music', icon: '♪' },
  { key: 'Food', label: 'Food', icon: '❖' },
  { key: 'Free', label: 'Free', icon: '○' },
  { key: 'CollegeArt', label: 'College Art', icon: '✎' },
  { key: 'Comedy', label: 'Comedy', icon: '☺' },
  { key: 'Sports', label: 'Sports', icon: '◎' },
  { key: 'Tech', label: 'Tech', icon: '⌘' },
  { key: 'Startup', label: 'Startup', icon: '▲' },
  { key: 'Other', label: 'Experiences', icon: '✧' },
];
// Event creation categories (creator mode). Only Opportunity enables staff features.
export const CREATE_CATEGORIES = ['Opportunity', 'Music', 'Food', 'Free', 'College Art', 'Comedy'];

export function categoryKey(raw) {
  const c = String(raw || '').toLowerCase();
  if (c.includes('opportunit')) return 'Opportunity';
  if (/^\s*free\s*$/.test(c)) return 'Free';
  if (c.includes('startup')) return 'Startup';
  if (c.includes('college') || c.includes('campus') || /\bart\b|\barts\b|art\s*\/|culture|^art/.test(c)) return 'CollegeArt';
  if (c.includes('music') || c.includes('concert')) return 'Music';
  if (c.includes('comedy') || c.includes('stand')) return 'Comedy';
  if (c.includes('sport')) return 'Sports';
  if (c.includes('tech') || c.includes('conference')) return 'Tech';
  if (c.includes('food') || c.includes('drink')) return 'Food';
  return 'Other';
}

export const parseDate = (d) => {
  if (!d) return null;
  const x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : d);
  return isNaN(x) ? null : x;
};

export function fmtDate(d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const x = parseDate(d);
  return x ? x.toLocaleDateString('en-IN', opts) : 'Date TBA';
}
export const fmtLongDate = (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function fmtINR(n) {
  const v = Number(n || 0);
  if (v === 0) return 'Free';
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function minPrice(ev) {
  const prices = (ev.tickets || []).map((t) => Number(t.price || 0));
  return prices.length ? Math.min(...prices) : 0;
}
export const priceLabel = (ev) => {
  const p = minPrice(ev);
  return p === 0 ? 'Free entry' : `From ${fmtINR(p)}`;
};

export function isPast(ev) {
  const d = parseDate(ev.date);
  if (!d) return false;
  const end = new Date(d); end.setHours(23, 59, 59);
  return end < new Date();
}

export function tierRemaining(t) {
  return Math.max(0, Number(t.qty || 0) - Number(t.sold || t.soldCount || 0));
}

export function capacityLeft(ev) {
  const cap = Number(ev.capacity || 0);
  if (!cap) return null;
  return Math.max(0, cap - Number(ev.bookingCount || 0));
}

export const cityOf = (ev) => {
  const c = String(ev.city || '').trim();
  if (/^ban[gl]/i.test(c)) return 'Bengaluru';
  return c || 'India';
};

export function initials(user) {
  if (!user) return '?';
  const n = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '?';
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
export const displayName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.email : '');

export function mapsLink(ev) {
  if (ev.latitude && ev.longitude) return `https://www.google.com/maps/search/?api=1&query=${ev.latitude},${ev.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.venue, ev.city].filter(Boolean).join(', '))}`;
}
