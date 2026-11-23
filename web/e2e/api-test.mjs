// Backend scenario test for the Opportunity / staff-hierarchy workflow.
// Runs against the real server.js on a LOCAL database:  node e2e/api-test.mjs http://localhost:3010
import fs from 'node:fs';

const API = process.argv[2] || 'http://localhost:3010';
const results = [];
let failed = 0;
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failed++; };

async function call(method, path, { token, body } = {}) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}
const must = async (method, path, opts) => { const r = await call(method, path, opts); if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const run = Date.now().toString(36);
const banner = `data:image/png;base64,${fs.readFileSync(new URL('../public/logo.png', import.meta.url)).toString('base64')}`;
const future = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

// ---- organizer
const org = await must('POST', '/creator/login', { body: { email: 'organizer@beeoak.test', password: 'Organizer@2026' } });
const C = org.token;

async function createEvent(category, extra = {}) {
  const asset = await must('POST', '/creator/events/banner', { token: C, body: { fileName: 'banner.png', dataUrl: banner } });
  return must('POST', '/creator/events', { token: C, body: {
    name: `${category} Test ${run}`, category, description: `A ${category} event for end-to-end testing.`, date: future, time: '6:00 PM', endTime: '10:00 PM',
    venue: 'Hive Arena', city: 'Bengaluru', capacity: 2000, banner: asset.mediaUrl, bannerKey: asset.key, visibility: 'Public',
    media: [{ type: 'image', url: asset.mediaUrl, key: asset.key }], minQty: 1, maxQty: 10,
    tickets: [{ name: 'General', price: 500, qty: 1500, perks: 'Entry' }], ...extra,
  } });
}

// 1-2. Organizer creates + publishes an Opportunity event
const oppRes = await createEvent('Opportunity', { opportunity: { recruitmentEnabled: true, staffPool: 1500, maxDepth: 4, maxDirectRecruits: 10, minPurchase: 1, maxPurchase: 500 } });
const E = oppRes.event;
ok('1. Organizer creates Opportunity event', E && E.isOpportunity && E.staffRecruitment);
ok('2. Publish returns Event ID + recruitment code', /^EVT-/.test(E.id) && typeof oppRes.recruitCode === 'string' && oppRes.recruitCode.length === 10);

// 3. Appears in public listing (Opportunity)
const pub = await must('GET', '/events');
ok('3. Event appears in Opportunity listing', pub.events.some((e) => e.id === E.id && e.isOpportunity));

// 4. Organizer creates primary staff X, Y, Z
const prim = {};
for (const k of ['X', 'Y', 'Z']) {
  const r = await must('POST', `/v2/creator/events/${E.id}/staff`, { token: C, body: { name: `Staff ${k}`, email: `staff.${k.toLowerCase()}.${run}@beeoak.test`, phone: '9100000000' } });
  prim[k] = { ...r.staff, email: r.login.email, password: r.login.tempPassword };
}
ok('4. Organizer creates primary staff X, Y, Z', Object.values(prim).every((s) => s.staffCode && s.password));

// 5-6. Staff login → memberships (dashboard redirect target)
const login = {};
for (const k of ['X', 'Y', 'Z']) login[k] = await must('POST', '/v2/staff/login', { body: { email: prim[k].email, password: prim[k].password } });
ok('5. Staff X, Y, Z log in', Object.values(login).every((l) => l.token && l.memberships.length === 1));
const mX = login.X.memberships[0].memberId; const mY = login.Y.memberships[0].memberId;
const dashX0 = await must('GET', `/v2/staff/m/${mX}/dashboard`, { token: login.X.token });
ok('6. Staff login resolves to Progress Dashboard data', dashX0.me.staffCode === prim.X.staffCode && dashX0.me.isPrimary);

// Allocation: 500 each (1500 total), over-allocation rejected
for (const k of ['X', 'Y', 'Z']) await must('POST', `/v2/creator/events/${E.id}/allocations`, { token: C, body: { staffId: prim[k].id, tierName: 'General', qty: 500, unitPrice: 400 } });
const over = await call('POST', `/v2/creator/events/${E.id}/allocations`, { token: C, body: { staffId: prim.X.id, tierName: 'General', qty: 501, unitPrice: 400 } });
ok('   Allocation X/Y/Z = 500 each; over-allocation rejected', over.status === 400, JSON.stringify(over.data));

// Staff X buys 100 tickets from the organizer (verified payment required)
const pX = await must('POST', `/v2/staff/m/${mX}/purchases`, { token: login.X.token, body: { tierName: 'General', qty: 100 } });
const early = await call('POST', `/v2/staff/m/${mX}/purchases/${pX.purchase.id}/confirm`, { token: login.X.token });
ok('   Purchase cannot confirm before payment is verified', early.status === 402);
await must('POST', '/v2/payments/simulate', { token: login.X.token, body: { txnid: pX.purchase.id } });
const pXc = await must('POST', `/v2/staff/m/${mX}/purchases/${pX.purchase.id}/confirm`, { token: login.X.token });
ok('   Staff X pays organizer for 100 tickets (₹40,000)', pXc.purchase.status === 'paid' && pXc.purchase.total === 40000);

// 7-8. X recruits X1, X2, X3 via referral link; X1 recruits X1A, X1B; Y → Y1, Y2; Z → Z1
const refX = dashX0.me.referralCode;
const reg = async (refCode, label) => must('POST', '/v2/staff/register', { body: { eventId: E.id, ref: refCode, name: `Staff ${label}`, email: `staff.${label.toLowerCase()}.${run}@beeoak.test`, phone: '9200000000', password: 'StaffPass@1' } });
const sub = {};
for (const k of ['X1', 'X2', 'X3']) sub[k] = await reg(refX, k);
const dashX1a = await must('GET', `/v2/staff/m/${sub.X1.membership.memberId}/dashboard`, { token: sub.X1.token });
for (const k of ['X1A', 'X1B']) sub[k] = await reg(dashX1a.me.referralCode, k);
const dashY0 = await must('GET', `/v2/staff/m/${mY}/dashboard`, { token: login.Y.token });
for (const k of ['Y1', 'Y2']) sub[k] = await reg(dashY0.me.referralCode, k);
const dashZ0 = await must('GET', `/v2/staff/m/${login.Z.memberships[0].memberId}/dashboard`, { token: login.Z.token });
sub.Z1 = await reg(dashZ0.me.referralCode, 'Z1');
ok('7. Staff X recruits X1, X2, X3 (and X1 → X1A, X1B)', ['X1', 'X2', 'X3', 'X1A', 'X1B'].every((k) => sub[k].token && sub[k].membership.staffCode));
const x1Login = await must('POST', '/v2/staff/login', { body: { email: `staff.x1.${run}@beeoak.test`, password: 'StaffPass@1' } });
ok('8. X1 receives their own Staff Login access', x1Login.memberships[0].memberId === sub.X1.membership.memberId);
const badRef = await call('POST', '/v2/staff/register', { body: { eventId: E.id, ref: 'not-a-real-code', name: 'Mallory', email: `mallory.${run}@beeoak.test`, password: 'StaffPass@1' } });
ok('   Forged referral code is rejected', badRef.status === 404);

// 9-11. Hierarchy visibility (enforced server-side)
const mX1 = sub.X1.membership.memberId;
const dashX1 = await must('GET', `/v2/staff/m/${mX1}/dashboard`, { token: sub.X1.token });
const x1SeesX = await call('GET', `/v2/staff/m/${mX1}/team/${prim.X.id}`, { token: sub.X1.token });
const x1UsesXMember = await call('GET', `/v2/staff/m/${mX}/dashboard`, { token: sub.X1.token });
ok('9. X1 cannot see X’s progress (team lookup + URL swap rejected)', x1SeesX.status === 403 && x1UsesXMember.status === 403 && dashX1.team.every((t) => t.id !== prim.X.id));
ok('   X1 sees only X1A, X1B below', dashX1.team.map((t) => t.name).sort().join() === 'Staff X1A,Staff X1B');
const dashX = await must('GET', `/v2/staff/m/${mX}/dashboard`, { token: login.X.token });
const xSeesX1 = await call('GET', `/v2/staff/m/${mX}/team/${sub.X1.membership.memberId ? (dashX.team.find((t) => t.name === 'Staff X1') || {}).id : ''}`, { token: login.X.token });
ok('10. X sees X1 progress (+ X2, X3, X1A, X1B), not Y/Z', xSeesX1.status === 200 && dashX.team.map((t) => t.name).sort().join() === 'Staff X1,Staff X1A,Staff X1B,Staff X2,Staff X3');
const ySeesX = await call('GET', `/v2/staff/m/${mY}/team/${prim.X.id}`, { token: login.Y.token });
const ySeesX1 = await call('GET', `/v2/staff/m/${mY}/team/${(dashX.team.find((t) => t.name === 'Staff X1') || {}).id}`, { token: login.Y.token });
ok('11. Y cannot see X’s hierarchy', ySeesX.status === 403 && ySeesX1.status === 403);

// 12. Organizer sees full hierarchy
const an0 = await must('GET', `/v2/creator/events/${E.id}/opportunity`, { token: C });
ok('12. Organizer sees the complete hierarchy (11 staff)', an0.staff.length === 11 && an0.totals.primaryStaff === 3);

// Downstream allocation + purchase: X → X1 (50 @ ₹450); X1 buys 20 from X
const x1Id = (dashX.team.find((t) => t.name === 'Staff X1') || {}).id;
const x1aId = (dashX.team.find((t) => t.name === 'Staff X1A') || {}).id;
await must('POST', `/v2/staff/m/${mX}/allocations`, { token: login.X.token, body: { staffId: x1Id, tierName: 'General', qty: 50, unitPrice: 450 } });
const notDirect = await call('POST', `/v2/staff/m/${mX}/allocations`, { token: login.X.token, body: { staffId: x1aId, tierName: 'General', qty: 5, unitPrice: 450 } });
ok('   X allocates to direct recruit X1; cannot allocate to X1A (not direct)', notDirect.status === 403);
const pX1 = await must('POST', `/v2/staff/m/${mX1}/purchases`, { token: sub.X1.token, body: { tierName: 'General', qty: 20 } });
await must('POST', '/v2/payments/simulate', { token: sub.X1.token, body: { txnid: pX1.purchase.id } });
await must('POST', `/v2/staff/m/${mX1}/purchases/${pX1.purchase.id}/confirm`, { token: sub.X1.token });
const tooMuch = await call('POST', `/v2/staff/m/${mX1}/purchases`, { token: sub.X1.token, body: { tierName: 'General', qty: 31 } });
ok('   X1 pays X for 20 tickets; buying beyond allocation rejected', tooMuch.status === 400);

// 13-16. Customer selects Staff X and books 3 tickets
const asha = await must('POST', '/login', { body: { email: 'asha@beeoak.test', password: 'Customer@2026' } });
const profiles = await must('GET', `/v2/events/${E.id}/staff`);
const xProfile = profiles.staff.find((s) => s.staffCode === prim.X.staffCode);
ok('   Event staff profiles list only this event’s staff, with availability', profiles.staff.length === 11 && xProfile.available === 80);
const hold = await must('POST', '/v2/bookings', { token: asha.token, body: { eventId: E.id, tierName: 'General', qty: 3, staffCode: prim.X.staffCode } });
const unpaid = await call('POST', `/v2/bookings/${hold.bookingId}/confirm`, { token: asha.token });
ok('   Unpaid booking cannot be confirmed', unpaid.status === 402);
const benL = await must('POST', '/login', { body: { email: 'ben@beeoak.test', password: 'Customer@2026' } });
const steal = await call('POST', `/v2/bookings/${hold.bookingId}/confirm`, { token: benL.token });
ok('   Another customer cannot confirm Asha’s booking', steal.status === 403);
await must('POST', '/v2/payments/simulate', { token: asha.token, body: { txnid: hold.bookingId } });
const conf = await must('POST', `/v2/bookings/${hold.bookingId}/confirm`, { token: asha.token });
const again = await must('POST', `/v2/bookings/${hold.bookingId}/confirm`, { token: asha.token });
ok('13. Customer selects Staff X and books 3 tickets (₹1,641.60 incl. fee + GST)', conf.booking.qty === 3 && conf.booking.total === 1641.6 && !!conf.booking.qrImage);
ok('    Confirming twice does not double-book', again.booking.id === conf.booking.id);
const an1 = await must('GET', `/v2/creator/events/${E.id}/opportunity`, { token: C });
const bRow = an1.bookings.find((b) => b.id === hold.bookingId);
ok('14. Booking is recorded against Staff X', bRow && bRow.staff.includes(prim.X.staffCode));
const dashX2 = await must('GET', `/v2/staff/m/${mX}/dashboard`, { token: login.X.token });
ok('15. X’s progress updates (sold 3, remaining 77)', dashX2.me.progress.sold === 3 && dashX2.me.progress.remaining === 77 && dashX2.me.progress.salesAmount === 1500);
ok('16. Organizer analytics update (sold 3, revenue ₹1,641.60)', an1.totals.sold === 3 && an1.totals.revenue === 1641.6 && an1.totals.purchased === 100);
const noStock = await call('POST', '/v2/bookings', { token: asha.token, body: { eventId: E.id, tierName: 'General', qty: 2, staffCode: prim.Y.staffCode } });
ok('    Booking via staff with no stock is refused (Y bought none)', noStock.status === 409);
const noStaff = await call('POST', '/v2/bookings', { token: asha.token, body: { eventId: E.id, tierName: 'General', qty: 2 } });
ok('    Opportunity booking without a staff member books from the organizer pool', noStaff.status === 201 && !noStaff.data.staff);

// 17-19. Normal categories: no staff features
const normal = {};
for (const cat of ['Music', 'Food', 'Free', 'College Art', 'Comedy']) normal[cat] = (await createEvent(cat)).event;
const musicOpp = await call('GET', `/v2/creator/events/${normal.Music.id}/opportunity`, { token: C });
const musicStaff = await must('GET', `/v2/events/${normal.Music.id}/staff`);
const addStaffMusic = await call('POST', `/v2/creator/events/${normal.Music.id}/staff`, { token: C, body: { name: 'Nope', email: `nope.${run}@beeoak.test` } });
ok('17. Music event works without staff features', !normal.Music.isOpportunity && musicOpp.status === 400 && musicStaff.staff.length === 0 && addStaffMusic.status === 400);
ok('18. Food, Free, College Art, Comedy created normally; Free priced ₹0', ['Food', 'Free', 'College Art', 'Comedy'].every((c) => normal[c] && !normal[c].isOpportunity) && normal.Free.tickets[0].price === 0);
const withStaff = await call('POST', '/v2/bookings', { token: benL.token, body: { eventId: normal.Music.id, tierName: 'General', qty: 2, staffCode: prim.X.staffCode } });
ok('    Normal event rejects staff attribution', withStaff.status === 400);
const mHold = await must('POST', '/v2/bookings', { token: benL.token, body: { eventId: normal.Music.id, tierName: 'General', qty: 2 } });
await must('POST', '/v2/payments/simulate', { token: benL.token, body: { txnid: mHold.bookingId } });
const mConf = await must('POST', `/v2/bookings/${mHold.bookingId}/confirm`, { token: benL.token });
const fHold = await must('POST', '/v2/bookings', { token: benL.token, body: { eventId: normal.Free.id, tierName: 'General', qty: 1 } });
const mine = await must('GET', '/bookings/mine', { token: benL.token });
ok('19. Normal customer booking works (paid Music + free registration) and shows in My Bookings',
  mConf.booking.qty === 2 && fHold.payment.mode === 'free' && fHold.booking && mine.bookings.some((b) => b.id === mHold.bookingId) && mine.bookings.some((b) => b.id === fHold.bookingId));
const tooMany = await call('POST', '/v2/bookings', { token: benL.token, body: { eventId: normal.Music.id, tierName: 'General', qty: 11 } });
ok('    Quantity above event maximum (10) is rejected', tooMany.status === 400);

// 20. Unauthorized access
const u1 = await call('GET', `/v2/staff/m/${mX}/dashboard`);
const u2 = await call('GET', `/v2/staff/m/${mX}/dashboard`, { token: asha.token });
const u3 = await call('POST', '/v2/staff/login', { body: { email: 'asha@beeoak.test', password: 'Customer@2026' } });
const u4 = await call('GET', `/v2/creator/events/${E.id}/opportunity`, { token: login.X.token });
const u5 = await call('GET', `/v2/staff/m/${mY}/dashboard`, { token: login.X.token });
const u6 = await call('POST', `/v2/creator/events/${E.id}/allocations`, { token: login.X.token, body: { staffId: prim.X.id, tierName: 'General', qty: 1000, unitPrice: 0 } });
ok('20. Unauthorized API access is rejected', u1.status === 401 && u2.status === 401 && u3.status === 403 && u4.status === 401 && u5.status === 403 && u6.status === 401,
  [u1, u2, u3, u4, u5, u6].map((x) => x.status).join(','));

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
fs.writeFileSync(new URL('./.last-api-run.json', import.meta.url), JSON.stringify({ eventId: E.id, run, staff: { X: prim.X, Y: prim.Y }, x1: { email: `staff.x1.${run}@beeoak.test`, password: 'StaffPass@1' }, recruitCode: oppRes.recruitCode }, null, 2));
process.exit(failed ? 1 : 0);
