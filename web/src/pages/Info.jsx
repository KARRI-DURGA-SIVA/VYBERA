import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { cityOf } from '../lib/utils';

export function About() {
  const { events } = useApp();
  const n = useMemo(() => ({
    events: (events || []).length,
    tickets: (events || []).reduce((s, e) => s + (e.bookingCount || 0), 0),
    cities: new Set((events || []).map(cityOf)).size,
    creators: new Set((events || []).map((e) => e.creatorId)).size,
  }), [events]);

  return (
    <>
      <div className="wrap">
        <div className="about-hero">
          <div className="reveal">
            <span className="eyebrow">About BEE-OAK</span>
            <h1 style={{ marginTop: 14 }}>Live experiences, <em>made effortless.</em></h1>
            <p className="muted" style={{ fontSize: 18, marginTop: 18, maxWidth: 560 }}>
              BEE-OAK connects people with the events that make a city come alive — and gives creators everything they need to host them. Like a hive, every piece works together: discovery, booking, payments and entry.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              <Link to="/explore" className="btn btn-primary btn-lg">Explore events</Link>
              <Link to="/contact?topic=creator" className="btn btn-ghost btn-lg">Host with us</Link>
            </div>
          </div>
          <div className="about-art reveal reveal-2"><img src="/logo.png" alt="BEE-OAK emblem" /></div>
        </div>
        <div className="numbers">
          <div><b>{n.events}</b><small>Live events right now</small></div>
          <div><b>{n.tickets}+</b><small>Tickets booked</small></div>
          <div><b>{n.cities}</b><small>Cities and growing</small></div>
          <div><b>{n.creators}</b><small>Active creators</small></div>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <div className="section-head"><div><h2>What we stand for</h2><p>Principles behind every screen of BEE-OAK</p></div></div>
          <div className="feat-grid">
            <div className="feat"><div className="ic"><Icon name="bolt" size={22} /></div><h3>Fast by default</h3><p>From discovery to a confirmed QR ticket in under a minute, on any device.</p></div>
            <div className="feat"><div className="ic"><Icon name="shield" size={22} /></div><h3>Secure & transparent</h3><p>Payments via PayU, a clear 8% convenience fee and GST shown before you pay — no surprises.</p></div>
            <div className="feat"><div className="ic"><Icon name="users" size={22} /></div><h3>Built for creators</h3><p>Tiered tickets, staff referrals, live analytics and gate scanning — all in the BEE-OAK app.</p></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="band">
            <div><h2>Take BEE-OAK with you</h2><p>The BEE-OAK app keeps your tickets offline-ready and lets creators scan entries at the gate.</p></div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Link to="/register" className="btn btn-gold btn-lg">Create free account</Link>
              <Link to="/help" className="btn btn-lg" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.3)' }}>How it works</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function Contact() {
  const { user, notify } = useApp();
  const [params] = useSearchParams();
  const [f, setF] = useState({ name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '', email: user?.email || '', topic: params.get('topic') === 'creator' ? 'Become a creator' : 'Booking support', message: '' });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = 'Enter a valid email';
    if (f.message.trim().length < 10) er.message = 'Tell us a little more (at least 10 characters)';
    setErrors(er);
    if (Object.keys(er).length) return;
    // No contact endpoint exists on the BEE-OAK API, so hand off to the user's mail client.
    const body = `${f.message}\n\n— ${f.name} (${f.email})`;
    window.location.href = `mailto:support@vybera.in?subject=${encodeURIComponent('[BEE-OAK web] ' + f.topic)}&body=${encodeURIComponent(body)}`;
    setSent(true);
    notify('Opening your email app…');
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <span className="eyebrow">Contact</span>
        <h1 style={{ marginTop: 10 }}>We’re here to help</h1>
        <p>Questions about a booking, payments, or hosting your own event? Reach the BEE-OAK team.</p>
      </div>
      <div className="contact-grid">
        <div>
          <div className="contact-card"><div className="ic"><Icon name="mail" /></div><div><b>Email support</b><small>Replies within 24 hours</small><a className="link" href="mailto:support@vybera.in">support@vybera.in</a></div></div>
          <div className="contact-card"><div className="ic"><Icon name="help" /></div><div><b>Help centre</b><small>Instant answers to common questions</small><Link className="link" to="/help">Browse articles →</Link></div></div>
          <div className="contact-card"><div className="ic"><Icon name="users" /></div><div><b>Creators & partnerships</b><small>Host events, sell tickets, manage staff</small><span className="muted" style={{ fontSize: 14 }}>Choose “Become a creator” in the form</span></div></div>
          <div className="contact-card"><div className="ic"><Icon name="clock" /></div><div><b>Support hours</b><small>Monday – Sunday</small><span style={{ fontSize: 14 }}>9:00 AM – 9:00 PM IST</span></div></div>
        </div>
        <form className="panel" onSubmit={submit} noValidate>
          <h3>Send us a message</h3>
          {sent && <div className="alert ok" style={{ marginBottom: 18 }}><Icon name="check" /> Your email app should open with this message ready to send. Not working? Write to support@vybera.in.</div>}
          <div className="form-grid">
            <div className="field"><label htmlFor="c-n">Name</label><input id="c-n" className={`input${errors.name ? ' err' : ''}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{errors.name && <span className="field-err">{errors.name}</span>}</div>
            <div className="field"><label htmlFor="c-e">Email</label><input id="c-e" type="email" className={`input${errors.email ? ' err' : ''}`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />{errors.email && <span className="field-err">{errors.email}</span>}</div>
            <div className="field full"><label htmlFor="c-t">Topic</label>
              <select id="c-t" className="input select" style={{ height: 50 }} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
                {['Booking support', 'Payment or refund', 'Ticket / QR issue', 'Account & login', 'Become a creator', 'Something else'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field full"><label htmlFor="c-m">Message</label><textarea id="c-m" className={`input${errors.message ? ' err' : ''}`} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Include your booking ID if this is about a ticket" />{errors.message && <span className="field-err">{errors.message}</span>}</div>
          </div>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 22 }}>Send message <Icon name="arrowR" size={16} /></button>
        </form>
      </div>
    </div>
  );
}

const FAQ = {
  Booking: [
    ['How do I book tickets?', 'Open any event, choose a ticket tier and quantity (up to 4 per booking), then complete checkout. Your QR ticket is issued immediately.'],
    ['Can I book for friends?', 'Yes. Select the quantity you need — one QR admits the whole group, so arrive together.'],
    ['Do I need an account?', 'Yes, signing in lets us save your tickets to My Bookings so you can access them on any device.'],
  ],
  Payments: [
    ['Which payment methods are accepted?', 'UPI, credit and debit cards, net banking and wallets — processed securely by PayU.'],
    ['What fees will I pay?', 'An 8% convenience fee on the ticket subtotal plus 18% GST on that fee. The full breakdown is shown before you pay. Free events have no fees.'],
    ['My payment failed but money was deducted', 'Failed payments are automatically reversed by your bank within 5–7 working days. If it doesn’t arrive, contact us with your booking ID.'],
  ],
  Tickets: [
    ['Where is my ticket?', 'Go to My Bookings and open the booking to see your QR code. You can also download it as an image.'],
    ['How does entry work?', 'Show the QR at the gate. Event staff scan it with the BEE-OAK app; each QR can be checked in once.'],
    ['Can I transfer my ticket?', 'Tickets are linked to the holder’s name. Reach out to support if you need to change the holder.'],
  ],
  Account: [
    ['I forgot my password', 'Use “Forgot password?” on the sign-in page. We’ll email you a secure reset link.'],
    ['How do I update my name or city?', 'Go to Profile & settings → Personal details and save your changes.'],
    ['Why verify my mobile number?', 'OTP verification keeps accounts secure and lets us send ticket updates to the right person.'],
  ],
};
const HELP_ICONS = { Booking: 'ticket', Payments: 'card', Tickets: 'qr', Account: 'user' };

export function Help() {
  const [cat, setCat] = useState('Booking');
  const [open, setOpen] = useState(0);
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return FAQ[cat];
    return Object.values(FAQ).flat().filter(([a, b]) => (a + b).toLowerCase().includes(s));
  }, [cat, q]);

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div className="page-head" style={{ textAlign: 'center' }}>
        <span className="eyebrow">Help centre</span>
        <h1 style={{ marginTop: 10 }}>How can we help?</h1>
        <div className="search" style={{ margin: '26px auto 0', display: 'block', maxWidth: 560 }}>
          <Icon name="search" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(0); }} placeholder="Search help articles" style={{ height: 54, borderRadius: 999 }} aria-label="Search help" />
        </div>
      </div>
      {!q && (
        <div className="help-cats" style={{ marginBottom: 36 }}>
          {Object.keys(FAQ).map((k) => (
            <button key={k} className={`help-cat${cat === k ? ' on' : ''}`} onClick={() => { setCat(k); setOpen(0); }}>
              <div className="ic"><Icon name={HELP_ICONS[k]} size={24} /></div><b>{k}</b><small>{FAQ[k].length} articles</small>
            </button>
          ))}
        </div>
      )}
      <div className="panel" style={{ padding: '8px 28px' }}>
        {items.length ? items.map(([qq, a], i) => (
          <div key={qq} className={`faq${open === i ? ' open' : ''}`}>
            <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}><span>{qq}</span><span>+</span></button>
            <div className="faq-a"><div>{a}</div></div>
          </div>
        )) : <p className="muted" style={{ padding: '28px 0' }}>No articles match “{q}”.</p>}
      </div>
      <div className="band" style={{ marginTop: 40 }}>
        <div><h2>Still need help?</h2><p>Our support team replies within 24 hours.</p></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Link to="/contact" className="btn btn-gold btn-lg">Contact support</Link></div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="wrap section">
      <div className="empty">
        <div className="ic"><Icon name="search" size={28} /></div>
        <h3>Page not found</h3>
        <p>The page you’re looking for doesn’t exist or has moved.</p>
        <Link to="/" className="btn btn-primary">Back to home</Link>
      </div>
    </div>
  );
}
