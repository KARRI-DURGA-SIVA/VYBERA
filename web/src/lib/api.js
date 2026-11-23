// BEE-OAK web data layer.
// Reads (events, session, tickets) always hit the real BEE-OAK API.
// Writes (sign-up, bookings, payments) run in a browser sandbox unless
// VITE_WRITE_MODE=live, so local review never touches the production database.
import QRCode from 'qrcode';

export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://vybera.onrender.com').replace(/\/$/, '');
export const WRITE_MODE = import.meta.env.VITE_WRITE_MODE === 'live' ? 'live' : 'sandbox';
export const IS_SANDBOX = WRITE_MODE === 'sandbox';

const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
export const storage = LS;

const TOKEN_KEY = 'beeoak.web.token';
const USER_KEY = 'beeoak.web.user';
const SANDBOX_USERS = 'beeoak.web.sandbox.users';
const SANDBOX_BOOKINGS = 'beeoak.web.sandbox.bookings';

// A response without a BEE-OAK error body means we never reached the server
// (e.g. the ngrok tunnel/dev server is offline) — say so instead of a bare status code.
export function serverDown(status) {
  if ([404, 502, 503, 504].includes(status)) return 'Can’t reach the BEE-OAK server right now. The link may be offline for a moment — please try again shortly.';
  return `Something went wrong (error ${status}). Please try again.`;
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = LS.get(TOKEN_KEY, '');
    if (token) headers.Authorization = 'Bearer ' + token;
  }
  let resp;
  try {
    resp = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Could not reach BEE-OAK servers. Check your connection and try again.');
  }
  let data = {};
  try { data = await resp.json(); } catch { /* empty body */ }
  if (!resp.ok) throw new Error(data.error || serverDown(resp.status));
  return data;
}

export const mediaUrl = (path) => {
  if (!path) return '';
  if (typeof path === 'object') path = path.url;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return API_BASE + (path.startsWith('/') ? path : '/' + path);
};

/* ---------------- Events (always live) ---------------- */
let eventsCache = null;
let eventsPromise = null;
export function getEvents({ force = false } = {}) {
  if (eventsCache && !force) return Promise.resolve(eventsCache);
  if (eventsPromise && !force) return eventsPromise;
  eventsPromise = request('/events')
    .then((d) => {
      // Events published from creator mode in sandbox appear alongside live ones.
      const local = IS_SANDBOX ? LS.get('beeoak.web.sandbox.events', []).filter((e) => e.status === 'live') : [];
      eventsCache = [...local, ...(d.events || [])].filter((e) => (e.visibility || 'Public') === 'Public');
      return eventsCache;
    })
    .finally(() => { eventsPromise = null; });
  return eventsPromise;
}
export async function getEvent(id) {
  const all = await getEvents();
  return all.find((e) => e.id === id) || null;
}

/* ---------------- Auth ---------------- */
export const session = {
  token: () => LS.get(TOKEN_KEY, ''),
  user: () => LS.get(USER_KEY, null),
  save(user, token) { LS.set(USER_KEY, user); if (token) LS.set(TOKEN_KEY, token); },
  clear() { LS.del(USER_KEY); LS.del(TOKEN_KEY); },
};

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function login(identifier, password) {
  const id = String(identifier || '').trim();
  if (!id || !password) throw new Error('Email or phone and password are required');
  if (IS_SANDBOX) {
    const users = LS.get(SANDBOX_USERS, []);
    const digits = id.replace(/\D/g, '');
    const u = users.find((x) => x.email.toLowerCase() === id.toLowerCase() || (digits.length >= 10 && x.phone.endsWith(digits.slice(-10))));
    if (u) {
      if (u.passwordHash !== (await hash(password))) throw new Error('Invalid password');
      const { passwordHash, ...user } = u; // eslint-disable-line no-unused-vars
      session.save(user, 'sandbox.' + user.id);
      return user;
    }
    // Not a sandbox account: verify against the real API (read-only check, issues a session token).
  }
  const d = await request('/login', { method: 'POST', body: { email: id, password } });
  session.save(d.user, d.token);
  return d.user;
}

// Google sign-in — same Firebase project and /social-login endpoint as the BEE-OAK app.
const FIREBASE = {
  apiKey: 'AIzaSyCmHaayfQy0WSOE1HG_bDjs4tiVJFDFb84',
  authDomain: 'vybera.firebaseapp.com',
  projectId: 'vybera',
  appId: '1:544899681732:web:72950958f1ac6b83356891',
};
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
// Android app: native Google account chooser (cordova-plugin-googleplus, same OAuth web client as the app).
const GOOGLE_WEB_CLIENT_ID = '544899681732-68u9ma1sfqtttsfp2nde8q6jtff9bh6g.apps.googleusercontent.com';
function nativeGoogle() {
  return new Promise((resolve, reject) => {
    window.plugins.googleplus.login({ webClientId: GOOGLE_WEB_CLIENT_ID, offline: false }, resolve, (err) => {
      const code = String(err?.code ?? err);
      if (code === '12501' || /cancel/i.test(code)) reject(new Error('Google sign-in was cancelled.'));
      else reject(new Error('Google sign-in failed. Please try again.'));
    });
  });
}

export async function googleLogin() {
  if (window.plugins?.googleplus) {
    const g = await nativeGoogle();
    if (!g?.email) throw new Error('Google account did not return an email address.');
    const d = await request('/social-login', { method: 'POST', body: { name: g.displayName || 'Google User', email: g.email, photoURL: g.imageUrl || '', provider: 'google' } });
    session.save(d.user, d.token);
    return d.user;
  }
  let appMod, authMod;
  try {
    [appMod, authMod] = await Promise.all([import(/* @vite-ignore */ FB + 'firebase-app.js'), import(/* @vite-ignore */ FB + 'firebase-auth.js')]);
  } catch { throw new Error('Could not reach Google. Check your connection and try again.'); }
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE);
  const auth = authMod.getAuth(app);
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let cred;
  try { cred = await authMod.signInWithPopup(auth, provider); } catch (e) {
    if (/popup-closed|cancelled-popup/.test(e.code || '')) throw new Error('Google sign-in was cancelled.');
    if (/unauthorized-domain/.test(e.code || '')) throw new Error('Google sign-in isn’t enabled for this address yet. Use email and password.');
    if (/popup-blocked/.test(e.code || '')) throw new Error('Your browser blocked the Google window. Allow pop-ups and try again.');
    throw new Error('Google sign-in failed. Please try again.');
  }
  const g = cred.user;
  if (!g?.email) throw new Error('Google account did not return an email address.');
  const d = await request('/social-login', { method: 'POST', body: { name: g.displayName || 'Google User', email: g.email, photoURL: g.photoURL || '', provider: 'google' } });
  authMod.signOut(auth).catch(() => {});
  session.save(d.user, d.token);
  return d.user;
}

export async function restoreSession() {
  const token = session.token();
  if (!token) return null;
  if (token.startsWith('sandbox.')) return session.user();
  try {
    const d = await request('/session', { auth: true });
    session.save(d.user, token);
    return d.user;
  } catch {
    session.clear();
    return null;
  }
}

export async function sendOtp(phone) {
  const digits = '91' + String(phone).replace(/\D/g, '').slice(-10);
  if (IS_SANDBOX) return { sent: true, sandbox: true };
  return request('/otp/msg91/send', { method: 'POST', body: { identifier: digits } });
}
export async function verifyOtp(phone, otp) {
  const digits = '91' + String(phone).replace(/\D/g, '').slice(-10);
  if (IS_SANDBOX) {
    if (otp !== '123456') throw new Error('Incorrect OTP. In sandbox mode the code is 123456.');
    return { verified: true, accessToken: 'sandbox-otp' };
  }
  const d = await request('/otp/msg91/verify', { method: 'POST', body: { identifier: digits, otp } });
  return { verified: true, accessToken: d.accessToken || d.otpAccessToken || d.token || '' };
}

export async function signup(form) {
  const payload = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    username: form.email.split('@')[0],
    email: form.email.trim().toLowerCase(),
    phone: String(form.phone).replace(/\D/g, '').slice(-10),
    countryCode: '+91',
    city: form.city.trim(),
    password: form.password,
    otpAccessToken: form.otpAccessToken,
  };
  if (IS_SANDBOX) {
    const users = LS.get(SANDBOX_USERS, []);
    if (users.some((u) => u.email === payload.email)) throw new Error('An account with this email already exists');
    const user = {
      id: 'SBX-' + Date.now(), username: payload.username, firstName: payload.firstName, lastName: payload.lastName,
      email: payload.email, phone: payload.phone, countryCode: '+91', city: payload.city, status: 'Active',
      passwordHash: await hash(payload.password),
    };
    users.push(user);
    LS.set(SANDBOX_USERS, users);
    return login(payload.email, payload.password);
  }
  await request('/signup', { method: 'POST', body: payload });
  return login(payload.email, payload.password);
}

export async function forgotPassword(email) {
  if (!email) throw new Error('Email is required');
  if (IS_SANDBOX) return { message: 'If that email is registered, a reset link has been sent.' };
  return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function updateProfile(user, changes) {
  const name = `${changes.firstName || ''} ${changes.lastName || ''}`.trim();
  if (name.length < 2) throw new Error('Enter a valid name');
  if (IS_SANDBOX || String(session.token()).startsWith('sandbox.')) {
    const next = { ...user, ...changes };
    const users = LS.get(SANDBOX_USERS, []);
    LS.set(SANDBOX_USERS, users.map((u) => (u.id === user.id ? { ...u, ...changes } : u)));
    session.save(next, session.token());
    return next;
  }
  const d = await request('/profile', { method: 'PUT', body: { name }, auth: true });
  session.save(d.user, session.token());
  return d.user;
}

/* ---------------- Fees (mirrors the app: 8% convenience fee, 18% GST on fee) ---------------- */
export const FEE_RATE = 8;
export const GST_RATE = 18;
export function computeTotals(price, qty) {
  const subtotal = Number(price || 0) * qty;
  const fee = subtotal > 0 ? Math.round(subtotal * (FEE_RATE / 100) * 100) / 100 : 0;
  const gst = fee > 0 ? Math.round(fee * (GST_RATE / 100) * 100) / 100 : 0;
  const total = Math.round((subtotal + fee + gst) * 100) / 100;
  return { price: Number(price || 0), qty, subtotal, fee, gst, total, feeRate: FEE_RATE, gstRate: GST_RATE };
}

/* ---------------- Bookings ---------------- */
export async function createBooking({ event, tier, qty, buyer, user, payment }) {
  const totals = computeTotals(tier.price, qty);
  const booking = {
    id: 'BLT-' + Date.now(),
    userId: user && !String(user.id).startsWith('SBX-') ? user.id : undefined,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    eventVenue: [...new Set([event.venue, event.city].filter(Boolean).map((s) => s.trim()))].join(', '),
    eventBanner: event.banner,
    ticketType: tier.name,
    price: totals.price,
    qty,
    subtotal: totals.subtotal,
    fee: totals.fee,
    gst: totals.gst,
    total: totals.total,
    buyer: buyer.name,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    buyerPhone: buyer.phone,
    status: 'upcoming',
    bookedAt: new Date().toISOString(),
    payment,
  };
  if (IS_SANDBOX) {
    const qrPayload = `BEEOAK|${booking.id}|SANDBOX|${event.id}`;
    const saved = {
      ...booking,
      eventTime: event.time,
      qrPayload,
      qrImage: await QRCode.toDataURL(qrPayload, { width: 320, margin: 2, color: { dark: '#04331F', light: '#FFFFFF' } }),
      sandbox: true,
      ownerEmail: (user && user.email) || buyer.email,
    };
    LS.set(SANDBOX_BOOKINGS, [saved, ...LS.get(SANDBOX_BOOKINGS, [])]);
    return saved;
  }
  const d = await request('/bookings', { method: 'POST', body: booking });
  return { ...d.booking, eventTime: event.time, subtotal: totals.subtotal, fee: totals.fee, gst: totals.gst };
}

export async function initiatePayment({ event, tier, qty, buyer }) {
  const totals = computeTotals(tier.price, qty);
  const bookingId = 'BLT-' + Date.now();
  return request('/payments/payu/initiate', {
    method: 'POST',
    body: {
      txnid: bookingId, bookingId, eventId: event.id, ticketType: tier.name, qty,
      amount: totals.total, productinfo: 'BEE-OAK - ' + event.name,
      firstname: buyer.name, email: buyer.email, phone: buyer.phone, intent: false,
    },
  });
}

export async function getMyBookings(user) {
  const local = LS.get(SANDBOX_BOOKINGS, []).filter((b) => user && b.ownerEmail?.toLowerCase() === user.email?.toLowerCase());
  let remote = [];
  const token = session.token();
  if (token && !token.startsWith('sandbox.')) {
    try { remote = (await request('/bookings/mine', { auth: true })).bookings || []; } catch { remote = []; }
  }
  const seen = new Set();
  return [...local, ...remote].filter((b) => (seen.has(b.id) ? false : seen.add(b.id)));
}

export async function getBooking(id) {
  const local = LS.get(SANDBOX_BOOKINGS, []).find((b) => b.id === id);
  if (local) return local;
  const d = await request('/bookings/' + encodeURIComponent(id) + '/ticket');
  return d.booking;
}

/* ================= v2: verified bookings, payments, staff, organizer ================= */
export async function v2(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let r;
  try { r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { throw new Error('Could not reach BEE-OAK servers. Check your connection and try again.'); }
  let d = {};
  try { d = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const e = new Error(d.error || serverDown(r.status)); e.status = r.status; throw e; }
  return d;
}
const buyerToken = () => session.token();

export const eventStaff = (eventId) => v2(`/v2/events/${encodeURIComponent(eventId)}/staff`);
export const resolveRef = (eventId, ref) => v2(`/v2/events/${encodeURIComponent(eventId)}/ref/${encodeURIComponent(ref)}`);
export const eventInventory = (eventId) => v2(`/v2/events/${encodeURIComponent(eventId)}/inventory`);

// Creates a server-priced hold; free bookings come back confirmed.
export const startBooking = ({ eventId, tierName, qty, staffCode, buyer }) =>
  v2('/v2/bookings', { method: 'POST', token: buyerToken(), body: { eventId, tierName, qty, staffCode: staffCode || undefined, buyer } });
export const confirmBooking = (id) => v2(`/v2/bookings/${encodeURIComponent(id)}/confirm`, { method: 'POST', token: buyerToken() });

// Payment for a booking hold or staff purchase (txnid = its id). Amount is decided by the server.
export const startPayment = (txnid, token, returnUrl, opts = {}) => v2('/v2/payments/start', { method: 'POST', token, body: { txnid, returnUrl, ...(opts.intent ? { intent: true } : {}) } });
export const verifyPayment = (txnid, token) => v2(`/v2/payments/${encodeURIComponent(txnid)}/verify`, { method: 'POST', token });

// Android app: open a UPI app directly (cordova-plugin-native-upi). Resolves when the user returns.
export const canPayUpiNative = () => !!window.plugins?.nativeUpi;
export function payWithUpiApp(intentUrl, pkg) {
  return new Promise((resolve) => window.plugins.nativeUpi.pay(intentUrl, (r) => resolve(r || {}), (e) => resolve({ error: String(e || '') }), pkg || ''));
}

// After a UPI app closes, PayU can take a few seconds to settle: poll the server's PayU check.
export async function waitForPayment(txnid, token, { tries = 20, every = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await verifyPayment(txnid, token).catch(() => ({ status: 'pending' }));
    if (r.status === 'success' || r.status === 'failed') return r.status;
    await new Promise((res) => setTimeout(res, every));
  }
  return 'pending';
}
export const simulatePayment = (txnid, token, outcome = 'success') => v2('/v2/payments/simulate', { method: 'POST', token, body: { txnid, outcome } });
export function submitPayU(action, fields) {
  const form = document.createElement('form');
  form.method = 'POST'; form.action = action;
  Object.entries(fields || {}).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); });
  document.body.appendChild(form); form.submit();
}
export const PENDING_PAY = 'beeoak.web.pendingPayment';
