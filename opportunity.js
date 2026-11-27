// BEE-OAK v2: Opportunity events (staff hierarchy, allocations, staff purchases, staff-attributed
// customer bookings) plus payment-verified booking confirmation for all events.
// Additive only: new tables/columns and /v2 routes. Existing endpoints keep working unchanged.

const OPP_RE = /opportunit/i;
const FEE_RATE = 8;
const GST_RATE = 18;
const HOLD_MINUTES = 15;
const PURCHASE_MINUTES = 30;

module.exports = function opportunity(app, deps) {
  const {
    pool, bcrypt, crypto, signJwt, verifyJwt, ticketResponse, isEventBookable, isUserActive,
    payuConfig, makePayuHash, formatPayuAmount, cleanPayuText, savePaymentTransaction, saveAsset,
  } = deps;

  const rid = (p) => `${p}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const code = (n, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") =>
    Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  const isOpp = (ev) => OPP_RE.test(String(ev && ev.category));
  const isFreeCat = (cat) => /^free$/i.test(String(cat || "").trim());
  const settingsOf = (ev) => ({
    recruitmentEnabled: true, staffPool: 0, maxDepth: 4, maxDirectRecruits: 25,
    minPurchase: 1, maxPurchase: 500, commissionRate: 0,
    ...(ev && ev.opp_settings ? ev.opp_settings : {}),
  });
  const money = (n) => Math.round(Number(n || 0) * 100) / 100;
  const totals = (price, qty) => {
    const subtotal = money(Number(price || 0) * qty);
    const fee = subtotal > 0 ? money(subtotal * FEE_RATE / 100) : 0;
    const gst = fee > 0 ? money(fee * GST_RATE / 100) : 0;
    return { subtotal, fee, gst, total: money(subtotal + fee + gst) };
  };
  const audit = (client, actor, action, entity, entityId, data) =>
    client.query("INSERT INTO opp_audit (actor, action, entity, entity_id, data) VALUES ($1,$2,$3,$4,$5)",
      [actor, action, entity, entityId, JSON.stringify(data || {})]);
  const bearer = (req) => { const a = req.headers.authorization || ""; return a.startsWith("Bearer ") ? a.slice(7) : ""; };
  const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (err) {
      if (err.status) return fail(res, err.status, err.message);
      console.error(`[v2] ${req.method} ${req.path} failed:`, err);
      fail(res, 500, err.message || "Request failed");
    }
  };
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  const tx = async (fn) => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const r = await fn(client); await client.query("COMMIT"); return r; }
    catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
    finally { client.release(); }
  };

  /* ------------------------------------------------------------------ schema */
  async function initDb() {
    // Organizer subscriptions + auditable credit ledger (1 credit = 1 digital ticket issued).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_subscriptions (
        id TEXT PRIMARY KEY,
        organizer_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly','yearly')),
        price NUMERIC(12,2) NOT NULL,
        monthly_credits INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
        payment_txnid TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), activated_at TIMESTAMPTZ)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS org_subscriptions_org ON org_subscriptions (organizer_id, status)`);
    await pool.query(`ALTER TABLE org_subscriptions DROP CONSTRAINT IF EXISTS org_subscriptions_billing_period_check`);
    await pool.query(`ALTER TABLE org_subscriptions ADD CONSTRAINT org_subscriptions_billing_period_check CHECK (billing_period IN ('monthly','yearly','trial'))`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_credit_ledger (
        id BIGSERIAL PRIMARY KEY,
        organizer_id INTEGER NOT NULL,
        subscription_id TEXT,
        plan_id TEXT, billing_period TEXT,
        credit_type TEXT NOT NULL DEFAULT 'subscription',
        credits INTEGER NOT NULL,
        reason TEXT NOT NULL,
        period_index INTEGER,
        ticket_id TEXT, event_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS org_credit_alloc_once ON org_credit_ledger (subscription_id, period_index) WHERE reason = 'monthly_allocation'`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS org_credit_ticket_once ON org_credit_ledger (ticket_id) WHERE reason = 'ticket_issued'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS org_credit_ledger_org ON org_credit_ledger (organizer_id)`);
    await pool.query(`
      ALTER TABLE creator_events
        ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS min_qty INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS max_qty INTEGER NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS opp_settings JSONB`);
    await pool.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS opp_staff_id TEXT,
        ADD COLUMN IF NOT EXISTS organizer_id INTEGER,
        ADD COLUMN IF NOT EXISTS payment_txnid TEXT,
        ADD COLUMN IF NOT EXISTS payment_status TEXT`);
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_txnid_uq ON bookings(payment_txnid) WHERE payment_txnid IS NOT NULL");
    await pool.query("CREATE INDEX IF NOT EXISTS bookings_opp_staff_idx ON bookings(opp_staff_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS bookings_event_idx ON bookings(event_id)");
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS return_url TEXT, ADD COLUMN IF NOT EXISTS purpose TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opp_staff (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES creator_events(id) ON DELETE CASCADE,
        creator_id INTEGER NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES opp_staff(id) ON DELETE RESTRICT,
        path TEXT NOT NULL,
        depth INTEGER NOT NULL DEFAULT 0,
        staff_code TEXT NOT NULL,
        referral_code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        photo_url TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (event_id, user_id),
        UNIQUE (event_id, staff_code)
      )`);
    await pool.query("CREATE INDEX IF NOT EXISTS opp_staff_path_idx ON opp_staff (event_id, path text_pattern_ops)");
    await pool.query("CREATE INDEX IF NOT EXISTS opp_staff_user_idx ON opp_staff (user_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS opp_staff_parent_idx ON opp_staff (parent_id)");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opp_allocations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES creator_events(id) ON DELETE CASCADE,
        staff_id TEXT NOT NULL REFERENCES opp_staff(id) ON DELETE CASCADE,
        allocated_by TEXT NOT NULL,
        tier_name TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty >= 0),
        unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (staff_id, tier_name)
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opp_purchases (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES creator_events(id) ON DELETE CASCADE,
        buyer_staff_id TEXT NOT NULL REFERENCES opp_staff(id) ON DELETE CASCADE,
        seller_staff_id TEXT REFERENCES opp_staff(id) ON DELETE CASCADE,
        tier_name TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
        total NUMERIC NOT NULL CHECK (total >= 0),
        status TEXT NOT NULL DEFAULT 'pending_payment',
        payment_txnid TEXT UNIQUE,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      )`);
    await pool.query("CREATE INDEX IF NOT EXISTS opp_purchases_buyer_idx ON opp_purchases (buyer_staff_id, status)");
    await pool.query("CREATE INDEX IF NOT EXISTS opp_purchases_seller_idx ON opp_purchases (event_id, seller_staff_id, status)");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opp_holds (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES creator_events(id) ON DELETE CASCADE,
        staff_id TEXT REFERENCES opp_staff(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tier_name TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price NUMERIC NOT NULL,
        subtotal NUMERIC NOT NULL, fee NUMERIC NOT NULL, gst NUMERIC NOT NULL, total NUMERIC NOT NULL,
        buyer_name TEXT, buyer_email TEXT, buyer_phone TEXT,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ
      )`);
    await pool.query("CREATE INDEX IF NOT EXISTS opp_holds_active_idx ON opp_holds (event_id, status, expires_at)");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opp_audit (
        id BIGSERIAL PRIMARY KEY, actor TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT,
        data JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  }

  /* ---------------------------------------------------------- event helpers */
  // Called from POST /creator/events (server.js) for media, qty limits and opportunity settings.
  function normalizeEventInput(body) {
    const category = String(body.category || "").trim();
    const minQty = Math.max(1, parseInt(body.minQty, 10) || 1);
    const maxQty = Math.max(minQty, Math.min(50, parseInt(body.maxQty, 10) || 10));
    const media = (Array.isArray(body.media) ? body.media : [])
      .filter((m) => m && (m.type === "image" || m.type === "video") && m.url)
      .slice(0, 12).map((m) => ({ type: m.type, url: String(m.url), key: m.key ? String(m.key) : null }));
    let oppSettings = null;
    if (OPP_RE.test(category)) {
      const s = body.opportunity || {};
      oppSettings = {
        recruitmentEnabled: s.recruitmentEnabled !== false,
        staffPool: Math.max(0, parseInt(s.staffPool, 10) || 0),
        maxDepth: Math.min(10, Math.max(1, parseInt(s.maxDepth, 10) || 4)),
        maxDirectRecruits: Math.min(500, Math.max(1, parseInt(s.maxDirectRecruits, 10) || 25)),
        minPurchase: Math.max(1, parseInt(s.minPurchase, 10) || 1),
        maxPurchase: Math.max(1, parseInt(s.maxPurchase, 10) || 500),
        commissionRate: Math.min(100, Math.max(0, Number(s.commissionRate) || 0)),
        recruitCode: code(10),
      };
    }
    return { category, minQty, maxQty, media, oppSettings, free: isFreeCat(category) };
  }

  async function lockEvent(client, eventId) {
    const r = await client.query("SELECT * FROM creator_events WHERE id=$1 FOR UPDATE", [eventId]);
    if (!r.rows.length) throw httpError(404, "Event does not exist");
    return r.rows[0];
  }
  const tierOf = (ev, name) => (Array.isArray(ev.tickets) ? ev.tickets : []).find((t) => t.name === name);

  // Inventory (always computed inside a transaction holding the event row lock).
  async function tierSoldDirect(client, eventId, tier) {
    const r = await client.query(
      `SELECT
         COALESCE((SELECT SUM(qty) FROM bookings WHERE event_id=$1 AND ticket_type=$2 AND status <> 'refunded'),0)::INT AS sold,
         COALESCE((SELECT SUM(qty) FROM opp_holds WHERE event_id=$1 AND tier_name=$2 AND status='pending_payment' AND expires_at > NOW()),0)::INT AS held`,
      [eventId, tier]);
    return r.rows[0].sold + r.rows[0].held;
  }
  async function organizerPoolLeft(client, ev, tier) {
    const t = tierOf(ev, tier);
    const r = await client.query(
      `SELECT COALESCE(SUM(qty),0)::INT AS out FROM opp_purchases
       WHERE event_id=$1 AND tier_name=$2 AND seller_staff_id IS NULL
         AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))`, [ev.id, tier]);
    const d = await client.query(
      `SELECT
         COALESCE((SELECT SUM(qty) FROM bookings WHERE event_id=$1 AND ticket_type=$2 AND opp_staff_id IS NULL AND status <> 'refunded'),0)::INT AS sold,
         COALESCE((SELECT SUM(qty) FROM opp_holds WHERE event_id=$1 AND tier_name=$2 AND staff_id IS NULL AND status='pending_payment' AND expires_at > NOW()),0)::INT AS held`,
      [ev.id, tier]);
    return Number(t ? t.qty : 0) - r.rows[0].out - d.rows[0].sold - d.rows[0].held;
  }
  async function staffStock(client, staffId, tier) {
    const r = await client.query(
      `SELECT
        COALESCE((SELECT SUM(qty) FROM opp_purchases WHERE buyer_staff_id=$1 AND tier_name=$2 AND status='paid'),0)::INT AS bought,
        COALESCE((SELECT SUM(qty) FROM opp_purchases WHERE seller_staff_id=$1 AND tier_name=$2
                   AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))),0)::INT AS passed_down,
        COALESCE((SELECT SUM(qty) FROM bookings WHERE opp_staff_id=$1 AND ticket_type=$2 AND status <> 'refunded'),0)::INT AS sold,
        COALESCE((SELECT SUM(qty) FROM opp_holds WHERE staff_id=$1 AND tier_name=$2 AND status='pending_payment' AND expires_at > NOW()),0)::INT AS held`,
      [staffId, tier]);
    const x = r.rows[0];
    return x.bought - x.passed_down - x.sold - x.held;
  }

  /* --------------------------------------------------------------- progress */
  // One query for many staff: own numbers only (no rollups of other people's data).
  async function progressFor(db, staffIds) {
    if (!staffIds.length) return {};
    const r = await db.query(
      `SELECT s.id,
         COALESCE((SELECT SUM(qty) FROM opp_allocations a WHERE a.staff_id=s.id),0)::INT AS allocated,
         COALESCE((SELECT SUM(qty) FROM opp_purchases p WHERE p.buyer_staff_id=s.id AND p.status='paid'),0)::INT AS purchased,
         COALESCE((SELECT SUM(total) FROM opp_purchases p WHERE p.buyer_staff_id=s.id AND p.status='paid'),0)::NUMERIC AS purchase_paid,
         COALESCE((SELECT COUNT(*) FROM opp_purchases p WHERE p.buyer_staff_id=s.id AND p.status='pending_payment' AND p.expires_at > NOW()),0)::INT AS purchase_pending,
         COALESCE((SELECT SUM(qty) FROM opp_purchases p WHERE p.seller_staff_id=s.id AND p.status='paid'),0)::INT AS passed_down,
         COALESCE((SELECT SUM(total) FROM opp_purchases p WHERE p.seller_staff_id=s.id AND p.status='paid'),0)::NUMERIC AS downstream_received,
         COALESCE((SELECT SUM(qty) FROM bookings b WHERE b.opp_staff_id=s.id AND b.status <> 'refunded'),0)::INT AS sold,
         COALESCE((SELECT SUM(price*qty) FROM bookings b WHERE b.opp_staff_id=s.id AND b.status <> 'refunded'),0)::NUMERIC AS sales_amount,
         COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.opp_staff_id=s.id AND b.status <> 'refunded'),0)::INT AS booking_count,
         (SELECT COUNT(*) FROM opp_staff c WHERE c.parent_id=s.id)::INT AS direct_recruits
       FROM opp_staff s WHERE s.id = ANY($1)`, [staffIds]);
    const out = {};
    for (const x of r.rows) {
      const remaining = x.purchased - x.passed_down - x.sold;
      const base = x.purchased || x.allocated;
      out[x.id] = {
        allocated: x.allocated, purchased: x.purchased, sold: x.sold, remaining, passedDown: x.passed_down,
        salesAmount: Number(x.sales_amount), purchasePaid: Number(x.purchase_paid), downstreamReceived: Number(x.downstream_received),
        bookingCount: x.booking_count, directRecruits: x.direct_recruits,
        paymentStatus: x.purchase_pending ? "Payment pending" : x.purchased ? "Paid" : "No purchases yet",
        progress: base ? Math.min(100, Math.round((x.sold / base) * 100)) : 0,
      };
    }
    return out;
  }
  const publicStaff = (s, prog, { parentCode } = {}) => ({
    id: s.id, staffCode: s.staff_code, name: s.display_name, photo: s.photo_url, depth: s.depth,
    parentId: s.parent_id, parentStaffCode: parentCode || null, status: s.status, joinedAt: s.created_at,
    ...(prog ? { progress: prog } : {}),
  });

  /* ------------------------------------------------------------------- auth */
  const requireOppStaff = async (req, res, next) => {
    try {
      const p = verifyJwt(bearer(req));
      if (p.scope !== "opp_staff" || !p.sub) throw new Error("Staff login required");
      req.oppUser = p;
      if (req.params.memberId) {
        // Membership must belong to the logged-in user — never trust the URL id alone.
        const r = await pool.query(
          `SELECT s.*, e.name AS event_name, e.creator_id AS organizer_id FROM opp_staff s
           JOIN creator_events e ON e.id=s.event_id WHERE s.id=$1 AND s.user_id=$2`, [req.params.memberId, p.sub]);
        if (!r.rows.length) return fail(res, 403, "You don't have access to this staff membership");
        if (r.rows[0].status !== "active") return fail(res, 403, "This staff membership is not active");
        req.member = r.rows[0];
      }
      next();
    } catch (err) { fail(res, 401, err.message || "Staff login required"); }
  };
  const requireCreatorV2 = (req, res, next) => {
    try { const p = verifyJwt(bearer(req)); if (p.scope !== "creator") throw new Error("Creator login required"); req.creator = p; next(); }
    catch (err) { fail(res, 401, err.message || "Creator login required"); }
  };
  const optionalBuyer = (req) => {
    try { const p = verifyJwt(bearer(req)); return p && p.sub && !p.scope ? p : null; } catch { return null; }
  };
  const requireBuyerV2 = async (req, res, next) => {
    const p = optionalBuyer(req);
    if (!p) return fail(res, 401, "Please sign in to continue");
    const u = await pool.query("SELECT id, status FROM users WHERE id=$1", [p.sub]);
    if (!u.rows.length || !isUserActive(u.rows[0].status)) return fail(res, 401, "Account not found");
    req.buyer = p; next();
  };
  async function ownedOppEvent(db, creatorId, eventId) {
    const r = await db.query("SELECT * FROM creator_events WHERE id=$1 AND creator_id=$2", [eventId, creatorId]);
    if (!r.rows.length) throw httpError(404, "Event not found for this organizer");
    if (!isOpp(r.rows[0])) throw httpError(400, "Staff features are only available for Opportunity events");
    return r.rows[0];
  }

  /* -------------------------------------------- staff creation (shared) */
  async function createMembership(client, { ev, parent, userId, name, photoUrl }) {
    const s = settingsOf(ev);
    if (parent) {
      if (parent.depth + 1 >= s.maxDepth) throw httpError(400, `Recruitment depth limit reached (max ${s.maxDepth} levels)`);
      const n = await client.query("SELECT COUNT(*)::INT AS n FROM opp_staff WHERE parent_id=$1", [parent.id]);
      if (n.rows[0].n >= s.maxDirectRecruits) throw httpError(400, `This staff member has reached the recruit limit (${s.maxDirectRecruits})`);
    }
    const dup = await client.query("SELECT id FROM opp_staff WHERE event_id=$1 AND user_id=$2", [ev.id, userId]);
    if (dup.rows.length) throw httpError(409, "This account is already a staff member for this event");
    const id = rid("OST");
    let staffCode;
    for (let i = 0; i < 5 && !staffCode; i++) {
      const c = `BO-${code(5)}`;
      const ex = await client.query("SELECT 1 FROM opp_staff WHERE event_id=$1 AND staff_code=$2", [ev.id, c]);
      if (!ex.rows.length) staffCode = c;
    }
    const row = await client.query(
      `INSERT INTO opp_staff (id, event_id, creator_id, user_id, parent_id, path, depth, staff_code, referral_code, display_name, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, ev.id, ev.creator_id, userId, parent ? parent.id : null, `${parent ? parent.path : "/"}${id}/`, parent ? parent.depth + 1 : 0,
        staffCode, code(12, "abcdefghjkmnpqrstuvwxyz23456789"), String(name).trim().slice(0, 80), photoUrl || null]);
    await audit(client, parent ? `staff:${parent.id}` : `event:${ev.id}`, "staff.join", "opp_staff", id, { parent: parent && parent.id, userId });
    return row.rows[0];
  }
  async function findOrCreateUser(client, { name, email, phone, password, allowExistingWithoutPassword }) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw httpError(400, "Enter a valid email");
    const ex = await client.query("SELECT * FROM users WHERE LOWER(email)=$1", [cleanEmail]);
    if (ex.rows.length) {
      const u = ex.rows[0];
      if (!isUserActive(u.status)) throw httpError(403, "This account is not active");
      if (!allowExistingWithoutPassword) {
        if (!password || !(await bcrypt.compare(String(password), u.password)))
          throw httpError(401, "An account with this email already exists — enter its password to join");
      }
      return { user: u, created: false };
    }
    const pw = String(password || "");
    if (pw.length < 8) throw httpError(400, "Choose a password with at least 8 characters");
    const parts = String(name || "").trim().split(/\s+/);
    const r = await client.query(
      `INSERT INTO users (username, email, password, first_name, last_name, phone, country_code, auth_provider)
       VALUES ($1,$2,$3,$4,$5,$6,'+91','staff-invite') RETURNING *`,
      [cleanEmail.split("@")[0], cleanEmail, await bcrypt.hash(pw, 10), parts[0] || "Staff", parts.slice(1).join(" ") || null,
        String(phone || "").replace(/\D/g, "").slice(-10) || null]);
    return { user: r.rows[0], created: true };
  }
  const memberSummary = (s, ev) => ({
    memberId: s.id, staffCode: s.staff_code, name: s.display_name, depth: s.depth,
    eventId: ev.id, eventName: ev.name, eventDate: ev.event_date, eventBanner: ev.banner_url, status: s.status,
  });

  /* ======================================================================= */
  /* Public                                                                  */
  /* ======================================================================= */
  app.get("/v2/events/:id/staff", wrap(async (req, res) => {
    const ev = await pool.query("SELECT * FROM creator_events WHERE id=$1", [req.params.id]);
    if (!ev.rows.length || !isEventBookable(ev.rows[0].status)) return fail(res, 404, "Event does not exist");
    if (!isOpp(ev.rows[0])) return res.json({ staff: [], recruitmentEnabled: false });
    const id = req.params.id;
    // Stock per staff per tier in one pass: bought − passed down − sold − held (same rules as staffStock()).
    const [r, agg, sold] = await Promise.all([
      pool.query("SELECT * FROM opp_staff WHERE event_id=$1 AND status='active' ORDER BY depth, created_at", [id]),
      pool.query(`SELECT x.sid, x.tier, SUM(x.n)::INT AS n FROM (
          SELECT buyer_staff_id AS sid, tier_name AS tier, qty AS n FROM opp_purchases WHERE event_id=$1 AND status='paid'
          UNION ALL SELECT seller_staff_id, tier_name, -qty FROM opp_purchases WHERE event_id=$1 AND seller_staff_id IS NOT NULL AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))
          UNION ALL SELECT opp_staff_id, ticket_type, -qty FROM bookings WHERE event_id=$1 AND opp_staff_id IS NOT NULL AND status <> 'refunded'
          UNION ALL SELECT staff_id, tier_name, -qty FROM opp_holds WHERE event_id=$1 AND staff_id IS NOT NULL AND status='pending_payment' AND expires_at > NOW()
        ) x GROUP BY x.sid, x.tier`, [id]),
      pool.query("SELECT opp_staff_id AS sid, SUM(qty)::INT AS n FROM bookings WHERE event_id=$1 AND opp_staff_id IS NOT NULL AND status <> 'refunded' GROUP BY 1", [id]),
    ]);
    const tiers = (ev.rows[0].tickets || []).map((t) => t.name);
    const stockOf = {};
    for (const a of agg.rows) (stockOf[a.sid] = stockOf[a.sid] || {})[a.tier] = a.n;
    const soldOf = Object.fromEntries(sold.rows.map((x) => [x.sid, x.n]));
    const staff = r.rows.map((s) => {
      const stock = Object.fromEntries(tiers.map((t) => [t, Math.max(0, (stockOf[s.id] || {})[t] || 0)]));
      return { staffCode: s.staff_code, name: s.display_name, photo: s.photo_url, available: Object.values(stock).reduce((a, b) => a + b, 0), stock, ticketsSold: soldOf[s.id] || 0 };
    });
    res.json({ staff, recruitmentEnabled: settingsOf(ev.rows[0]).recruitmentEnabled });
  }));

  // Resolve a referral code (from ?ref=) to the staff profile within that event only.
  app.get("/v2/events/:id/ref/:ref", wrap(async (req, res) => {
    const r = await pool.query("SELECT staff_code, display_name, photo_url FROM opp_staff WHERE event_id=$1 AND referral_code=$2 AND status='active'", [req.params.id, req.params.ref]);
    if (!r.rows.length) return fail(res, 404, "Referral link is not valid for this event");
    res.json({ staffCode: r.rows[0].staff_code, name: r.rows[0].display_name, photo: r.rows[0].photo_url });
  }));

  app.get("/v2/events/:id/inventory", wrap(async (req, res) => {
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, req.params.id);
      const tiers = [];
      for (const t of ev.tickets || []) {
        const left = isOpp(ev) && settingsOf(ev).recruitmentEnabled
          ? await organizerPoolLeft(client, ev, t.name)
          : Number(t.qty || 0) - (await tierSoldDirect(client, ev.id, t.name));
        tiers.push({ name: t.name, price: Number(t.price || 0), perks: t.perks || "", total: Number(t.qty || 0), available: Math.max(0, left) });
      }
      return { tiers, minQty: ev.min_qty || 1, maxQty: ev.max_qty || 10, isOpportunity: isOpp(ev), staffRequired: isOpp(ev) && settingsOf(ev).recruitmentEnabled };
    });
    res.json(out);
  }));

  /* ======================================================================= */
  /* Organizer subscriptions & credits                                       */
  /* ======================================================================= */
  // Central plan configuration. Price and credit allowance are separate values: the ₹3.50 credit
  // reference value is informational only and never used to derive a price.
  const CREDIT_REFERENCE_VALUE = 3.5;
  const FEATURE_TOTAL = 44;
  // One-time free trial (₹0). Duration/credits are business settings — adjust here.
  const TRIAL = { id: "FREE", name: "Free trial", trial: true, trialDays: 14, monthlyCredits: 50, monthlyPrice: 0, annualPrice: 0, featureCount: 16 };
  const PLANS = [
    { id: "STARTER", name: "Starter", monthlyCredits: 500, monthlyPrice: 1299, annualPrice: 12999, featureCount: 16 },
    { id: "GROWTH", name: "Growth", monthlyCredits: 800, monthlyPrice: 2499, annualPrice: 24999, featureCount: 34 },
    { id: "BUSINESS", name: "Business", monthlyCredits: 1300, monthlyPrice: 3999, annualPrice: 39999, featureCount: 44, popular: true },
    { id: "ENTERPRISE", name: "Enterprise", monthlyCredits: 3000, monthlyPrice: 6999, annualPrice: 69999, featureCount: 44 },
  ];
  const planById = (id) => [TRIAL, ...PLANS].find((p) => p.id === String(id || "").toUpperCase());
  const planView = (p) => ({ ...p, featureTotal: FEATURE_TOTAL, annualSaving: p.trial ? 0 : p.monthlyPrice * 12 - p.annualPrice, creditReferenceValue: Math.round(p.monthlyCredits * CREDIT_REFERENCE_VALUE * 100) / 100 });

  async function activeSubscription(db, organizerId) {
    const r = await db.query("SELECT * FROM org_subscriptions WHERE organizer_id=$1 AND status='active' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 1", [organizerId]);
    return r.rows[0] || null;
  }
  // Monthly allowance: one allocation per started month of the subscription (yearly = up to 12).
  async function ensureAllocations(db, sub) {
    if (!sub || sub.status !== "active") return;
    const months = sub.billing_period === "yearly" ? 12 : 1;
    const start = new Date(sub.starts_at); const now = new Date();
    let elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + (now.getDate() >= start.getDate() ? 1 : 0);
    elapsed = Math.max(1, Math.min(months, elapsed));
    for (let i = 0; i < elapsed; i++) {
      await db.query(
        `INSERT INTO org_credit_ledger (organizer_id, subscription_id, plan_id, billing_period, credit_type, credits, reason, period_index)
         VALUES ($1,$2,$3,$4,'subscription',$5,'monthly_allocation',$6) ON CONFLICT DO NOTHING`,
        [sub.organizer_id, sub.id, sub.plan_id, sub.billing_period, sub.monthly_credits, i]);
    }
  }
  // Balance of the organizer's CURRENT plan only. Carry-over between plans/renewals is not decided
  // in the spec, so credits are not rolled over (no active plan = 0 credits).
  async function creditSummary(db, organizerId) {
    const sub = await activeSubscription(db, organizerId);
    if (!sub) return { allocated: 0, consumed: 0, remaining: 0 };
    const r = await db.query(
      `SELECT COALESCE(SUM(credits) FILTER (WHERE credits > 0),0)::int AS allocated,
              COALESCE(-SUM(credits) FILTER (WHERE credits < 0),0)::int AS consumed
       FROM org_credit_ledger WHERE organizer_id=$1 AND subscription_id=$2`, [organizerId, sub.id]);
    const { allocated, consumed } = r.rows[0];
    return { allocated, consumed, remaining: allocated - consumed };
  }
  async function hasPlanHistory(db, organizerId) {
    const r = await db.query("SELECT 1 FROM org_subscriptions WHERE organizer_id=$1 AND status IN ('active','expired') LIMIT 1", [organizerId]);
    return r.rows.length > 0;
  }
  // Booking-time check: organizers on the credit model can't issue more tickets than credits left
  // (counting tickets already held for payment). Organizers who never subscribed are unaffected.
  async function assertCredits(db, ev, qty) {
    if (!(await hasPlanHistory(db, ev.creator_id))) return;
    await ensureAllocations(db, await activeSubscription(db, ev.creator_id));
    const { remaining } = await creditSummary(db, ev.creator_id);
    const held = await db.query(
      `SELECT COALESCE(SUM(h.qty),0)::int AS n FROM opp_holds h JOIN creator_events e ON e.id=h.event_id
       WHERE e.creator_id=$1 AND h.status='pending_payment' AND h.expires_at > NOW()`, [ev.creator_id]);
    if (remaining - held.rows[0].n < qty) throw httpError(409, "This event has reached its ticket limit for now. Please try again later.");
  }
  async function consumeCredits(db, ev, bookingId, qty) {
    if (!(await hasPlanHistory(db, ev.creator_id))) return;
    const sub = await activeSubscription(db, ev.creator_id);
    await db.query(
      `INSERT INTO org_credit_ledger (organizer_id, subscription_id, plan_id, billing_period, credit_type, credits, reason, ticket_id, event_id)
       VALUES ($1,$2,$3,$4,'subscription',$5,'ticket_issued',$6,$7) ON CONFLICT DO NOTHING`,
      [ev.creator_id, sub ? sub.id : null, sub ? sub.plan_id : null, sub ? sub.billing_period : null, -Math.abs(qty), bookingId, ev.id]);
  }
  // Used by POST /creator/events: publishing needs an active plan.
  async function planGate(organizerId) {
    const sub = await activeSubscription(pool, organizerId);
    return sub ? null : "Choose a BEE-OAK organizer plan to create events.";
  }
  const subView = (sub) => sub && ({
    id: sub.id, planId: sub.plan_id, plan: planById(sub.plan_id) ? planById(sub.plan_id).name : sub.plan_id, billingPeriod: sub.billing_period,
    price: Number(sub.price), monthlyCredits: sub.monthly_credits, status: sub.status, startsAt: sub.starts_at, renewalDate: sub.ends_at,
  });

  app.get("/v2/creator/plans", (req, res) => res.json({ trial: planView(TRIAL), plans: PLANS.map(planView), creditReferenceValue: CREDIT_REFERENCE_VALUE, featureTotal: FEATURE_TOTAL }));
  async function trialUsed(organizerId) {
    const r = await pool.query("SELECT 1 FROM org_subscriptions WHERE organizer_id=$1 AND (billing_period='trial' OR status IN ('active','expired')) LIMIT 1", [organizerId]);
    return r.rows.length > 0;
  }

  app.get("/v2/creator/subscription", requireCreatorV2, wrap(async (req, res) => {
    const sub = await activeSubscription(pool, req.creator.sub);
    await ensureAllocations(pool, sub);
    res.json({ trial: planView(TRIAL), trialAvailable: !(await trialUsed(req.creator.sub)), plans: PLANS.map(planView), subscription: subView(sub), credits: await creditSummary(pool, req.creator.sub), creditReferenceValue: CREDIT_REFERENCE_VALUE });
  }));

  // Start a plan purchase. Upgrades/downgrades need an approved proration policy, so an organizer
  // with an active plan can't buy another until it ends.
  app.post("/v2/creator/subscription", requireCreatorV2, wrap(async (req, res) => {
    const plan = planById(req.body && req.body.planId);
    const period = req.body && req.body.billingPeriod === "yearly" ? "yearly" : "monthly";
    if (!plan) return fail(res, 400, "Choose a plan");
    const current = await activeSubscription(pool, req.creator.sub);
    if (current) return fail(res, 409, `Your ${planById(current.plan_id).name} plan is active until ${new Date(current.ends_at).toDateString()}`);
    const id = `SUB-${Date.now()}${crypto.randomBytes(2).toString("hex")}`;
    if (plan.trial) {
      if (await trialUsed(req.creator.sub)) return fail(res, 409, "Your free trial has already been used. Choose a plan to continue.");
      const r = await pool.query(
        `INSERT INTO org_subscriptions (id, organizer_id, plan_id, billing_period, price, monthly_credits, status, starts_at, ends_at, activated_at)
         VALUES ($1,$2,$3,'trial',0,$4,'active',NOW(), NOW() + ($5 || ' days')::interval, NOW()) RETURNING *`,
        [id, req.creator.sub, plan.id, plan.monthlyCredits, String(plan.trialDays)]);
      await ensureAllocations(pool, r.rows[0]);
      await audit(pool, `creator:${req.creator.sub}`, "subscription.trial_started", "org_subscriptions", id, { credits: plan.monthlyCredits, days: plan.trialDays });
      return res.status(201).json({ subscriptionId: id, amount: 0, activated: true, subscription: subView(r.rows[0]), credits: await creditSummary(pool, req.creator.sub) });
    }
    const price = period === "yearly" ? plan.annualPrice : plan.monthlyPrice;
    await pool.query(
      "INSERT INTO org_subscriptions (id, organizer_id, plan_id, billing_period, price, monthly_credits) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, req.creator.sub, plan.id, period, price, plan.monthlyCredits]);
    res.status(201).json({ subscriptionId: id, amount: price, payment: paymentMode() });
  }));

  async function ownedPendingSub(id, organizerId) {
    const r = await pool.query("SELECT * FROM org_subscriptions WHERE id=$1 AND organizer_id=$2", [id, organizerId]);
    if (!r.rows.length) throw httpError(404, "Subscription not found");
    return r.rows[0];
  }

  app.post("/v2/creator/subscription/:id/pay", requireCreatorV2, wrap(async (req, res) => {
    const sub = await ownedPendingSub(req.params.id, req.creator.sub);
    if (sub.status !== "pending_payment") return fail(res, 409, `Already ${sub.status}`);
    if (paymentMode().mode === "simulator") return res.json({ mode: "simulator", amount: Number(sub.price) });
    if (!payuConfig.key || !payuConfig.salt) return fail(res, 500, "Payments are not configured");
    const c = await pool.query("SELECT name, email, phone FROM creator_accounts WHERE id=$1", [req.creator.sub]);
    const creator = c.rows[0] || {};
    const origin = `https://${req.get("host")}`;
    const plan = planById(sub.plan_id);
    const fields = {
      key: payuConfig.key, txnid: sub.id, amount: formatPayuAmount(Number(sub.price)),
      productinfo: cleanPayuText(`BEE-OAK ${plan.name} plan (${sub.billing_period})`, 100), firstname: cleanPayuText(creator.name || "BEE-OAK Organizer", 60),
      email: String(creator.email || "organizer@beeoak.in").slice(0, 100), phone: String(creator.phone || "9999999999").replace(/\D/g, "").slice(-10) || "9999999999",
      surl: `${origin}/payments/payu/success?booking=${encodeURIComponent(sub.id)}`, furl: `${origin}/payments/payu/failure?booking=${encodeURIComponent(sub.id)}`,
      udf1: sub.id, udf2: "", udf3: plan.id, udf4: sub.billing_period, udf5: "beeoak-plan", service_provider: "payu_paisa",
    };
    fields.hash = makePayuHash(fields);
    await savePaymentTransaction(fields, "Pending", false);
    const returnUrl = String(req.body.returnUrl || "");
    if (/^https?:\/\//.test(returnUrl)) await pool.query("UPDATE payment_transactions SET return_url=$1, purpose='subscription' WHERE txnid=$2", [returnUrl.slice(0, 300), sub.id]);
    res.json({ mode: "payu", action: payuConfig.action, fields });
  }));

  app.post("/v2/creator/subscription/:id/simulate", requireCreatorV2, wrap(async (req, res) => {
    if (process.env.PAYMENT_SIMULATOR !== "1") return fail(res, 404, "Not found");
    const sub = await ownedPendingSub(req.params.id, req.creator.sub);
    const ok = req.body.outcome !== "fail";
    await savePaymentTransaction({ txnid: sub.id, amount: Number(sub.price), udf1: sub.id, udf3: sub.plan_id, udf4: sub.billing_period, mihpayid: `SIM-${Date.now()}` },
      ok ? "Success" : "Failed", ok, ok ? "" : "Simulated failure");
    res.json({ ok: true, outcome: ok ? "success" : "fail" });
  }));

  // Activate after a verified payment (PayU callback, PayU verify API, or the local simulator).
  app.post("/v2/creator/subscription/:id/confirm", requireCreatorV2, wrap(async (req, res) => {
    const sub = await ownedPendingSub(req.params.id, req.creator.sub);
    if (sub.status === "active") return res.json({ subscription: subView(sub), credits: await creditSummary(pool, sub.organizer_id) });
    if (sub.status !== "pending_payment") return fail(res, 409, `Subscription is ${sub.status}`);
    let txn = await verifiedPayment(pool, sub.id, Number(sub.price));
    if (!txn && paymentMode().mode !== "simulator") { if ((await payuCheck(sub.id, Number(sub.price))) === "success") txn = await verifiedPayment(pool, sub.id, Number(sub.price)); }
    if (!txn) return fail(res, 402, "Payment has not been verified yet");
    const current = await activeSubscription(pool, sub.organizer_id);
    if (current) return fail(res, 409, "Another plan is already active on this account");
    const r = await pool.query(
      `UPDATE org_subscriptions SET status='active', payment_txnid=$2, activated_at=NOW(), starts_at=NOW(),
         ends_at = NOW() + (CASE WHEN billing_period='yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END)
       WHERE id=$1 AND status='pending_payment' RETURNING *`, [sub.id, txn.txnid]);
    await ensureAllocations(pool, r.rows[0]);
    await audit(pool, `creator:${sub.organizer_id}`, "subscription.activated", "org_subscriptions", sub.id, { plan: sub.plan_id, period: sub.billing_period, price: Number(sub.price) });
    res.json({ subscription: subView(r.rows[0]), credits: await creditSummary(pool, sub.organizer_id) });
  }));

  /* ======================================================================= */
  /* Customer bookings (all events) with server-side pricing + verified pay  */
  /* ======================================================================= */
  app.post("/v2/bookings", requireBuyerV2, wrap(async (req, res) => {
    const { eventId, tierName, staffCode, buyer = {} } = req.body || {};
    const qty = parseInt(req.body && req.body.qty, 10);
    const result = await tx(async (client) => {
      const ev = await lockEvent(client, eventId);
      if (!isEventBookable(ev.status) || ev.visibility === "Invite Only") throw httpError(404, "Event is not open for booking");
      const tier = tierOf(ev, tierName);
      if (!tier) throw httpError(400, "Ticket category not found");
      const minQ = ev.min_qty || 1; const maxQ = ev.max_qty || 10;
      if (!Number.isInteger(qty) || qty < minQ || qty > maxQ) throw httpError(400, `Choose between ${minQ} and ${maxQ} tickets`);
      let staff = null;
      const staffMode = isOpp(ev) && settingsOf(ev).recruitmentEnabled;
      if (staffMode && !staffCode) {
        // Direct booking from the organizer's own (unsold-to-staff) tickets.
        const left = await organizerPoolLeft(client, ev, tier.name);
        if (left < qty) throw httpError(409, left > 0 ? `Only ${left} ${tier.name} tickets left with the organizer` : `${tier.name} is sold out with the organizer — book through a staff member`);
      } else if (staffMode) {
        const s = await client.query("SELECT * FROM opp_staff WHERE event_id=$1 AND staff_code=$2 AND status='active'", [ev.id, String(staffCode)]);
        if (!s.rows.length) throw httpError(400, "Selected staff member is not part of this event");
        staff = s.rows[0];
        const stock = await staffStock(client, staff.id, tier.name);
        if (stock < qty) throw httpError(409, stock > 0 ? `${staff.display_name} has only ${stock} ticket${stock > 1 ? "s" : ""} left in ${tier.name}` : `${staff.display_name} has no ${tier.name} tickets left — choose another staff member`);
      } else {
        if (staffCode) throw httpError(400, "Staff selection is not available for this event");
        const left = Number(tier.qty || 0) - (await tierSoldDirect(client, ev.id, tier.name));
        if (left < qty) throw httpError(409, left > 0 ? `Only ${left} ${tier.name} tickets left` : `${tier.name} is sold out`);
      }
      await assertCredits(client, ev, qty);
      const u = await client.query("SELECT * FROM users WHERE id=$1", [req.buyer.sub]);
      const user = u.rows[0];
      const t = totals(tier.price, qty);
      const id = `BLT-${Date.now()}${crypto.randomBytes(2).toString("hex")}`;
      const name = String(buyer.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username).trim().slice(0, 80);
      await client.query(
        `INSERT INTO opp_holds (id, event_id, staff_id, user_id, tier_name, qty, unit_price, subtotal, fee, gst, total, buyer_name, buyer_email, buyer_phone, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW() + INTERVAL '${HOLD_MINUTES} minutes')`,
        [id, ev.id, staff ? staff.id : null, user.id, tier.name, qty, Number(tier.price || 0), t.subtotal, t.fee, t.gst, t.total,
          name, String(buyer.email || user.email).trim().toLowerCase(), String(buyer.phone || user.phone || "").replace(/\D/g, "").slice(-10) || null]);
      return { id, ev, staff, totals: t };
    });
    let booking = null;
    if (result.totals.total === 0) booking = await confirmHold(result.id, req.buyer.sub, { free: true });
    res.status(201).json({
      bookingId: result.id, ...result.totals, expiresInMinutes: HOLD_MINUTES,
      staff: result.staff ? { staffCode: result.staff.staff_code, name: result.staff.display_name } : null,
      payment: booking ? { mode: "free" } : paymentMode(),
      booking,
    });
  }));

  const paymentMode = () => ({ mode: process.env.PAYMENT_SIMULATOR === "1" ? "simulator" : "payu" });

  async function verifiedPayment(db, txnid, minAmount) {
    const p = await db.query("SELECT * FROM payment_transactions WHERE txnid=$1", [txnid]);
    const row = p.rows[0];
    if (!row || !row.verified || !/^success$/i.test(row.status)) return null;
    if (Number(row.amount) + 0.001 < Number(minAmount)) return null;
    return row;
  }

  async function confirmHold(holdId, userId, { free = false } = {}) {
    return tx(async (client) => {
      const h0 = await client.query("SELECT * FROM opp_holds WHERE id=$1", [holdId]);
      if (!h0.rows.length) throw httpError(404, "Booking not found");
      if (Number(h0.rows[0].user_id) !== Number(userId)) throw httpError(403, "This booking belongs to another account");
      const ev = await lockEvent(client, h0.rows[0].event_id);
      const h = (await client.query("SELECT * FROM opp_holds WHERE id=$1 FOR UPDATE", [holdId])).rows[0];
      if (h.status === "confirmed") {
        const b = await client.query("SELECT * FROM bookings WHERE id=$1", [h.id]);
        return ticketResponse(b.rows[0]);
      }
      if (h.status !== "pending_payment") throw httpError(409, `Booking is ${h.status}`);
      let txn = null;
      if (Number(h.total) > 0 || !free) {
        txn = await verifiedPayment(client, h.id, h.total);
        if (!txn) throw httpError(402, "Payment has not been verified for this booking yet");
      }
      // If the hold expired before payment completed, re-check inventory without it.
      if (new Date(h.expires_at) < new Date()) {
        const left = h.staff_id ? await staffStock(client, h.staff_id, h.tier_name)
          : isOpp(ev) && settingsOf(ev).recruitmentEnabled ? await organizerPoolLeft(client, ev, h.tier_name)
            : Number((tierOf(ev, h.tier_name) || {}).qty || 0) - (await tierSoldDirect(client, ev.id, h.tier_name));
        if (left < h.qty) {
          await client.query("UPDATE opp_holds SET status='expired' WHERE id=$1", [h.id]);
          throw httpError(409, "Tickets were released before payment completed. Your payment will be refunded.");
        }
      }
      const qrToken = crypto.randomBytes(18).toString("hex");
      const b = await client.query(
        `INSERT INTO bookings (id, user_id, buyer_name, buyer_email, event_id, event_name, event_date, event_venue, event_banner,
           ticket_type, price, qty, total, status, qr_token, opp_staff_id, organizer_id, payment_txnid, payment_status, booked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'upcoming',$14,$15,$16,$17,$18,NOW()) RETURNING *`,
        [h.id, h.user_id, h.buyer_name, h.buyer_email, ev.id, ev.name, ev.event_date, [ev.venue, ev.city].filter(Boolean).join(", "), ev.banner_url,
          h.tier_name, h.unit_price, h.qty, h.total, qrToken, h.staff_id, ev.creator_id, txn ? txn.txnid : null, txn ? "paid" : "free"]);
      await client.query("UPDATE opp_holds SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [h.id]);
      await consumeCredits(client, ev, h.id, h.qty);
      await client.query(
        `UPDATE creator_events SET
           booking_count=(SELECT COALESCE(SUM(qty),0) FROM bookings WHERE event_id=$1 AND status <> 'refunded'),
           revenue=(SELECT COALESCE(SUM(total),0) FROM bookings WHERE event_id=$1 AND status <> 'refunded')
         WHERE id=$1`, [ev.id]);
      await audit(client, `user:${h.user_id}`, "booking.confirmed", "bookings", h.id, { staff: h.staff_id, qty: h.qty, total: h.total });
      return ticketResponse(b.rows[0]);
    });
  }

  app.post("/v2/bookings/:id/confirm", requireBuyerV2, wrap(async (req, res) => {
    res.json({ booking: await confirmHold(req.params.id, req.buyer.sub) });
  }));
  app.get("/v2/bookings/:id/status", requireBuyerV2, wrap(async (req, res) => {
    const h = await pool.query("SELECT id, status, total, user_id FROM opp_holds WHERE id=$1", [req.params.id]);
    if (!h.rows.length || Number(h.rows[0].user_id) !== Number(req.buyer.sub)) return fail(res, 404, "Booking not found");
    res.json({ id: h.rows[0].id, status: h.rows[0].status, total: Number(h.rows[0].total) });
  }));

  /* ---------------------------------------------------- payments (both kinds) */
  async function paymentTarget(txnid) {
    const h = await pool.query("SELECT h.*, e.name AS event_name FROM opp_holds h JOIN creator_events e ON e.id=h.event_id WHERE h.id=$1", [txnid]);
    if (h.rows.length) return { kind: "booking", amount: Number(h.rows[0].total), status: h.rows[0].status, eventId: h.rows[0].event_id, userId: h.rows[0].user_id, label: h.rows[0].event_name, email: h.rows[0].buyer_email, name: h.rows[0].buyer_name, phone: h.rows[0].buyer_phone, tier: h.rows[0].tier_name, qty: h.rows[0].qty };
    const p = await pool.query("SELECT p.*, s.user_id, u.email, u.phone, s.display_name FROM opp_purchases p JOIN opp_staff s ON s.id=p.buyer_staff_id JOIN users u ON u.id=s.user_id WHERE p.id=$1", [txnid]);
    if (p.rows.length) return { kind: "purchase", amount: Number(p.rows[0].total), status: p.rows[0].status, eventId: p.rows[0].event_id, userId: p.rows[0].user_id, label: "Staff ticket purchase", email: p.rows[0].email, name: p.rows[0].display_name, phone: p.rows[0].phone, tier: p.rows[0].tier_name, qty: p.rows[0].qty };
    return null;
  }
  const authUserId = (req) => { try { const p = verifyJwt(bearer(req)); return p && p.sub && (!p.scope || p.scope === "opp_staff") ? p.sub : null; } catch { return null; } };

  // Start a PayU payment for a booking hold or staff purchase. Amount always comes from the database.
  app.post("/v2/payments/start", wrap(async (req, res) => {
    const userId = authUserId(req);
    if (!userId) return fail(res, 401, "Please sign in to continue");
    const t = await paymentTarget(String(req.body.txnid || ""));
    if (!t || Number(t.userId) !== Number(userId)) return fail(res, 404, "Payment not found");
    if (t.status !== "pending_payment") return fail(res, 409, `Already ${t.status}`);
    if (paymentMode().mode === "simulator") return res.json({ mode: "simulator", amount: t.amount });
    if (!payuConfig.key || !payuConfig.salt) return fail(res, 500, "Payments are not configured");
    const origin = `${req.protocol === "http" && /localhost|127\.0\.0\.1/.test(req.get("host")) ? "http" : "https"}://${req.get("host")}`;
    const fields = {
      key: payuConfig.key, txnid: req.body.txnid, amount: formatPayuAmount(t.amount),
      productinfo: cleanPayuText(`BEE-OAK - ${t.label}`, 100), firstname: cleanPayuText(t.name || "BEE-OAK Guest", 60),
      email: String(t.email || "guest@beeoak.in").slice(0, 100), phone: String(t.phone || "9999999999").slice(-10),
      surl: `${origin}/payments/payu/success?booking=${encodeURIComponent(req.body.txnid)}`,
      furl: `${origin}/payments/payu/failure?booking=${encodeURIComponent(req.body.txnid)}`,
      udf1: cleanPayuText(req.body.txnid, 64), udf2: cleanPayuText(t.eventId, 64), udf3: cleanPayuText(t.tier, 64), udf4: String(t.qty), udf5: "beeoak-web",
      service_provider: "payu_paisa",
    };
    fields.hash = makePayuHash(fields);
    await savePaymentTransaction(fields, "Pending", false);
    const returnUrl = String(req.body.returnUrl || "");
    if (/^https?:\/\//.test(returnUrl)) await pool.query("UPDATE payment_transactions SET return_url=$1, purpose=$2 WHERE txnid=$3", [returnUrl.slice(0, 300), t.kind, fields.txnid]);

    // Android app: PayU UPI intent (S2S) -> upi://pay link that opens PhonePe / GPay / Paytm directly.
    if (req.body.intent === true) {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.socket.remoteAddress || "127.0.0.1").replace(/^::ffff:/, "");
      const r = await fetch(payuConfig.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...fields, pg: "UPI", bankcode: "INTENT", txn_s2s_flow: "4", s2s_client_ip: ip, s2s_device_info: String(req.get("user-agent") || "BEE-OAK Android").slice(0, 255) }),
      });
      const raw = await r.text();
      let data = {}; try { data = JSON.parse(raw); } catch { data = {}; }
      const result = data.result || {}; const meta = data.metaData || data.metadata || {};
      const intentData = String(result.intentURIData || result.intentUriData || "").trim();
      if (!r.ok || !intentData) {
        const msg = meta.message || data.message || "PayU could not create a UPI payment request";
        await savePaymentTransaction(fields, "Failed", false, msg);
        return fail(res, 502, msg);
      }
      const intentUrl = intentData.startsWith("upi://") ? intentData : `upi://pay?${intentData.replace(/^\?/, "")}`;
      return res.json({ mode: "intent", intentUrl, txnid: fields.txnid });
    }
    res.json({ mode: "payu", action: payuConfig.action, fields });
  }));

  // Ask PayU whether a payment succeeded (used after returning from a UPI app). Marks it verified so
  // /v2/bookings/:id/confirm can issue the ticket. Amount is checked against the database.
  app.post("/v2/payments/:txnid/verify", wrap(async (req, res) => {
    const userId = authUserId(req);
    if (!userId) return fail(res, 401, "Please sign in to continue");
    const txnid = String(req.params.txnid || "").slice(0, 40);
    const t = await paymentTarget(txnid);
    if (!t || Number(t.userId) !== Number(userId)) return fail(res, 404, "Payment not found");
    const existing = await verifiedPayment(pool, txnid, t.amount);
    if (existing) return res.json({ status: "success" });
    if (paymentMode().mode === "simulator") return res.json({ status: "pending" });
    if (!payuConfig.key || !payuConfig.salt || !payuConfig.verifyAction) return fail(res, 500, "Payments are not configured");
    res.json({ status: await payuCheck(txnid, t.amount) });
  }));

  // PayU verify_payment for one txnid; on success (and amount >= expected) records it as verified.
  async function payuCheck(txnid, expectedAmount) {
    const command = "verify_payment";
    const hash = crypto.createHash("sha512").update([payuConfig.key, command, txnid, payuConfig.salt].join("|")).digest("hex");
    const r = await fetch(payuConfig.verifyAction, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key: payuConfig.key, command, var1: txnid, hash }) });
    const data = await r.json().catch(() => ({}));
    const tr = (data.transaction_details && data.transaction_details[txnid]) || {};
    const status = String(tr.status || "").toLowerCase(); const unmapped = String(tr.unmappedstatus || "").toLowerCase();
    const amount = Number(tr.amt || tr.amount || 0);
    if ((status === "success" || unmapped === "captured") && amount + 0.001 >= Number(expectedAmount)) {
      await savePaymentTransaction({ ...tr, txnid, amount, udf1: tr.udf1 || txnid }, "Success", true);
      return "success";
    }
    if (status === "failure" || /fail|bounced|dropped|usercancelled/.test(unmapped)) return "failed";
    return "pending";
  }


  // Local testing only: records a verified payment exactly where the PayU success webhook would.
  app.post("/v2/payments/simulate", wrap(async (req, res) => {
    if (process.env.PAYMENT_SIMULATOR !== "1") return fail(res, 404, "Not found");
    const userId = authUserId(req);
    const t = await paymentTarget(String(req.body.txnid || ""));
    if (!t || !userId || Number(t.userId) !== Number(userId)) return fail(res, 404, "Payment not found");
    const outcome = req.body.outcome === "fail" ? "fail" : "success";
    await savePaymentTransaction({ txnid: req.body.txnid, amount: t.amount, udf1: req.body.txnid, udf2: t.eventId, udf3: t.tier, udf4: t.qty, email: t.email, mihpayid: `SIM-${Date.now()}` },
      outcome === "success" ? "Success" : "Failed", outcome === "success", outcome === "success" ? "" : "Simulated failure");
    res.json({ ok: true, outcome });
  }));

  /* ======================================================================= */
  /* Staff: registration, login, dashboard                                   */
  /* ======================================================================= */
  // Join via organizer recruitment code (primary staff) or a staff referral code (below-staff).
  app.get("/v2/staff/invite", wrap(async (req, res) => {
    const { eventId, code: rc, ref } = req.query;
    const ev = await pool.query("SELECT * FROM creator_events WHERE id=$1", [eventId]);
    if (!ev.rows.length || !isOpp(ev.rows[0]) || !isEventBookable(ev.rows[0].status)) return fail(res, 404, "This recruitment link is not valid");
    const s = settingsOf(ev.rows[0]);
    if (!s.recruitmentEnabled) return fail(res, 403, "Staff recruitment is closed for this event");
    let parent = null;
    if (ref) {
      const p = await pool.query("SELECT staff_code, display_name FROM opp_staff WHERE event_id=$1 AND referral_code=$2 AND status='active'", [eventId, ref]);
      if (!p.rows.length) return fail(res, 404, "This recruitment link is not valid");
      parent = { staffCode: p.rows[0].staff_code, name: p.rows[0].display_name };
    } else if (!rc || rc !== s.recruitCode) return fail(res, 404, "This recruitment link is not valid");
    const e = ev.rows[0];
    res.json({ event: { id: e.id, name: e.name, date: e.event_date, venue: e.venue, city: e.city, banner: e.banner_url, organizer: e.creator_name }, parent });
  }));

  app.post("/v2/staff/register", wrap(async (req, res) => {
    const { eventId, code: rc, ref, name, email, phone, password, photo } = req.body || {};
    const buyer = optionalBuyer(req);
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, eventId);
      if (!isOpp(ev) || !isEventBookable(ev.status)) throw httpError(404, "This recruitment link is not valid");
      const s = settingsOf(ev);
      if (!s.recruitmentEnabled) throw httpError(403, "Staff recruitment is closed for this event");
      let parent = null;
      if (ref) {
        const p = await client.query("SELECT * FROM opp_staff WHERE event_id=$1 AND referral_code=$2 AND status='active'", [ev.id, String(ref)]);
        if (!p.rows.length) throw httpError(404, "This recruitment link is not valid");
        parent = p.rows[0];
      } else if (!rc || rc !== s.recruitCode) throw httpError(404, "This recruitment link is not valid");
      let user;
      if (buyer) user = (await client.query("SELECT * FROM users WHERE id=$1", [buyer.sub])).rows[0];
      if (!user) {
        if (!name || String(name).trim().length < 2) throw httpError(400, "Enter your full name");
        user = (await findOrCreateUser(client, { name, email, phone, password })).user;
      }
      let photoUrl = null;
      if (photo && /^data:image\//.test(photo)) {
        const a = await saveAsset({ fileName: `staff-${Date.now()}.jpg`, folder: `staff-photos/${ev.id}`, dataUrl: photo });
        photoUrl = a.mediaUrl;
      }
      const m = await createMembership(client, { ev, parent, userId: user.id, name: name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username, photoUrl });
      return { m, ev, user };
    });
    res.status(201).json({
      token: signJwt({ sub: out.user.id, email: out.user.email, scope: "opp_staff" }),
      membership: memberSummary(out.m, out.ev),
    });
  }));

  app.post("/v2/staff/login", wrap(async (req, res) => {
    const id = String((req.body && req.body.email) || "").trim();
    const password = String((req.body && req.body.password) || "");
    if (!id || !password) return fail(res, 400, "Email or phone and password are required");
    const digits = id.replace(/\D/g, "");
    const r = await pool.query(
      `SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR ($2 <> '' AND length($2) >= 10 AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || right($2,10)) LIMIT 5`, [id, digits]);
    let user = null;
    for (const c of r.rows) if (await bcrypt.compare(password, c.password)) { user = c; break; }
    if (!user) return fail(res, 401, "Invalid email or password");
    if (!isUserActive(user.status)) return fail(res, 403, "This account is not active");
    const m = await pool.query(
      `SELECT s.*, e.name AS event_name, e.event_date, e.banner_url, e.status AS event_status
       FROM opp_staff s JOIN creator_events e ON e.id=s.event_id
       WHERE s.user_id=$1 AND s.status='active' ORDER BY s.created_at DESC`, [user.id]);
    if (!m.rows.length) return fail(res, 403, "No active staff membership for this account. Join an Opportunity event using a recruitment link first.");
    res.json({
      token: signJwt({ sub: user.id, email: user.email, scope: "opp_staff" }),
      user: { id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username, email: user.email },
      memberships: m.rows.map((s) => memberSummary(s, { id: s.event_id, name: s.event_name, event_date: s.event_date, banner_url: s.banner_url })),
    });
  }));

  app.get("/v2/staff/memberships", requireOppStaff, wrap(async (req, res) => {
    const m = await pool.query(
      `SELECT s.*, e.name AS event_name, e.event_date, e.banner_url FROM opp_staff s JOIN creator_events e ON e.id=s.event_id
       WHERE s.user_id=$1 AND s.status='active' ORDER BY s.created_at DESC`, [req.oppUser.sub]);
    res.json({ memberships: m.rows.map((s) => memberSummary(s, { id: s.event_id, name: s.event_name, event_date: s.event_date, banner_url: s.banner_url })) });
  }));

  async function descendantsOf(db, member) {
    const r = await db.query("SELECT * FROM opp_staff WHERE event_id=$1 AND path LIKE $2 AND id <> $3 ORDER BY depth, created_at", [member.event_id, `${member.path}%`, member.id]);
    return r.rows;
  }

  app.get("/v2/staff/m/:memberId/dashboard", requireOppStaff, wrap(async (req, res) => {
    const me = req.member;
    const ev = (await pool.query("SELECT * FROM creator_events WHERE id=$1", [me.event_id])).rows[0];
    const down = await descendantsOf(pool, me);
    const prog = await progressFor(pool, [me.id, ...down.map((d) => d.id)]);
    const parent = me.parent_id ? (await pool.query("SELECT staff_code, display_name FROM opp_staff WHERE id=$1", [me.parent_id])).rows[0] : null;
    const codeById = Object.fromEntries([[me.id, me.staff_code], ...down.map((d) => [d.id, d.staff_code])]);
    const allocations = await pool.query("SELECT * FROM opp_allocations WHERE staff_id=$1 ORDER BY tier_name", [me.id]);
    const childAllocs = await pool.query("SELECT a.* FROM opp_allocations a JOIN opp_staff s ON s.id=a.staff_id WHERE s.parent_id=$1", [me.id]);
    const purchases = await pool.query(
      `SELECT p.*, b.staff_code AS buyer_code, b.display_name AS buyer_name FROM opp_purchases p JOIN opp_staff b ON b.id=p.buyer_staff_id
       WHERE (p.buyer_staff_id=$1 OR p.seller_staff_id=$1) AND p.status IN ('paid','pending_payment') ORDER BY p.created_at DESC LIMIT 100`, [me.id]);
    const client = await pool.connect();
    let stock = {};
    const buyable = [];
    try {
      for (const t of ev.tickets || []) {
        stock[t.name] = Math.max(0, await staffStock(client, me.id, t.name));
        const al = allocations.rows.find((x) => x.tier_name === t.name && x.qty > 0);
        const sellerLeft = Math.max(0, me.parent_id ? await staffStock(client, me.parent_id, t.name) : await organizerPoolLeft(client, ev, t.name));
        let quotaLeft = null;
        if (al) {
          const used = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_purchases WHERE buyer_staff_id=$1 AND tier_name=$2 AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))", [me.id, t.name]);
          quotaLeft = Math.max(0, al.qty - used.rows[0].n);
        }
        buyable.push({ tierName: t.name, perks: t.perks || '', price: al ? Number(al.unit_price) : Number(t.price || 0), ticketPrice: Number(t.price || 0), available: sellerLeft, quotaLeft, canBuy: Math.min(sellerLeft, quotaLeft === null ? sellerLeft : quotaLeft) });
      }
    } finally { client.release(); }
    const bookings = await pool.query("SELECT id, buyer_name, ticket_type, qty, price, total, booked_at FROM bookings WHERE opp_staff_id=$1 AND status <> 'refunded' ORDER BY booked_at DESC LIMIT 50", [me.id]);
    const s = settingsOf(ev);
    res.json({
      me: { ...publicStaff(me, prog[me.id], { parentCode: parent && parent.staff_code }), referralCode: me.referral_code, parentName: parent ? parent.display_name : null, isPrimary: !me.parent_id },
      event: { id: ev.id, name: ev.name, date: ev.event_date, time: ev.start_time, venue: ev.venue, city: ev.city, banner: ev.banner_url, tiers: (ev.tickets || []).map((t) => ({ name: t.name, price: Number(t.price || 0) })) },
      settings: { recruitmentEnabled: s.recruitmentEnabled, canRecruit: s.recruitmentEnabled && me.depth + 1 < s.maxDepth, maxDirectRecruits: s.maxDirectRecruits, minPurchase: s.minPurchase, maxPurchase: s.maxPurchase, commissionRate: s.commissionRate },
      allocations: allocations.rows.map((a) => ({ tierName: a.tier_name, qty: a.qty, unitPrice: Number(a.unit_price), from: a.allocated_by === "organizer" ? "Organizer" : "Parent staff" })),
      childAllocations: childAllocs.rows.map((a) => ({ staffId: a.staff_id, tierName: a.tier_name, qty: a.qty, unitPrice: Number(a.unit_price) })),
      stock,
      buyable,
      purchases: purchases.rows.map((p) => ({ id: p.id, direction: p.buyer_staff_id === me.id ? "bought" : "sold", counterparty: p.buyer_staff_id === me.id ? (p.seller_staff_id ? "Parent staff" : "Organizer") : `${p.buyer_name} (${p.buyer_code})`, tierName: p.tier_name, qty: p.qty, unitPrice: Number(p.unit_price), total: Number(p.total), status: p.status, createdAt: p.created_at, paidAt: p.paid_at })),
      bookings: bookings.rows.map((b) => ({ id: b.id, buyer: b.buyer_name, tier: b.ticket_type, qty: b.qty, amount: Number(b.price) * b.qty, at: b.booked_at })),
      team: down.map((d) => ({ ...publicStaff(d, prog[d.id], { parentCode: codeById[d.parent_id] }), isDirect: d.parent_id === me.id })),
    });
  }));

  // Detail of one downstream staff member. Upline / other branches are rejected server-side.
  app.get("/v2/staff/m/:memberId/team/:staffId", requireOppStaff, wrap(async (req, res) => {
    const me = req.member;
    const t = await pool.query("SELECT * FROM opp_staff WHERE id=$1 AND event_id=$2 AND path LIKE $3 AND id <> $4", [req.params.staffId, me.event_id, `${me.path}%`, me.id]);
    if (!t.rows.length) return fail(res, 403, "You can only view staff in your own downline");
    const target = t.rows[0];
    const down = await descendantsOf(pool, target);
    const prog = await progressFor(pool, [target.id, ...down.map((d) => d.id)]);
    const bookings = await pool.query("SELECT id, buyer_name, ticket_type, qty, price, booked_at FROM bookings WHERE opp_staff_id=$1 AND status <> 'refunded' ORDER BY booked_at DESC LIMIT 50", [target.id]);
    res.json({ staff: publicStaff(target, prog[target.id]), team: down.map((d) => publicStaff(d, prog[d.id])), bookings: bookings.rows.map((b) => ({ id: b.id, buyer: b.buyer_name, tier: b.ticket_type, qty: b.qty, amount: Number(b.price) * b.qty, at: b.booked_at })) });
  }));

  // Parent sets a ticket allocation (quota + price) for a DIRECT child.
  app.post("/v2/staff/m/:memberId/allocations", requireOppStaff, wrap(async (req, res) => {
    const me = req.member;
    const { staffId, tierName } = req.body || {};
    const qty = parseInt(req.body.qty, 10); const unitPrice = Number(req.body.unitPrice);
    if (!Number.isInteger(qty) || qty < 0) return fail(res, 400, "Enter a valid quantity");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail(res, 400, "Enter a valid price");
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, me.event_id);
      if (!tierOf(ev, tierName)) throw httpError(400, "Ticket category not found");
      const c = await client.query("SELECT * FROM opp_staff WHERE id=$1 AND parent_id=$2 AND status='active'", [staffId, me.id]);
      if (!c.rows.length) throw httpError(403, "You can only allocate tickets to your direct recruits");
      const mine = await client.query("SELECT qty FROM opp_allocations WHERE staff_id=$1 AND tier_name=$2", [me.id, tierName]);
      const others = await client.query("SELECT COALESCE(SUM(a.qty),0)::INT AS n FROM opp_allocations a JOIN opp_staff s ON s.id=a.staff_id WHERE s.parent_id=$1 AND a.tier_name=$2 AND a.staff_id <> $3", [me.id, tierName, staffId]);
      const cap = mine.rows.length ? mine.rows[0].qty : 0;
      if (others.rows[0].n + qty > cap) throw httpError(400, `You can allocate at most ${Math.max(0, cap - others.rows[0].n)} more ${tierName} tickets (your allocation is ${cap})`);
      const a = await client.query(
        `INSERT INTO opp_allocations (id, event_id, staff_id, allocated_by, tier_name, qty, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (staff_id, tier_name) DO UPDATE SET qty=EXCLUDED.qty, unit_price=EXCLUDED.unit_price, updated_at=NOW() RETURNING *`,
        [rid("ALC"), ev.id, staffId, me.id, tierName, qty, unitPrice]);
      await audit(client, `staff:${me.id}`, "allocation.set", "opp_allocations", a.rows[0].id, { staffId, tierName, qty, unitPrice });
      return a.rows[0];
    });
    res.json({ allocation: { staffId: out.staff_id, tierName: out.tier_name, qty: out.qty, unitPrice: Number(out.unit_price) } });
  }));

  // Staff buys stock from their parent (or the organizer for primary staff), within their allocation.
  app.post("/v2/staff/m/:memberId/purchases", requireOppStaff, wrap(async (req, res) => {
    const me = req.member;
    const qty = parseInt(req.body.qty, 10); const tierName = String(req.body.tierName || "");
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, me.event_id);
      const s = settingsOf(ev);
      if (!tierOf(ev, tierName)) throw httpError(400, "Ticket category not found");
      if (!Number.isInteger(qty) || qty < s.minPurchase || qty > s.maxPurchase) throw httpError(400, `Purchase between ${s.minPurchase} and ${s.maxPurchase} tickets at a time`);
      // Allocation is optional: if set it is a quota + special price; otherwise staff buy at the event ticket price.
      const a = await client.query("SELECT * FROM opp_allocations WHERE staff_id=$1 AND tier_name=$2", [me.id, tierName]);
      const alloc = a.rows.length && a.rows[0].qty > 0 ? a.rows[0] : null;
      if (alloc) {
        const used = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_purchases WHERE buyer_staff_id=$1 AND tier_name=$2 AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))", [me.id, tierName]);
        const quota = alloc.qty - used.rows[0].n;
        if (qty > quota) throw httpError(400, `You can purchase ${Math.max(0, quota)} more ${tierName} tickets within your allocation`);
      } else if (!me.parent_id && s.staffPool > 0) {
        const out = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_purchases WHERE event_id=$1 AND seller_staff_id IS NULL AND (status='paid' OR (status='pending_payment' AND expires_at > NOW()))", [ev.id]);
        if (out.rows[0].n + qty > s.staffPool) throw httpError(400, `Only ${Math.max(0, s.staffPool - out.rows[0].n)} tickets remain in the staff distribution pool`);
      }
      const sellerLeft = me.parent_id ? await staffStock(client, me.parent_id, tierName) : await organizerPoolLeft(client, ev, tierName);
      if (sellerLeft < qty) throw httpError(409, me.parent_id ? `Your parent staff has only ${Math.max(0, sellerLeft)} tickets available — ask them to purchase more first` : `Only ${Math.max(0, sellerLeft)} tickets left with the organizer`);
      const unit = alloc ? Number(alloc.unit_price) : Number(tierOf(ev, tierName).price || 0); const total = money(unit * qty);
      const id = `PUR-${Date.now()}${crypto.randomBytes(2).toString("hex")}`;
      const p = await client.query(
        `INSERT INTO opp_purchases (id, event_id, buyer_staff_id, seller_staff_id, tier_name, qty, unit_price, total, status, payment_txnid, expires_at, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + INTERVAL '${PURCHASE_MINUTES} minutes', $11) RETURNING *`,
        [id, ev.id, me.id, me.parent_id, tierName, qty, unit, total, total === 0 ? "paid" : "pending_payment", total === 0 ? null : id, total === 0 ? new Date() : null]);
      await audit(client, `staff:${me.id}`, "purchase.created", "opp_purchases", id, { qty, tierName, total });
      return p.rows[0];
    });
    res.status(201).json({ purchase: { id: out.id, qty: out.qty, tierName: out.tier_name, total: Number(out.total), status: out.status }, payment: out.status === "paid" ? { mode: "free" } : paymentMode() });
  }));

  app.post("/v2/staff/m/:memberId/purchases/:pid/confirm", requireOppStaff, wrap(async (req, res) => {
    const me = req.member;
    const out = await tx(async (client) => {
      await lockEvent(client, me.event_id);
      const p = await client.query("SELECT * FROM opp_purchases WHERE id=$1 AND buyer_staff_id=$2 FOR UPDATE", [req.params.pid, me.id]);
      if (!p.rows.length) throw httpError(404, "Purchase not found");
      const row = p.rows[0];
      if (row.status === "paid") return row;
      if (row.status !== "pending_payment") throw httpError(409, `Purchase is ${row.status}`);
      const txn = await verifiedPayment(client, row.id, row.total);
      if (!txn) throw httpError(402, "Payment has not been verified for this purchase yet");
      const u = await client.query("UPDATE opp_purchases SET status='paid', paid_at=NOW() WHERE id=$1 RETURNING *", [row.id]);
      await audit(client, `staff:${me.id}`, "purchase.paid", "opp_purchases", row.id, { txnid: txn.txnid, total: row.total });
      return u.rows[0];
    });
    res.json({ purchase: { id: out.id, qty: out.qty, tierName: out.tier_name, total: Number(out.total), status: out.status } });
  }));

  /* ======================================================================= */
  /* Organizer: Opportunity management + analytics                           */
  /* ======================================================================= */
  app.get("/v2/creator/events/:id/opportunity", requireCreatorV2, wrap(async (req, res) => {
    const ev = await ownedOppEvent(pool, req.creator.sub, req.params.id);
    const staff = (await pool.query("SELECT * FROM opp_staff WHERE event_id=$1 ORDER BY depth, created_at", [ev.id])).rows;
    const prog = await progressFor(pool, staff.map((s) => s.id));
    const codeById = Object.fromEntries(staff.map((s) => [s.id, s.staff_code]));
    const allocs = (await pool.query("SELECT * FROM opp_allocations WHERE event_id=$1", [ev.id])).rows;
    const purchases = (await pool.query(
      `SELECT p.*, b.display_name AS buyer_name, b.staff_code AS buyer_code, s.staff_code AS seller_code FROM opp_purchases p
       JOIN opp_staff b ON b.id=p.buyer_staff_id LEFT JOIN opp_staff s ON s.id=p.seller_staff_id
       WHERE p.event_id=$1 AND p.status IN ('paid','pending_payment') ORDER BY p.created_at DESC`, [ev.id])).rows;
    const bookings = (await pool.query(
      `SELECT b.id, b.buyer_name, b.ticket_type, b.qty, b.price, b.total, b.booked_at, b.payment_status, s.staff_code, s.display_name AS staff_name
       FROM bookings b LEFT JOIN opp_staff s ON s.id=b.opp_staff_id WHERE b.event_id=$1 AND b.status <> 'refunded' ORDER BY b.booked_at DESC`, [ev.id])).rows;
    const s = settingsOf(ev);
    const totalTickets = (ev.tickets || []).reduce((a, t) => a + Number(t.qty || 0), 0);
    const allocated = allocs.filter((a) => a.allocated_by === "organizer").reduce((a, x) => a + x.qty, 0);
    const purchasedFromOrganizer = purchases.filter((p) => !p.seller_staff_id && p.status === "paid").reduce((a, p) => a + p.qty, 0);
    const sold = bookings.reduce((a, b) => a + b.qty, 0);
    res.json({
      event: { id: ev.id, name: ev.name, date: ev.event_date, time: ev.start_time, venue: ev.venue, city: ev.city, banner: ev.banner_url, tickets: ev.tickets, status: ev.status },
      settings: s,
      totals: {
        totalTickets, allocated, purchased: purchasedFromOrganizer, sold, remaining: totalTickets - sold,
        organizerPool: totalTickets - purchases.filter((p) => !p.seller_staff_id && (p.status === "paid" || new Date(p.expires_at) > new Date())).reduce((a, p) => a + p.qty, 0),
        bookings: bookings.length, revenue: money(bookings.reduce((a, b) => a + Number(b.total), 0)),
        ticketSales: money(bookings.reduce((a, b) => a + Number(b.price) * b.qty, 0)),
        staffPurchaseRevenue: money(purchases.filter((p) => !p.seller_staff_id && p.status === "paid").reduce((a, p) => a + Number(p.total), 0)),
        pendingStaffPayments: purchases.filter((p) => p.status === "pending_payment").length,
        staffCount: staff.length, primaryStaff: staff.filter((x) => !x.parent_id).length,
      },
      staff: staff.map((x) => ({ ...publicStaff(x, prog[x.id], { parentCode: codeById[x.parent_id] }), referralCode: x.referral_code })),
      allocations: allocs.map((a) => ({ staffId: a.staff_id, tierName: a.tier_name, qty: a.qty, unitPrice: Number(a.unit_price), allocatedBy: a.allocated_by === "organizer" ? "organizer" : codeById[a.allocated_by] })),
      purchases: purchases.map((p) => ({ id: p.id, buyer: `${p.buyer_name} (${p.buyer_code})`, seller: p.seller_code || "Organizer", tierName: p.tier_name, qty: p.qty, total: Number(p.total), status: p.status, createdAt: p.created_at, paidAt: p.paid_at })),
      bookings: bookings.map((b) => ({ id: b.id, buyer: b.buyer_name, tier: b.ticket_type, qty: b.qty, amount: Number(b.price) * b.qty, total: Number(b.total), staff: b.staff_code ? `${b.staff_name} (${b.staff_code})` : "Direct", payment: b.payment_status, at: b.booked_at })),
    });
  }));

  app.patch("/v2/creator/events/:id/opportunity", requireCreatorV2, wrap(async (req, res) => {
    const ev = await ownedOppEvent(pool, req.creator.sub, req.params.id);
    const cur = settingsOf(ev); const b = req.body || {};
    const next = {
      ...cur,
      ...(b.recruitmentEnabled !== undefined ? { recruitmentEnabled: !!b.recruitmentEnabled } : {}),
      ...(b.staffPool !== undefined ? { staffPool: Math.max(0, parseInt(b.staffPool, 10) || 0) } : {}),
      ...(b.maxDepth !== undefined ? { maxDepth: Math.min(10, Math.max(1, parseInt(b.maxDepth, 10) || 4)) } : {}),
      ...(b.maxDirectRecruits !== undefined ? { maxDirectRecruits: Math.max(1, parseInt(b.maxDirectRecruits, 10) || 25) } : {}),
      ...(b.commissionRate !== undefined ? { commissionRate: Math.min(100, Math.max(0, Number(b.commissionRate) || 0)) } : {}),
      ...(b.regenerateCode ? { recruitCode: code(10) } : {}),
    };
    await pool.query("UPDATE creator_events SET opp_settings=$1 WHERE id=$2", [JSON.stringify(next), ev.id]);
    res.json({ settings: next });
  }));

  // Organizer adds a primary staff member (creates or links the customer account).
  app.post("/v2/creator/events/:id/staff", requireCreatorV2, wrap(async (req, res) => {
    const { name, email, phone } = req.body || {};
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, req.params.id);
      if (Number(ev.creator_id) !== Number(req.creator.sub)) throw httpError(404, "Event not found for this organizer");
      if (!isOpp(ev)) throw httpError(400, "Staff features are only available for Opportunity events");
      if (!name || String(name).trim().length < 2) throw httpError(400, "Enter the staff member's name");
      const tempPassword = `Bee${code(6, "abcdefghjkmnpqrstuvwxyz23456789")}9`;
      const { user, created } = await findOrCreateUser(client, { name, email, phone, password: tempPassword, allowExistingWithoutPassword: true });
      const m = await createMembership(client, { ev, parent: null, userId: user.id, name });
      return { m, created, tempPassword, email: user.email };
    });
    res.status(201).json({ staff: publicStaff(out.m), login: { email: out.email, ...(out.created ? { tempPassword: out.tempPassword } : { existingAccount: true }) } });
  }));

  // Organizer allocates tickets (quota + price) to a PRIMARY staff member.
  app.post("/v2/creator/events/:id/allocations", requireCreatorV2, wrap(async (req, res) => {
    const { staffId, tierName } = req.body || {};
    const qty = parseInt(req.body.qty, 10); const unitPrice = Number(req.body.unitPrice);
    if (!Number.isInteger(qty) || qty < 0) return fail(res, 400, "Enter a valid quantity");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail(res, 400, "Enter a valid price");
    const out = await tx(async (client) => {
      const ev = await lockEvent(client, req.params.id);
      if (Number(ev.creator_id) !== Number(req.creator.sub)) throw httpError(404, "Event not found for this organizer");
      const tier = tierOf(ev, tierName);
      if (!tier) throw httpError(400, "Ticket category not found");
      const st = await client.query("SELECT * FROM opp_staff WHERE id=$1 AND event_id=$2 AND parent_id IS NULL AND status='active'", [staffId, ev.id]);
      if (!st.rows.length) throw httpError(400, "The organizer allocates to primary staff only; primary staff allocate to their recruits");
      const others = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_allocations WHERE event_id=$1 AND allocated_by='organizer' AND tier_name=$2 AND staff_id <> $3", [ev.id, tierName, staffId]);
      const allTiers = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_allocations WHERE event_id=$1 AND allocated_by='organizer' AND staff_id <> $2", [ev.id, staffId]);
      if (others.rows[0].n + qty > Number(tier.qty)) throw httpError(400, `Only ${Math.max(0, tier.qty - others.rows[0].n)} ${tierName} tickets remain unallocated`);
      const pool_ = settingsOf(ev).staffPool;
      if (pool_ > 0) {
        const mineOther = await client.query("SELECT COALESCE(SUM(qty),0)::INT AS n FROM opp_allocations WHERE staff_id=$1 AND tier_name <> $2", [staffId, tierName]);
        if (allTiers.rows[0].n + mineOther.rows[0].n + qty > pool_) throw httpError(400, `Staff distribution pool is ${pool_} tickets — ${Math.max(0, pool_ - allTiers.rows[0].n - mineOther.rows[0].n)} left`);
      }
      const a = await client.query(
        `INSERT INTO opp_allocations (id, event_id, staff_id, allocated_by, tier_name, qty, unit_price) VALUES ($1,$2,$3,'organizer',$4,$5,$6)
         ON CONFLICT (staff_id, tier_name) DO UPDATE SET qty=EXCLUDED.qty, unit_price=EXCLUDED.unit_price, updated_at=NOW() RETURNING *`,
        [rid("ALC"), ev.id, staffId, tierName, qty, unitPrice]);
      await audit(client, `creator:${req.creator.sub}`, "allocation.set", "opp_allocations", a.rows[0].id, { staffId, tierName, qty, unitPrice });
      return a.rows[0];
    });
    res.json({ allocation: { staffId: out.staff_id, tierName: out.tier_name, qty: out.qty, unitPrice: Number(out.unit_price) } });
  }));

  app.get("/v2/creator/events/:id/staff/:staffId", requireCreatorV2, wrap(async (req, res) => {
    const ev = await ownedOppEvent(pool, req.creator.sub, req.params.id);
    const t = await pool.query("SELECT * FROM opp_staff WHERE id=$1 AND event_id=$2", [req.params.staffId, ev.id]);
    if (!t.rows.length) return fail(res, 404, "Staff member not found");
    const target = t.rows[0];
    const down = await descendantsOf(pool, target);
    const prog = await progressFor(pool, [target.id, ...down.map((d) => d.id)]);
    const bookings = await pool.query("SELECT id, buyer_name, ticket_type, qty, price, total, booked_at FROM bookings WHERE opp_staff_id=$1 AND status <> 'refunded' ORDER BY booked_at DESC", [target.id]);
    const payments = await pool.query("SELECT id, tier_name, qty, total, status, paid_at, seller_staff_id FROM opp_purchases WHERE buyer_staff_id=$1 ORDER BY created_at DESC", [target.id]);
    const user = await pool.query("SELECT email, phone FROM users WHERE id=$1", [target.user_id]);
    res.json({
      staff: { ...publicStaff(target, prog[target.id]), email: user.rows[0] && user.rows[0].email, phone: user.rows[0] && user.rows[0].phone },
      team: down.map((d) => ({ ...publicStaff(d, prog[d.id]), isDirect: d.parent_id === target.id })),
      bookings: bookings.rows.map((b) => ({ id: b.id, buyer: b.buyer_name, tier: b.ticket_type, qty: b.qty, amount: Number(b.price) * b.qty, at: b.booked_at })),
      payments: payments.rows.map((p) => ({ id: p.id, tier: p.tier_name, qty: p.qty, total: Number(p.total), status: p.status, paidAt: p.paid_at, to: p.seller_staff_id ? "Parent staff" : "Organizer" })),
    });
  }));

  return { initDb, normalizeEventInput, planGate };
};
