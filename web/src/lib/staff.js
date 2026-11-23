// Staff (Opportunity) session + API. Staff authenticate with their BEE-OAK account; the server
// issues an `opp_staff` token only if the account has an active staff membership.
import { storage, v2 } from './api';
import { publicUrl } from './env';

const TOKEN = 'beeoak.web.staff.token';
const USER = 'beeoak.web.staff.user';
const MEMBERS = 'beeoak.web.staff.memberships';

export const staffSession = {
  token: () => storage.get(TOKEN, ''),
  user: () => storage.get(USER, null),
  memberships: () => storage.get(MEMBERS, []),
  save({ token, user, memberships }) {
    if (token) storage.set(TOKEN, token);
    if (user) storage.set(USER, user);
    if (memberships) storage.set(MEMBERS, memberships);
  },
  clear() { storage.del(TOKEN); storage.del(USER); storage.del(MEMBERS); },
};
const t = () => staffSession.token();

export async function staffLogin(email, password) {
  const d = await v2('/v2/staff/login', { method: 'POST', body: { email, password } });
  staffSession.save(d);
  return d;
}
export async function refreshMemberships() {
  const d = await v2('/v2/staff/memberships', { token: t() });
  staffSession.save({ memberships: d.memberships });
  return d.memberships;
}
export const staffInvite = (eventId, { code, ref }) => v2(`/v2/staff/invite?eventId=${encodeURIComponent(eventId)}${code ? `&code=${encodeURIComponent(code)}` : ''}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`);
export async function staffRegister(body, buyerToken) {
  const d = await v2('/v2/staff/register', { method: 'POST', body, token: buyerToken });
  staffSession.save({ token: d.token, memberships: [d.membership, ...staffSession.memberships().filter((m) => m.memberId !== d.membership.memberId)], user: staffSession.user() || { name: d.membership.name, email: body.email } });
  return d;
}
export const staffDashboard = (m) => v2(`/v2/staff/m/${encodeURIComponent(m)}/dashboard`, { token: t() });
export const staffTeamMember = (m, id) => v2(`/v2/staff/m/${encodeURIComponent(m)}/team/${encodeURIComponent(id)}`, { token: t() });
export const staffAllocate = (m, body) => v2(`/v2/staff/m/${encodeURIComponent(m)}/allocations`, { method: 'POST', token: t(), body });
export const staffPurchase = (m, body) => v2(`/v2/staff/m/${encodeURIComponent(m)}/purchases`, { method: 'POST', token: t(), body });
export const staffConfirmPurchase = (m, pid) => v2(`/v2/staff/m/${encodeURIComponent(m)}/purchases/${encodeURIComponent(pid)}/confirm`, { method: 'POST', token: t() });

export const customerLink = (eventId, ref) => publicUrl(`/opportunity/event/${encodeURIComponent(eventId)}?ref=${encodeURIComponent(ref)}`);
export const recruitLink = (eventId, { ref, code }) => publicUrl(`/opportunity/event/${encodeURIComponent(eventId)}/join?${ref ? `ref=${encodeURIComponent(ref)}` : `code=${encodeURIComponent(code)}`}`);
