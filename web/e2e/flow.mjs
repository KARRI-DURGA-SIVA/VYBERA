// End-to-end check of every page and the full booking flow (sandbox mode).
// Usage: node e2e/flow.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const SHOTS = process.argv[3] || 'e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
// Simulate a visitor in Bengaluru (Indiranagar) who allows location access.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, geolocation: { latitude: 12.9784, longitude: 77.6408 }, permissions: ['geolocation'] });
// Don't load OpenStreetMap's free geocoder from automated runs: answer with a fixed place.
await ctx.route('https://nominatim.openstreetmap.org/**', (route) => {
  const url = route.request().url();
  const body = url.includes('/reverse')
    ? { display_name: 'Indiranagar, Bengaluru', address: { suburb: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka' } }
    : [{ lat: '17.4065', lon: '78.4772', name: 'Ameerpet', display_name: 'Ameerpet, Hyderabad, Telangana, India', address: { suburb: 'Ameerpet', city: 'Hyderabad', state: 'Telangana' } }];
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()} @ ${page.url()}`); });
page.on('requestfailed', (r) => { if (!r.url().includes('r2.cloudflarestorage')) problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });

let n = 0;
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(`PASS  ${name} (${Date.now() - t}ms)`); }
  catch (e) { results.push(`FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/\W+/g, '_')}.png` }); }
}
const shot = async (name, full = false) => page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const expectText = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 20000 });

await step('Home loads with live events', async () => {
  await page.goto(BASE + '/');
  await page.locator('.ecard').first().waitFor({ timeout: 60000 });
  await expectText('Recommended for you');
  await page.waitForTimeout(800);
  await shot('home');
  await shot('home-full', true);
});

await step('Location auto-detected on load', async () => {
  await page.locator('.loc-text b').filter({ hasText: /Indiranagar, Bengaluru/ }).waitFor({ timeout: 20000 });
  await expectText('Events near');
  await page.locator('.ecard-dist').first().waitFor();
});

await step('Header is a category bar with icons', async () => {
  const nav = await page.locator('.hdr-nav').innerText();
  if (/About|Help|Contact|Explore|Dashboard|Opportunities/.test(nav)) throw new Error('nav still has old links: ' + nav);
  for (const l of ['All', 'Opportunity', 'Music', 'Food', 'Free', 'College Art', 'Comedy']) if (!nav.includes(l)) throw new Error('missing ' + l);
  if ((await page.locator('.hdr-nav .cat-link svg').count()) !== 7) throw new Error('icons missing');
  await page.locator('.hdr-nav .cat-link', { hasText: 'Music' }).click();
  await page.waitForURL('**/explore?cat=Music');
  await page.locator('.grid .ecard').first().waitFor();
  if (await page.locator('.cat-link.active').innerText() !== 'Music') throw new Error('Music not active');
  await page.locator('.hdr-nav .cat-link', { hasText: 'All' }).click();
  await page.waitForURL(/\/explore$/);
  if ((await page.locator('.grid .ecard').count()) < 6) throw new Error('All did not show every event');
  await page.locator('.hdr-nav .cat-link', { hasText: 'Comedy' }).click();
  await expectText('No events match');
  await page.locator('.hdr-nav').screenshot({ path: `${SHOTS}/00-nav.png` });
  await page.goto(BASE + '/');
  await page.locator('.ecard').first().waitFor();
});

await step('Ticket hero rail navigates', async () => {
  const first = await page.locator('.tk-title').innerText();
  await page.getByRole('button', { name: 'Next event' }).click();
  await page.waitForTimeout(700);
  const second = await page.locator('.tk-title').innerText();
  if (first === second) throw new Error('hero did not advance');
  await page.getByRole('button', { name: 'Previous event' }).click();
  await page.waitForTimeout(900);
  await shot('hero-ticket');
});

await step('Location picker: switch city', async () => {
  await page.locator('.loc-chip').click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  await shot('location-picker');
  await page.getByLabel('Search location').fill('Ameerpet');
  await page.locator('.loc-row', { hasText: 'Ameerpet' }).waitFor();
  await page.getByLabel('Search location').fill('');
  if (await page.getByText('All cities').count()) throw new Error('A–Z section still present');
  if ((await page.locator('.lm-tile .landmark').count()) !== 18) throw new Error('landmark tiles missing');
  await page.locator('.lm-tile', { hasText: 'Hyderabad' }).hover();
  await page.waitForTimeout(500);
  await shot('location-picker-hover');
  await page.locator('.lm-tile', { hasText: 'Hyderabad' }).click();
  await expectText('No events within 80 km of Hyderabad');
  await shot('home-hyderabad');
  await page.locator('.loc-chip').click();
  await page.getByRole('button', { name: /Detect my location/ }).click();
  await page.locator('.loc-text b').filter({ hasText: /Bengaluru|Bangalore/ }).waitFor({ timeout: 20000 });
});

await step('Opportunities section + page', async () => {
  await page.locator('.opp').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.locator('.opp').screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-opportunity-section.png` });
  await page.getByRole('link', { name: 'Explore opportunities' }).click();
  await page.waitForURL('**/opportunities');
  await expectText('Events that open');
  await page.getByRole('button', { name: /Opportunity events/ }).click();
  await expectText('right now');
  await shot('opportunities');
});

await step('Header search suggests events', async () => {
  await page.locator('.hdr .search input').fill('rock');
  await page.locator('.search-item').first().waitFor();
  // The dropdown must cover the category bar underneath it.
  const covered = await page.evaluate(() => {
    const r = document.querySelector('.search-pop').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + 120, r.top + 40);
    return !!el.closest('.search-pop');
  });
  if (!covered) throw new Error('category bar shows through the search dropdown');
  await shot('search');
  await page.keyboard.press('Escape');
  await page.locator('.hdr .search input').fill('');
});

await step('Explore filters', async () => {
  await page.goto(BASE + '/explore');
  await page.locator('.grid .ecard').first().waitFor();
  const all = await page.locator('.grid .ecard').count();
  await page.getByRole('button', { name: 'Free', exact: true }).click();
  await page.waitForTimeout(200);
  const free = await page.locator('.grid .ecard').count();
  if (!(free > 0 && free <= all)) throw new Error(`free filter ${free}/${all}`);
  await page.getByRole('button', { name: /Clear all/ }).click();
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await page.waitForTimeout(200);
  await shot('explore-music');
  await page.goto(BASE + '/explore?q=zzzznomatch');
  await expectText('No events match');
  await page.goto(BASE + '/explore');
  await page.locator('.grid .ecard').first().waitFor();
  await page.getByRole('button', { name: /^Near / }).click();
  await page.waitForTimeout(200);
  if (!(await page.locator('.grid .ecard').count())) throw new Error('near filter empty for Bengaluru');
  await page.getByRole('button', { name: /^Near / }).click();
  await shot('explore');
});

await step('Protected route redirects to login', async () => {
  await page.goto(BASE + '/dashboard');
  await page.waitForURL('**/login');
  await shot('login');
});

await step('Login validation error', async () => {
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expectText('Email or phone and password are required');
});

await step('Forgot password (sandbox)', async () => {
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('#l-id').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expectText('reset link has been sent');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
});

const email = `web.tester.${Date.now()}@example.com`;
await step('Registration with validation + OTP', async () => {
  await page.goto(BASE + '/register');
  if (await page.locator('.auth-stats').count()) throw new Error('stats still on auth page');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectText('Enter your first name');
  await page.locator('#r-firstName').fill('Asha');
  await page.locator('#r-lastName').fill('Rao');
  await page.locator('#r-email').fill(email);
  await page.locator('#r-phone').fill('9876543210');
  await page.locator('#r-city').fill('Bengaluru');
  await page.locator('#r-password').fill('Bee0ak2026');
  await page.locator('#r-confirm').fill('Bee0ak2026');
  await shot('register');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#r-otp').waitFor();
  await page.locator('#r-otp').fill('111111');
  await page.getByRole('button', { name: /Verify/ }).click();
  await expectText('Incorrect OTP');
  await page.locator('#r-otp').fill('123456');
  await shot('register-otp');
  await page.getByRole('button', { name: /Verify/ }).click();
  await page.waitForURL('**/dashboard');
  await expectText('Hi, Asha');
});

await step('Dashboard (empty state)', async () => {
  await expectText('No upcoming events');
  await page.waitForTimeout(500);
  await shot('dashboard-empty');
});

let paidId = '';
await step('Details page for a paid event', async () => {
  const events = await page.evaluate(async () => (await (await fetch('https://vybera.onrender.com/events')).json()).events);
  const paid = events.find((e) => e.tickets.some((t) => Number(t.price) > 0));
  paidId = paid.id;
  await page.goto(BASE + '/event/' + encodeURIComponent(paid.id));
  await expectText('About the event');
  await page.waitForTimeout(600);
  await shot('details');
  await shot('details-full', true);
});

await step('Booking: tier + quantity', async () => {
  await page.getByRole('button', { name: 'Book tickets' }).click();
  await page.waitForURL('**/book');
  const tiers = page.locator('button.tier');
  await tiers.nth((await tiers.count()) - 1).click();
  await page.getByLabel('Ticket quantity').selectOption('2');
  await expectText('× 2');
  await shot('booking');
  await page.getByRole('button', { name: /Proceed to checkout/ }).click();
  await page.waitForURL('**/checkout');
});

await step('Checkout validation + payment', async () => {
  await page.locator('#b-phone').fill('123');
  await page.getByRole('button', { name: /^Pay / }).click();
  await expectText('valid 10-digit');
  await page.locator('#b-phone').fill('9876543210');
  await page.getByRole('button', { name: /Credit \/ Debit card/ }).click();
  await shot('checkout');
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.waitForURL('**/confirmation/**', { timeout: 20000 });
  await expectText('You’re going!');
  await page.locator('.ticket-stub img').waitFor();
  await page.waitForTimeout(900);
  await shot('confirmation');
});

await step('Free event booking', async () => {
  const events = await page.evaluate(async () => (await (await fetch('https://vybera.onrender.com/events')).json()).events);
  const free = events.find((e) => e.tickets.every((t) => Number(t.price) === 0));
  await page.goto(BASE + '/event/' + encodeURIComponent(free.id) + '/book');
  await page.getByRole('button', { name: /Proceed to checkout/ }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('button', { name: 'Confirm free booking' }).click();
  await page.waitForURL('**/confirmation/**');
  await expectText('You’re going!');
});

await step('My bookings lists both + tabs', async () => {
  await page.goto(BASE + '/bookings');
  await page.locator('.bk').first().waitFor();
  const total = await page.locator('.bk').count();
  await page.getByRole('tab', { name: /Past/ }).click();
  await page.waitForTimeout(200);
  const past = await page.locator('.bk').count();
  await page.getByRole('tab', { name: /Upcoming/ }).click();
  await page.waitForTimeout(200);
  if (total + past < 2) throw new Error(`expected 2 bookings, upcoming=${total} past=${past}`);
  await shot('bookings');
});

await step('Booking detail (ticket)', async () => {
  const tab = (await page.locator('.bk').count()) ? 'Upcoming' : 'Past';
  if (tab === 'Past') await page.getByRole('tab', { name: /Past/ }).click();
  await page.locator('.bk').first().click();
  await page.waitForURL('**/bookings/BLT-**');
  await page.locator('.ticket-stub img').waitFor();
  await shot('ticket');
  // Reload works without router state
  await page.reload();
  await page.locator('.ticket-stub img').waitFor();
});

await step('Dashboard with stats', async () => {
  await page.goto(BASE + '/dashboard');
  await expectText('Total bookings');
  const v = await page.locator('.kpi b').first().textContent();
  if (Number(v) < 2) throw new Error('kpi total ' + v);
  await page.waitForTimeout(600);
  await shot('dashboard');
});

await step('Profile edit + prefs', async () => {
  await page.goto(BASE + '/profile');
  await page.locator('#p-fn').fill('Ashwini');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expectText('Profile updated');
  await expectText('Hi, Ashwini');
  await shot('profile');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await page.getByRole('button', { name: 'Offers & new events' }).click();
});

await step('About / Contact / Help', async () => {
  await page.goto(BASE + '/about'); await expectText('What we stand for'); await page.waitForTimeout(400); await shot('about');
  await page.goto(BASE + '/contact'); await page.getByRole('button', { name: /Send message/ }).click(); await expectText('Tell us a little more'); await shot('contact');
  await page.goto(BASE + '/help'); await page.getByRole('button', { name: /Payments/ }).click(); await page.getByRole('button', { name: 'What fees will I pay?' }).click(); await page.waitForTimeout(400); await shot('help');
  await page.locator('input[aria-label="Search help"]').fill('QR'); await expectText('Where is my ticket?');
});

await step('Logout then login again', async () => {
  await page.locator('.user-chip').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(BASE + '/');
  await page.goto(BASE + '/login');
  await page.locator('#l-id').fill(email);
  await page.locator('#l-pw').fill('wrong-pass1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expectText('Invalid password');
  await page.locator('#l-pw').fill('Bee0ak2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await page.waitForURL('**/dashboard');
  await expectText('Ashwini');
});


const cEmail = `creator.${Date.now()}@example.com`;
const evName = `Sandbox Jazz Night ${Date.now() % 10000}`;
await step('Creator: switch from profile + apply with KYC', async () => {
  await page.goto(BASE + '/profile?tab=creator');
  await page.getByRole('link', { name: /Switch to creator mode/ }).click();
  await page.waitForURL('**/creator');
  await page.getByRole('tab', { name: 'Apply for access' }).click();
  await page.locator('#a-name').fill('Hive Live Productions');
  await page.locator('#a-email').fill(cEmail);
  await page.locator('#a-phone').fill('9876501234');
  await page.locator('#a-about').fill('Live jazz and indie nights across Bengaluru.');
  await page.locator('#a-pw').fill('Creator2026');
  await page.locator('.kyc input').first().setInputFiles('public/logo.png');
  await expectText('logo.png');
  await shot('creator-apply');
  await page.getByRole('button', { name: /Submit application/ }).click();
  await expectText('You’re a creator!');
  await page.getByRole('button', { name: 'Go to creator sign in' }).click();
});

await step('Creator: sign in + finance PIN', async () => {
  await page.locator('#c-email').fill(cEmail);
  await page.locator('#c-pw').fill('wrongpass1');
  await page.getByRole('button', { name: /Sign in as creator/ }).click();
  await expectText('Invalid creator email or password');
  await page.locator('#c-pw').fill('Creator2026');
  await page.getByRole('button', { name: /Sign in as creator/ }).click();
  await expectText('Hello, Hive');
  await expectText('Revenue & finance are locked');
  for (const [i, d] of ['1', '2', '3', '4'].entries()) await page.getByLabel(`PIN digit ${i + 1}`).fill(d);
  await expectText('Gross revenue');
  await shot('creator-dashboard');
});

await step('Creator: create event (6 steps) + publish', async () => {
  await page.getByRole('link', { name: 'Create event' }).first().click();
  await page.waitForURL('**/creator/create');
  await page.locator('.cat-card', { hasText: 'Music' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expectText('Upload a banner to continue');
  await page.getByTestId('banner-input').setInputFiles('public/logo.png');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('#e-name').fill(evName);
  const d = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  await page.locator('#e-date').fill(d);
  await page.locator('#e-desc').fill('An evening of live jazz under the stars.');
  await shot('creator-create-details');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('#e-venue').fill('Hive Amphitheatre');
  await page.locator('#e-city').fill('Bengaluru');
  await page.locator('#e-cap').fill('400');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'General + VIP' }).click();
  await shot('creator-create-tickets');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expectText('How buyers will see your event');
  await shot('creator-create-preview');
  await page.getByRole('button', { name: /Set visibility/ }).click();
  await page.getByRole('button', { name: /Publish event live/ }).click();
  await page.waitForURL('**/creator/events');
  await expectText(evName);
  await shot('creator-events');
});

let ticketCode = '';
await step('Creator event is bookable on the public site', async () => {
  await page.goto(BASE + '/explore?q=' + encodeURIComponent(evName));
  await page.locator('.grid .ecard').first().click();
  await expectText('About the event');
  await page.getByRole('button', { name: 'Book tickets' }).click();
  await page.getByRole('button', { name: /Proceed to checkout/ }).click();
  await page.waitForURL('**/checkout');
  await page.locator('#b-phone').fill('9876543210');
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.waitForURL('**/confirmation/**', { timeout: 20000 });
  ticketCode = await page.evaluate((n) => JSON.parse(localStorage.getItem('beeoak.web.sandbox.bookings')).find((b) => b.eventName === n).qrPayload, evName);
});

await step('Creator: scanner validates, flags duplicate + invalid', async () => {
  await page.goto(BASE + '/creator/scanner');
  await page.getByLabel('Ticket code').fill(ticketCode);
  await page.getByRole('button', { name: 'Validate' }).click();
  await expectText('Valid — let them in');
  await shot('creator-scanner');
  await page.getByLabel('Ticket code').fill(ticketCode);
  await page.getByRole('button', { name: 'Validate' }).click();
  await expectText('Already checked in');
  await page.getByLabel('Ticket code').fill('not-a-ticket');
  await page.getByRole('button', { name: 'Validate' }).click();
  await expectText('Not a BEE-OAK ticket QR');
});

await step('Creator: revenue reflects the sale', async () => {
  await page.goto(BASE + '/creator/revenue');
  await expectText('Revenue by event');
  const gross = await page.locator('.kpi b').first().innerText();
  if (gross === '₹0') throw new Error('gross revenue still zero');
  await page.waitForTimeout(800);
  await shot('creator-revenue');
});

await step('Creator: add staff', async () => {
  await page.goto(BASE + '/creator/staff');
  await page.getByRole('button', { name: '+ Add staff' }).click();
  await page.locator('#s-name').fill('Ravi Kumar');
  await page.locator('#s-gate').selectOption('Gate A');
  await page.locator('#s-ev').selectOption({ label: evName });
  await page.locator('#s-tier').selectOption('General Admission');
  await page.locator('#s-qty').fill('25');
  await shot('creator-add-staff');
  await page.getByRole('button', { name: 'Add staff member' }).last().click();
  await expectText('@ravi.kumar');
  await shot('creator-staff');
});

await step('Creator: exit creator mode', async () => {
  await page.locator('.cr-top .user-chip').click();
  await page.getByRole('button', { name: /Exit creator mode/ }).click();
  await page.waitForURL('**/profile?tab=creator');
  await expectText('Host events on BEE-OAK');
});

await step('Unknown event + 404', async () => {
  await page.goto(BASE + '/event/does-not-exist'); await expectText('Event not found');
  await page.goto(BASE + '/nope'); await expectText('Page not found');
});

await step('Responsive: tablet + phone, no horizontal scroll', async () => {
  for (const [w, h, name] of [[900, 1000, 'tablet'], [390, 844, 'phone']]) {
    await page.setViewportSize({ width: w, height: h });
    for (const p of ['/creator', '/', '/explore', '/opportunities', '/event/' + encodeURIComponent(paidId), '/bookings', '/dashboard']) {
      await page.goto(BASE + p);
      await page.waitForTimeout(700);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`${name} ${p} overflows by ${over}px`);
    }
    await page.goto(BASE + '/'); await page.locator('.ecard').first().waitFor(); await page.waitForTimeout(600);
    await shot(`home-${name}`, true);
  }
});

await browser.close();
console.log(results.join('\n'));
const uniq = [...new Set(problems)];
console.log(uniq.length ? `\n${uniq.length} browser problem(s):\n` + uniq.join('\n') : '\nNo console errors, page errors or failed requests.');
process.exit(results.some((r) => r.startsWith('FAIL')) || uniq.length ? 1 : 0);
