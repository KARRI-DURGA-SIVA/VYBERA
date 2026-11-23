// Browser E2E for the Opportunity workflow on the real (local) backend.
// node e2e/v2-flow.mjs http://localhost:5174 <shotsDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const SHOTS = process.argv[3] || 'e2e/shots-v2';
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const problems = [];
const results = [];
let n = 0;

async function ctx() {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 12.9784, longitude: 77.6408 }, permissions: ['geolocation'] });
  await c.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ address: { suburb: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka' } }) }));
  const p = await c.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()} @ ${p.url()}`); });
  return p;
}
async function step(name, page, fn) {
  const t = Date.now();
  try { await fn(); results.push(`PASS  ${name} (${Date.now() - t}ms)`); }
  catch (e) { results.push(`FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const shot = (page, name, full = false) => page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const see = (page, text, timeout = 20000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
const run = Date.now().toString(36).slice(-5);
const evName = `Hive Opportunity Summit ${run}`;
const future = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);

const org = await ctx();
let eventId = '';
let xEmail = `x.${run}@beeoak.test`, xPw = '';
let customerLinkUrl = '', recruitUrl = '';

await step('Organizer: creator login → dashboard', org, async () => {
  await org.goto(BASE + '/creator');
  await org.locator('#c-email').fill('organizer@beeoak.test');
  await org.locator('#c-pw').fill('Organizer@2026');
  await org.getByRole('button', { name: /Sign in as creator/ }).click();
  await see(org, 'Hello, Hive');
});

await step('Organizer: create Opportunity event (category → staff step) + publish', org, async () => {
  await org.goto(BASE + '/creator/create');
  await org.getByRole('button', { name: /Continue/ }).click();
  await see(org, 'Choose a category to continue');
  await shot(org, 'create-category');
  await org.locator('.cat-card', { hasText: 'Opportunity' }).click();
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.getByTestId('banner-input').setInputFiles('public/logo.png');
  await org.getByTestId('media-input').setInputFiles('public/logo.png');
  await see(org, 'logo.png');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('#e-name').fill(evName);
  await org.locator('#e-date').fill(future);
  await org.locator('#e-desc').fill('Meet founders, recruiters and mentors. Tickets are sold by our staff team.');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('#e-venue').fill('Hive Convention Centre');
  await org.locator('#e-city').fill('Bengaluru');
  await org.locator('#e-cap').fill('2000');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('#e-max').fill('8');
  await org.getByRole('button', { name: /Continue/ }).click();
  await see(org, 'Enable staff recruitment');
  await org.locator('#o-maxDepth').fill('4');
  await shot(org, 'create-staff-step');
  await org.getByRole('button', { name: /Continue/ }).click();
  await see(org, 'How buyers will see your event');
  await org.getByRole('button', { name: /Set visibility/ }).click();
  await org.getByRole('button', { name: /Publish event live/ }).click();
  await org.waitForURL('**/creator/opportunity/**', { timeout: 30000 });
  eventId = decodeURIComponent(org.url().split('/creator/opportunity/')[1]);
  await see(org, 'Staff recruitment link');
  recruitUrl = await org.locator('.share-url').first().innerText();
});

await step('Organizer: add primary staff X + Y, allocate tickets', org, async () => {
  for (const [nm, em] of [['Xavier Staff', xEmail], ['Yamini Staff', `y.${run}@beeoak.test`]]) {
    await org.getByRole('button', { name: '+ Add primary staff' }).click();
    await org.locator('#ps-name').fill(nm);
    await org.locator('#ps-email').fill(em);
    await org.getByRole('button', { name: 'Add staff', exact: true }).click();
    await org.getByTestId('temp-password').waitFor();
    if (em === xEmail) xPw = await org.getByTestId('temp-password').innerText();
    await org.getByRole('button', { name: 'Done' }).click();
  }
  await org.locator('.tt-row', { hasText: 'Xavier Staff' }).getByRole('button', { name: 'Allocate' }).click();
  await org.locator('#oa-tier').selectOption('General Admission');
  await org.locator('#oa-qty').fill('100');
  await org.locator('#oa-price').fill('400');
  await org.getByRole('button', { name: 'Save allocation' }).click();
  await see(org, 'Allocated 100 General Admission tickets');
  await org.waitForTimeout(500);
  await shot(org, 'organizer-manage');
});

const sx = await ctx();
await step('Staff X: Staff Login → auto-redirect to Progress Dashboard', sx, async () => {
  await sx.goto(BASE + '/login?as=staff');
  await sx.locator('#l-id').fill(xEmail);
  await sx.locator('#l-pw').fill(xPw);
  await sx.getByRole('button', { name: /Sign in to staff dashboard/ }).click();
  await sx.waitForURL('**/staff/m/**');
  await see(sx, 'Staff progress');
  await see(sx, 'Below-staff progress');
});

await step('Staff X: buy 50 tickets from organizer (verified payment)', sx, async () => {
  await sx.getByLabel('Quantity to buy').fill('50');
  await sx.getByRole('button', { name: 'Buy & pay' }).click();
  await sx.getByRole('dialog', { name: 'Test payment' }).waitFor();
  await sx.getByRole('button', { name: /^Pay / }).click();
  await see(sx, 'Payment verified');
  await see(sx, '50 available to sell');
  customerLinkUrl = await sx.locator('.share-url').first().innerText();
  recruitUrl = await sx.locator('.share-url').nth(1).innerText();
  await sx.waitForTimeout(600);
  await shot(sx, 'staff-x-dashboard', true);
});

const s1 = await ctx();
let x1Member = '';
await step('X1 registers via X’s recruitment link → own dashboard', s1, async () => {
  await s1.goto(recruitUrl);
  await see(s1, 'You’re joining under');
  await s1.locator('#j-name').fill('Ishaan X1');
  await s1.locator('#j-email').fill(`x1.${run}@beeoak.test`);
  await s1.locator('#j-phone').fill('9300000001');
  await s1.locator('#j-pw').fill('StaffPass@1');
  await shot(s1, 'staff-join');
  await s1.getByRole('button', { name: /Register & open my dashboard/ }).click();
  await s1.waitForURL('**/staff/m/**');
  x1Member = s1.url().split('/staff/m/')[1];
  await see(s1, 'Parent');
  const txt = await s1.locator('.staff-ids').innerText();
  if (!/BO-/.test(txt)) throw new Error('parent staff id missing');
});

await step('Hierarchy: X1 cannot open X’s dashboard by URL; X sees X1', s1, async () => {
  const xMember = sx.url().split('/staff/m/')[1];
  await s1.goto(`${BASE}/staff/m/${xMember}`);
  await see(s1, 'have access to this staff membership');
  await sx.reload();
  await sx.locator('.tt-row', { hasText: 'Ishaan X1' }).waitFor();
  await sx.locator('.tt-row', { hasText: 'Ishaan X1' }).getByRole('button', { name: 'Allocate' }).click();
  await sx.locator('#al-qty').fill('20');
  await sx.locator('#al-price').fill('450');
  await sx.getByRole('button', { name: 'Save allocation' }).click();
  await see(sx, 'Allocated 20 tickets to Ishaan X1');
});

const cu = await ctx();
await step('Customer: login → referral link → staff profiles → book via X', cu, async () => {
  await cu.goto(BASE + '/login');
  await cu.locator('#l-id').fill('asha@beeoak.test');
  await cu.locator('#l-pw').fill('Customer@2026');
  await cu.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await cu.waitForURL('**/dashboard');
  await cu.goto(customerLinkUrl);
  await see(cu, 'Book through a staff member');
  await cu.locator('.sp-card.on', { hasText: 'Xavier Staff' }).waitFor();
  await cu.waitForTimeout(500);
  await shot(cu, 'event-staff-profiles');
  await cu.locator('.sp-card', { hasText: 'Xavier Staff' }).click();
  await cu.waitForURL('**/book?staff=**');
  await cu.getByLabel('Ticket quantity').selectOption('3');
  await see(cu, 'Booking through');
  await shot(cu, 'booking-with-staff');
  await cu.getByRole('button', { name: /Proceed to checkout/ }).click();
  await cu.waitForURL('**/checkout');
  await cu.locator('#b-phone').fill('9876543210');
  await cu.getByRole('button', { name: /^Pay / }).click();
  await cu.getByRole('dialog', { name: 'Test payment' }).waitFor();
  await shot(cu, 'test-payment');
  await cu.getByRole('button', { name: /^Pay / }).last().click();
  await cu.waitForURL('**/confirmation/**');
  await see(cu, 'You’re going!');
  await cu.locator('.ticket-stub img').waitFor();
});

await step('Staff X progress + organizer analytics update', sx, async () => {
  await sx.reload();
  await sx.locator('.kpi', { hasText: 'Sold' }).locator('b', { hasText: '3' }).waitFor();
  await see(sx, 'Asha Rao · General Admission × 3');
  await org.reload();
  await org.locator('.kpi', { hasText: 'Sold to customers' }).locator('b', { hasText: '3' }).waitFor();
  await org.getByRole('button', { name: /Bookings \(1\)/ }).click();
  await see(org, 'via Xavier Staff');
  await org.getByRole('button', { name: 'Hierarchy' }).click();
  await org.locator('.tree-node', { hasText: 'Ishaan X1' }).waitFor();
  await shot(org, 'organizer-hierarchy');
});

await step('Customer cannot use Staff Login', cu, async () => {
  await cu.goto(BASE + '/login?as=staff');
  await cu.locator('#l-id').fill('asha@beeoak.test');
  await cu.locator('#l-pw').fill('Customer@2026');
  await cu.getByRole('button', { name: /Sign in to staff dashboard/ }).click();
  await see(cu, 'No active staff membership');
  await shot(cu, 'staff-login-denied');
});

await step('Normal events: no staff section; free registration works', cu, async () => {
  const evs = await (await fetch(BASE + '/api/events')).json();
  const music = evs.events.find((e) => e.category === 'Music');
  const free = evs.events.find((e) => e.category === 'Free');
  await cu.goto(`${BASE}/event/${encodeURIComponent(music.id)}`);
  await see(cu, 'About the event');
  if (await cu.locator('#staff-profiles').count()) throw new Error('staff section shown on Music event');
  await cu.goto(`${BASE}/event/${encodeURIComponent(free.id)}/book`);
  await cu.getByRole('button', { name: /Proceed to checkout/ }).click();
  await cu.waitForURL('**/checkout');
  await cu.getByRole('button', { name: 'Confirm free booking' }).click();
  await cu.waitForURL('**/confirmation/**');
  await see(cu, 'You’re going!');
});

await step('Header categories + Opportunity listing', cu, async () => {
  await cu.goto(BASE + '/');
  const nav = await cu.locator('.hdr-nav').innerText();
  for (const l of ['All', 'Opportunity', 'Music', 'Food', 'Free', 'College Art', 'Comedy']) if (!nav.includes(l)) throw new Error('missing ' + l);
  await cu.locator('.hdr-nav .cat-link', { hasText: 'Opportunity' }).click();
  await cu.waitForURL('**/opportunities');
  await cu.locator('.grid .ecard', { hasText: evName }).waitFor();
  await shot(cu, 'opportunity-listing');
});

await browser.close();
console.log(results.join('\n'));
const uniq = [...new Set(problems)];
console.log(uniq.length ? `\n${uniq.length} browser problem(s):\n${uniq.join('\n')}` : '\nNo console errors or page errors.');
process.exit(results.some((r) => r.startsWith('FAIL')) || uniq.length ? 1 : 0);
