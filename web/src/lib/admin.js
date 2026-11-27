import { API_BASE, storage } from './api';

// Admin API (same server endpoints the original BEE-OAK admin uses). In dev the partners portal
// proxies /admin-api to the server that holds the admin accounts.
const ADMIN_BASE = import.meta.env.VITE_ADMIN_API_BASE || API_BASE;
const KEY = 'beeoak.web.admin';

export const adminSession = {
  get: () => storage.get(KEY, null),
  token: () => storage.get(KEY, null)?.token || '',
  admin: () => storage.get(KEY, null)?.admin || null,
  save: (admin, token) => storage.set(KEY, { admin, token }),
  clear: () => storage.del(KEY),
};

async function req(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = adminSession.token();
  if (t) headers.Authorization = 'Bearer ' + t;
  let r;
  try { r = await fetch(ADMIN_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { throw new Error('Could not reach BEE-OAK servers. Check your connection.'); }
  let d = {};
  try { d = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && path !== '/admin/login') adminSession.clear();
  if (!r.ok) { const e = new Error(d.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return d;
}

export async function adminLogin(email, password) {
  const d = await req('/admin/login', { method: 'POST', body: { email: String(email || '').trim().toLowerCase(), password } });
  adminSession.save(d.admin, d.token);
  return d.admin;
}
export const adminCheck = () => req('/admin/session');
export const adminSnapshot = () => req('/admin/snapshot');
export const setEventStatus = (id, status) => req(`/admin/events/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
export const setUserStatus = (id, status) => req(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
export const setCreatorStatus = (creatorId, status) => req(`/admin/creators/${encodeURIComponent(creatorId)}/status`, { method: 'PATCH', body: { status } });
export const setDocumentStatus = (creatorId, docId, status) => req(`/admin/creators/${encodeURIComponent(creatorId)}/documents/${encodeURIComponent(docId)}/status`, { method: 'PATCH', body: { status } });
export const adminFileUrl = (url) => (!url ? '' : /^(https?:|data:)/.test(url) ? url : ADMIN_BASE + (url.startsWith('/') ? url : '/' + url));
