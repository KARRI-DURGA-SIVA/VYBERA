import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/api';

// Home promo banner (below the hero carousel). Real BEE-OAK features only — no invented offers.
const SLIDES = [
  { key: 'host', kicker: 'For creators', title: <>Host your event.<br /><em>Sell out</em> with BEE-OAK</>, cta: 'Start hosting', to: '/profile?tab=creator', pass: 'HOST' },
  { key: 'staff', kicker: 'Opportunity events', title: <>Join as staff.<br /><em>Earn</em> on every ticket</>, cta: 'Explore opportunities', to: '/opportunities', pass: 'STAFF' },
];

function MiniPass({ label }) {
  return (
    <div className="pb-pass" aria-hidden="true">
      <div className="pb-pass-top"><img src="/logo.png" alt="" /><b>BEE·OAK</b><span>{label}</span></div>
      <div className="pb-pass-mid"><i /><i /><i /></div>
      <div className="pb-pass-cut" />
      <div className="pb-pass-bot"><span>ADMIT ONE</span><span className="pb-pass-code" /></div>
    </div>
  );
}

export default function PromoBanner({ events }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 6000); return () => clearInterval(t); }, []);
  const bg = (events || []).find((e) => e.banner)?.banner;
  const s = SLIDES[i];
  return (
    <section className="wrap pb-wrap" aria-label="BEE-OAK for creators and staff">
      <Link to={s.to} className="pb" key={s.key}>
        {bg && <span className="pb-bg" style={{ backgroundImage: `url("${mediaUrl(bg)}")` }} aria-hidden="true" />}
        <span className="pb-shade" aria-hidden="true" />
        <MiniPass label={s.pass} />
        <div className="pb-copy">
          <small>{s.kicker}</small>
          <h3>{s.title}</h3>
          <span className="pb-cta">{s.cta}</span>
        </div>
      </Link>
    </section>
  );
}
