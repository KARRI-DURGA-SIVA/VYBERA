# BEE-OAK Web

Desktop-first website for BEE-OAK, kept separate from the mobile app in `../VYBERA` (nothing there is changed).

## Run
```bash
npm install
npm run dev          # http://localhost:5174
npm run test:e2e     # drives Chrome through every page + full booking flow (dev server must be running)
```

## Data
- **Events** are always read live from `VITE_API_BASE` (default `https://vybera.onrender.com`).
- **`VITE_WRITE_MODE`** in `.env.local`:
  - `sandbox` (default): sign-up, OTP (code `123456`), bookings and payments are simulated in the browser.
    The production database is not written to. Existing app accounts can still sign in against the real API.
  - `live`: sign-up/OTP/bookings call the real API and paid checkout redirects to PayU.

Fees mirror the app: 8% convenience fee and 18% GST on that fee, with up to 4 tickets per booking.

## Creator mode (`/creator`)
Reached from Profile & settings → Creator mode, or the account menu. Mirrors the app's creator screens:
apply with KYC, creator sign-in, dashboard, my events, 6-step create event, revenue (4-digit finance PIN),
QR scanner (camera via BarcodeDetector, image upload or pasted code) and staff management.

In `sandbox` mode, real creator accounts can sign in and their events/analytics/staff are **read** from the API,
but publishing, banner upload, staff creation, the finance PIN and check-ins are simulated in the browser.
Sandbox applications are approved instantly; sandbox events show on the public site and can be booked and scanned.
In `live` mode these call `/creator/applications`, `/creator/events/banner`, `/creator/events`, `/creator/staff`,
`/creator/finance/unlock` and `/bookings/scan`.

## Opportunity events, staff hierarchy & verified bookings (v2)
Backend lives in `../VYBERA/opportunity.js` (mounted by `server.js`, additive: new `opp_*` tables, new columns, `/v2/*` routes).
Existing endpoints used by the mobile app are unchanged.

Run everything locally (real server + local Postgres, production untouched):
```bash
npm run api:local      # terminal 1 — server on :3010 using DB beeoak_local, payment simulator on
npm run seed:local     # once — organizer + customer test accounts
npm run dev            # terminal 2 — website on :5174 (/api is proxied to :3010)
npm run test:api       # 35 backend checks (all 20 scenarios)
npm run test:v2        # browser E2E: organizer → staff → recruit → customer booking
```
Test logins: `organizer@beeoak.test / Organizer@2026` (Creator mode), `asha@beeoak.test / Customer@2026` (customer).

To point the site at production instead, set `API_PROXY_TARGET=https://vybera.onrender.com` in `.env.local`
(only after `opportunity.js` + the `server.js` changes are deployed there).
