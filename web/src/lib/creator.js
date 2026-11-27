// Creator mode data layer — mirrors the BEE-OAK app's creator endpoints.
// Reads (session, events, analytics, staff, ticket lookup) use the real API for real creator accounts.
// Writes (apply, publish event, banner upload, staff, finance PIN, check-ins) are sandboxed unless VITE_WRITE_MODE=live.
import { API_BASE, IS_SANDBOX, storage, FEE_RATE, v2, serverDown } from './api';

const TOKEN = 'beeoak.web.creator.token';
const ME = 'beeoak.web.creator';
const SBX_CREATORS = 'beeoak.web.sandbox.creators';
export const SBX_EVENTS = 'beeoak.web.sandbox.events';
const SBX_STAFF = 'beeoak.web.sandbox.staff';
const SBX_SCANS = 'beeoak.web.sandbox.scans';
const SBX_PIN = 'beeoak.web.sandbox.pins';
const SBX_BOOKINGS = 'beeoak.web.sandbox.bookings';

export const CREATOR_CATEGORIES = ['Music', 'Tech', 'Comedy', 'Sports', 'Food', 'Art', 'Opportunity', 'Startup', 'College', 'Other'];
export const KYC_DOCS = [
  { type: 'pan', label: 'PAN card' },
  { type: 'aadhaar', label: 'Aadhaar / ID' },
  { type: 'gst', label: 'GST certificate' },
  { type: 'bank', label: 'Bank details / cancelled cheque' },
];
export const STAFF_ROLES = ['Scanner', 'Ticket Seller', 'Gate Manager', 'Full Access'];
export const GATES = ['Gate A', 'Gate B', 'Gate C', 'Gate D', 'VIP Gate'];

export const creatorSession = {
  token: () => storage.get(TOKEN, ''),
  me: () => storage.get(ME, null),
  save(c, t) { storage.set(ME, c); if (t) storage.set(TOKEN, t); },
  clear() { storage.del(ME); storage.del(TOKEN); },
};
const isSbxCreator = () => String(creatorSession.token()).startsWith('sandbox.');

async function req(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = creatorSession.token();
  if (t && !t.startsWith('sandbox.')) headers.Authorization = 'Bearer ' + t;
  let r;
  try { r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { throw new Error('Could not reach BEE-OAK servers. Check your connection.'); }
  let d = {};
  try { d = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const e = new Error(d.error || serverDown(r.status)); e.status = r.status; e.data = d; throw e; }
  return d;
}

async function sha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read file')); r.readAsDataURL(file); });

/* ---------- Auth ---------- */
export async function creatorLogin(email, password) {
  const id = String(email || '').trim().toLowerCase();
  if (!id || !password) throw new Error('Creator email and password are required');
  const local = storage.get(SBX_CREATORS, []).find((c) => c.email === id);
  if (local) {
    if (local.passwordHash !== (await sha(password))) throw new Error('Invalid creator email or password');
    const { passwordHash, ...c } = local; // eslint-disable-line no-unused-vars
    creatorSession.save(c, 'sandbox.' + c.id);
    return c;
  }
  const d = await req('/creator/login', { method: 'POST', body: { email: id, password } });
  creatorSession.save(d.creator, d.token);
  return d.creator;
}

export async function restoreCreator() {
  const t = creatorSession.token();
  if (!t) return null;
  if (t.startsWith('sandbox.')) return creatorSession.me();
  try { const d = await req('/creator/session'); creatorSession.save(d.creator, t); return d.creator; } catch { creatorSession.clear(); return null; }
}

export async function applyCreator(form, files) {
  const body = {
    name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(),
    category: form.category, about: form.about.trim(), password: form.password,
  };
  if (!body.name || !body.email || !body.phone || !body.category || !body.about || !body.password) throw new Error('Name, email, phone, event type, about, and password are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new Error('Enter a valid creator email address');
  if (body.password.length < 8) throw new Error('Creator password must be at least 8 characters');
  const documents = await Promise.all(Object.entries(files).filter(([, f]) => f).map(async ([documentType, f]) => ({ documentType, fileName: f.name, dataUrl: await fileToDataUrl(f) })));
  if (IS_SANDBOX) {
    const list = storage.get(SBX_CREATORS, []);
    if (list.some((c) => c.email === body.email)) throw new Error('A creator application with this email already exists');
    // Sandbox auto-approves so the full creator flow can be explored; live mode waits for admin KYC review.
    list.push({ id: 'SBXC-' + Date.now(), name: body.name, email: body.email, phone: body.phone, category: body.category, about: body.about, kycStatus: 'Approved', joinedAt: new Date().toISOString(), documents: documents.map((d) => d.documentType), passwordHash: await sha(body.password) });
    storage.set(SBX_CREATORS, list);
    return { approved: true };
  }
  await req('/creator/applications', { method: 'POST', body: { ...body, documents } });
  return { approved: false };
}

/* ---------- Events ---------- */
export function sandboxEvents() { return storage.get(SBX_EVENTS, []); }

export async function myEvents(creator) {
  const local = sandboxEvents().filter((e) => e.creatorId === creator.id);
  if (isSbxCreator()) return local;
  const remote = (await req('/creator/events')).events || [];
  return [...local, ...remote];
}

export async function publishEvent(creator, ev, bannerFile, mediaFiles = []) {
  if (!bannerFile) throw new Error('Upload an event banner before publishing');
  const dataUrl = await fileToDataUrl(bannerFile);
  const free = /^free$/i.test(ev.category);
  const tickets = ev.tickets.map((t) => ({ name: t.name.trim(), price: free ? 0 : Number(t.price || 0), qty: Number(t.qty || 0), perks: (t.perks || '').trim() })).filter((t) => t.name && t.qty > 0 && t.price >= 0);
  if (!tickets.length) throw new Error('Add at least one valid ticket tier');
  const payload = { ...ev, capacity: Number(ev.capacity), tickets, visibility: ev.visibility || 'Public' };
  if (IS_SANDBOX || isSbxCreator()) {
    const saved = {
      ...payload, id: 'EVT-SBX-' + Date.now(), creatorId: creator.id, creatorName: creator.name,
      banner: dataUrl, bannerKey: 'sandbox', status: 'live', bookingCount: 0, revenue: 0, checkins: 0, createdAt: new Date().toISOString(), sandbox: true,
    };
    try { storage.set(SBX_EVENTS, [saved, ...sandboxEvents()]); } catch { throw new Error('Banner is too large for sandbox storage — use an image under 3 MB.'); }
    if (!storage.get(SBX_EVENTS, []).some((e) => e.id === saved.id)) throw new Error('Banner is too large for sandbox storage — use an image under 3 MB.');
    return { event: saved };
  }
  const upload = async (file) => req('/creator/events/banner', { method: 'POST', body: { fileName: file.name, dataUrl: await fileToDataUrl(file) } });
  const asset = await upload(bannerFile);
  const media = [];
  for (const f of mediaFiles) {
    const a = await upload(f);
    media.push({ type: /^video\//.test(f.type) ? 'video' : 'image', url: a.mediaUrl || a.url, key: a.key });
  }
  return req('/creator/events', { method: 'POST', body: { ...payload, media, banner: asset.mediaUrl || asset.url, bannerKey: asset.key } });
}

/* ---------- Analytics / revenue ---------- */
function sandboxBookingsFor(eventIds) {
  return storage.get(SBX_BOOKINGS, []).filter((b) => eventIds.has(b.eventId) && b.status !== 'refunded');
}

export async function analytics(creator) {
  const local = sandboxEvents().filter((e) => e.creatorId === creator.id);
  const lb = sandboxBookingsFor(new Set(local.map((e) => e.id)));
  const localEvents = local.map((e) => {
    const bs = lb.filter((b) => b.eventId === e.id);
    return { id: e.id, name: e.name, status: e.status, date: e.date, revenue: bs.reduce((s, b) => s + Number(b.total || 0), 0), tickets: bs.reduce((s, b) => s + Number(b.qty || 1), 0), sandbox: true };
  });
  let remote = { summary: { gross: 0, tickets: 0 }, events: [], staff: [] };
  if (!isSbxCreator()) remote = await req('/creator/analytics');
  const events = [...localEvents, ...(remote.events || [])];
  const gross = events.reduce((s, e) => s + e.revenue, 0);
  const tickets = events.reduce((s, e) => s + e.tickets, 0);
  const fee = Math.round(gross * (FEE_RATE / 100));
  const localStaff = storage.get(SBX_STAFF, []).filter((s) => s.creatorId === creator.id).map((s) => ({ id: s.id, name: s.name, staffId: s.staffId, assignedTickets: s.assignedTickets, soldTickets: 0, earnings: 0 }));
  return {
    summary: { gross, fee, net: gross - fee, tickets, averageTicketPrice: tickets ? Math.round(gross / tickets) : 0, payoutStatus: gross > 0 ? 'Pending' : 'No payout due' },
    events, staff: [...localStaff, ...(remote.staff || [])],
  };
}

// The finance PIN is set on first use, like the app. Sandbox keeps it in this browser.
export async function unlockFinance(creator, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('Enter a valid 4-digit PIN');
  if (IS_SANDBOX || isSbxCreator()) {
    const pins = storage.get(SBX_PIN, {});
    const h = await sha(creator.id + ':' + pin);
    let initialized = false;
    if (!pins[creator.id]) { pins[creator.id] = h; storage.set(SBX_PIN, pins); initialized = true; } else if (pins[creator.id] !== h) throw new Error('Incorrect finance PIN');
    return { initialized };
  }
  return req('/creator/finance/unlock', { method: 'POST', body: { pin } });
}

/* ---------- Staff ---------- */
export async function staffList(creator) {
  const local = storage.get(SBX_STAFF, []).filter((s) => s.creatorId === creator.id);
  if (isSbxCreator()) return { staff: local, summary: { totalStaff: local.length, ticketsSold: 0, revenue: 0 } };
  const d = await req('/creator/staff');
  const staff = [...local, ...(d.staff || [])];
  return { staff, summary: { ...d.summary, totalStaff: staff.length } };
}

export async function addStaff(creator, f) {
  const staffId = String(f.staffId || '').trim().toLowerCase();
  if (!f.name.trim() || !staffId || String(f.password || '').length < 6) throw new Error('Name, login ID, and a temporary password of at least 6 characters are required');
  if (IS_SANDBOX || isSbxCreator()) {
    const list = storage.get(SBX_STAFF, []);
    if (list.some((s) => s.creatorId === creator.id && s.staffId === staffId)) throw new Error('A staff member with this login ID already exists');
    const m = {
      id: 'STF-SBX-' + Date.now(), creatorId: creator.id, name: f.name.trim(), staffId, email: f.email.trim(), phone: f.phone.trim(), role: f.role,
      assignedGate: f.assignedGate, primaryEventId: f.eventId || null, tierName: f.tierName || '', allocationMode: f.allocationMode,
      assignedTickets: Number(f.qty || 0), soldTickets: 0, earnings: 0, commissionRate: Number(f.commissionRate || 0), status: 'active',
      shareToken: `${staffId}-${Math.random().toString(16).slice(2, 10)}`, createdAt: new Date().toISOString(), sandbox: true,
    };
    storage.set(SBX_STAFF, [m, ...list]);
    return m;
  }
  const d = await req('/creator/staff', { method: 'POST', body: { ...f, staffId, qty: Number(f.qty || 0) } });
  return d.staff || d.member || d;
}

/* ---------- Scanner ---------- */
// QR formats: real tickets "VYBERA-TICKET|bookingId|eventId|token", sandbox tickets "BEEOAK|bookingId|SANDBOX|eventId".
export function scanLog(creator) { return storage.get(SBX_SCANS, []).filter((s) => s.creatorId === creator.id); }

export async function validateTicket(creator, raw, myEventIds) {
  const payload = String(raw || '').trim();
  const parts = payload.split('|');
  const log = (entry) => { storage.set(SBX_SCANS, [{ ...entry, creatorId: creator.id, at: new Date().toISOString() }, ...storage.get(SBX_SCANS, [])].slice(0, 200)); return entry; };
  const seen = (id) => storage.get(SBX_SCANS, []).some((s) => s.bookingId === id && s.result === 'valid');

  if (parts[0] === 'BEEOAK' && parts.length >= 4) {
    const b = storage.get(SBX_BOOKINGS, []).find((x) => x.id === parts[1]);
    if (!b || b.qrPayload !== payload) return log({ result: 'invalid', message: 'Ticket not found', bookingId: parts[1] });
    if (!myEventIds.has(b.eventId)) return log({ result: 'invalid', message: 'This ticket is for an event you don’t host', bookingId: b.id, booking: b });
    if (seen(b.id)) return log({ result: 'duplicate', message: 'Already checked in', bookingId: b.id, booking: b });
    return log({ result: 'valid', message: `Admit ${b.qty}`, bookingId: b.id, booking: b });
  }
  if (parts[0] === 'VYBERA-TICKET' && parts.length >= 4) {
    if (!(IS_SANDBOX || isSbxCreator())) {
      try {
        const d = await req('/bookings/scan', { method: 'POST', body: { qrPayload: payload } });
        return log({ result: d.result || 'valid', message: d.result === 'duplicate' ? 'Already checked in' : `Admit ${d.booking?.qty || 1}`, bookingId: parts[1], booking: d.booking });
      } catch (e) {
        return log({ result: e.data?.result || 'invalid', message: e.message, bookingId: parts[1], booking: e.data?.booking });
      }
    }
    // Sandbox: verify against the real ticket without recording a check-in in the database.
    try {
      const { booking } = await req('/bookings/' + encodeURIComponent(parts[1]) + '/ticket');
      if (booking.qrPayload !== payload) return log({ result: 'invalid', message: 'QR code does not match this ticket', bookingId: parts[1] });
      if (myEventIds.size && !myEventIds.has(booking.eventId)) return log({ result: 'invalid', message: 'This ticket is for an event you don’t host', bookingId: booking.id, booking });
      if (booking.scannedAt || seen(booking.id)) return log({ result: 'duplicate', message: 'Already checked in', bookingId: booking.id, booking });
      return log({ result: 'valid', message: `Admit ${booking.qty}`, bookingId: booking.id, booking });
    } catch (e) {
      return log({ result: 'invalid', message: e.message || 'Ticket not found', bookingId: parts[1] });
    }
  }
  return log({ result: 'invalid', message: 'Not a BEE-OAK ticket QR' });
}

/* ---------- Opportunity management (organizer) ---------- */
const ct = () => creatorSession.token();
export const oppManage = (eventId) => v2(`/v2/creator/events/${encodeURIComponent(eventId)}/opportunity`, { token: ct() });
export const oppSettings = (eventId, body) => v2(`/v2/creator/events/${encodeURIComponent(eventId)}/opportunity`, { method: 'PATCH', token: ct(), body });
export const oppAddStaff = (eventId, body) => v2(`/v2/creator/events/${encodeURIComponent(eventId)}/staff`, { method: 'POST', token: ct(), body });
export const oppAllocate = (eventId, body) => v2(`/v2/creator/events/${encodeURIComponent(eventId)}/allocations`, { method: 'POST', token: ct(), body });
export const oppStaffDetail = (eventId, staffId) => v2(`/v2/creator/events/${encodeURIComponent(eventId)}/staff/${encodeURIComponent(staffId)}`, { token: ct() });

/* ---------- Organizer plans & credits (1 credit = 1 digital ticket) ---------- */
export const planStatus = () => v2('/v2/creator/subscription', { token: ct() });
export const planStart = (planId, billingPeriod) => v2('/v2/creator/subscription', { method: 'POST', token: ct(), body: { planId, billingPeriod } });
export const planPay = (id, returnUrl) => v2(`/v2/creator/subscription/${encodeURIComponent(id)}/pay`, { method: 'POST', token: ct(), body: { returnUrl } });
export const planSimulate = (id, outcome = 'success') => v2(`/v2/creator/subscription/${encodeURIComponent(id)}/simulate`, { method: 'POST', token: ct(), body: { outcome } });
export const planConfirm = (id) => v2(`/v2/creator/subscription/${encodeURIComponent(id)}/confirm`, { method: 'POST', token: ct() });
