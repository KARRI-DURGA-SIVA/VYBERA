import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicUrl } from '../lib/env';

const SOCIAL = {
  Instagram: 'M7.5 2.5h9a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-9a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5Zm4.5 5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.2-1.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z',
  X: 'M3 3h5l4.3 6 5.2-6H20l-6.5 7.6L21 21h-5l-4.6-6.4L5.8 21H3.3l7-8.1L3 3Z',
  YouTube: 'M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z',
  Facebook: 'M14 8.5V6.8c0-.8.5-1 .9-1H17V2.4h-3c-3 0-3.7 2.2-3.7 3.7v2.4H8.5V12h1.8v9.6H14V12h2.6l.4-3.5H14Z',
  LinkedIn: 'M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 9h3v12H3V9Zm6 0h2.9v1.7c.5-.9 1.7-1.9 3.6-1.9 3.6 0 4.5 2.3 4.5 5.4V21h-3v-6c0-1.4-.1-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H9V9Z',
};

const COLS = [
  ['Discover', [['All events', '/explore'], ['Opportunity', '/opportunities'], ['Free events', '/explore?price=free'], ['Near me', '/explore?near=1']]],
  ['Account', [['My bookings', '/bookings'], ['List your event', '/profile?tab=creator'], ['Staff login', '/login?as=staff']]],
  ['Support', [['Help centre', '/help'], ['Contact us', '/contact'], ['About BEE-OAK', '/about']]],
];

// Site footer (shared by every page through Layout).
export default function Footer() {
  const [qr, setQr] = useState('');
  useEffect(() => {
    import('qrcode').then((m) => m.default.toDataURL(publicUrl(), { width: 180, margin: 1, color: { dark: '#04331F', light: '#FFFFFF' } })).then(setQr).catch(() => {});
  }, []);

  return (
    <footer className="fx">
      <div className="wrap">
        <div className="fx-top">
          <div>
            <Link to="/" className="fx-logo" aria-label="BEE-OAK home"><img src="/logo.png" alt="" /><span>BEE<b>·</b>OAK</span></Link>
            <h3>Every great night <em>starts here.</em></h3>
            <div className="fx-cta">
              
            </div>
          </div>
          <div className="fx-qr">
            {qr ? <img src={qr} alt="QR code to open BEE-OAK" /> : <span className="fx-qr-ph" />}
            <span><b>Get the BEE-OAK app</b><small>Scan to download on Android</small></span>
          </div>
        </div>

        <div className="fx-mid">
          {COLS.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h5>{title}</h5>
              {links.map(([t, to]) => <Link key={t} to={to}>{t}</Link>)}
            </nav>
          ))}
          <div className="fx-follow">
            <h5>Follow us</h5>
            <div className="fx-social">
              {Object.entries(SOCIAL).map(([k, d]) => (
                <a key={k} href="#" onClick={(e) => e.preventDefault()} aria-label={`BEE-OAK on ${k}`} title={k}>
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="currentColor" fillRule="evenodd" /></svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="fx-bottom">

          <span className="fx-legal"><Link to="/help">Terms</Link><Link to="/help">Privacy</Link><span></span></span>
        </div>
      </div>

    </footer>
  );
}
