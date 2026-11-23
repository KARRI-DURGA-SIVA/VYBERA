import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApp } from '../../lib/store';
import { useCreator } from '../../lib/creatorStore';
import { IS_SANDBOX } from '../../lib/api';
import { CREATOR_CATEGORIES, KYC_DOCS, applyCreator } from '../../lib/creator';

export default function CreatorAuth() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'apply' ? 'apply' : 'login';
  const setMode = (m) => setParams(m === 'apply' ? { mode: 'apply' } : {}, { replace: true });

  return (
    <div className="cr-auth">
      <div className="cr-auth-art">
        <span className="eyebrow">BEE-OAK for creators</span>
        <h1>Host it. Sell it. <em>Scan it.</em></h1>
        <p>Publish events with tiered tickets, track revenue behind your finance PIN, add staff and check guests in by QR — everything the BEE-OAK creator app does, now on the web.</p>
        <ul>
          {[['edit', 'Six-step event publishing with banner, venue and ticket tiers'], ['card', 'Revenue & payouts locked behind a 4-digit PIN'], ['qr', 'QR check-in scanner using your laptop camera'], ['users', 'Staff accounts with gates and ticket allocations']].map(([i, t]) => (
            <li key={t}><span><Icon name={i} size={16} /></span>{t}</li>
          ))}
        </ul>
      </div>
      <div className="cr-auth-form">
        <div className="tabs" role="tablist" style={{ marginBottom: 26 }}>
          <button role="tab" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Creator sign in</button>
          <button role="tab" className={mode === 'apply' ? 'on' : ''} onClick={() => setMode('apply')}>Apply for access</button>
        </div>
        {mode === 'login' ? <CreatorLogin onApply={() => setMode('apply')} /> : <CreatorApply onDone={() => setMode('login')} />}
      </div>
    </div>
  );
}

function CreatorLogin({ onApply }) {
  const { login } = useCreator();
  const { notify } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { const c = await login(email, pw); notify(`Welcome to creator mode, ${c.name.split(' ')[0]}`); nav('/creator'); } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="cr-form">
      <h2>Sign in as creator</h2>
      <p className="muted">Use the creator email and password from your approved BEE-OAK creator account.</p>
      <div className="field"><label htmlFor="c-email">Creator email</label><input id="c-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></div>
      <div className="field"><label htmlFor="c-pw">Password</label>
        <div className="pw-wrap"><input id="c-pw" className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ paddingRight: 64 }} /><button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button></div>
      </div>
      {err && <div className="alert err"><Icon name="info" />{err}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <span className="spinner" />}Sign in as creator <Icon name="arrowR" size={16} /></button>
      <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>Not a creator yet? <button type="button" className="link" style={{ border: 0, background: 'none' }} onClick={onApply}>Apply for creator access</button></p>
    </form>
  );
}

function CreatorApply({ onDone }) {
  const { notify } = useApp();
  const [f, setF] = useState({ name: '', email: '', phone: '', category: 'Music', about: '', password: '' });
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await applyCreator(f, files);
      setDone(r);
      notify(r.approved ? 'Creator account ready (sandbox)' : 'Application submitted for review');
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  if (done) return (
    <div className="cr-form" style={{ textAlign: 'center' }}>
      <div className="check" style={{ margin: '0 auto 18px' }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
      <h2>{done.approved ? 'You’re a creator!' : 'Application submitted'}</h2>
      <p className="muted">{done.approved ? 'Sandbox mode approves applications instantly so you can explore creator mode. Sign in with the email and password you just set.' : 'The BEE-OAK team will verify your KYC documents. You can sign in once your account is approved.'}</p>
      <button className="btn btn-primary btn-lg" onClick={onDone}>Go to creator sign in</button>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="cr-form">
      <h2>Apply for creator access</h2>
      <p className="muted">Tell us about you and your events. {IS_SANDBOX ? 'In sandbox mode your application is approved instantly.' : 'Accounts go live after KYC verification.'}</p>
      <div className="form-grid">
        <div className="field full"><label htmlFor="a-name">Full name / brand name</label><input id="a-name" className="input" value={f.name} onChange={upd('name')} /></div>
        <div className="field"><label htmlFor="a-email">Email</label><input id="a-email" type="email" className="input" value={f.email} onChange={upd('email')} /></div>
        <div className="field"><label htmlFor="a-phone">Phone</label><input id="a-phone" className="input" value={f.phone} onChange={upd('phone')} inputMode="tel" /></div>
        <div className="field"><label htmlFor="a-cat">Event type</label><select id="a-cat" className="input select" style={{ height: 50 }} value={f.category} onChange={upd('category')}>{CREATOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="a-pw">Creator password</label><input id="a-pw" type="password" className="input" value={f.password} onChange={upd('password')} autoComplete="new-password" placeholder="At least 8 characters" /></div>
        <div className="field full"><label htmlFor="a-about">About your events</label><textarea id="a-about" className="input" value={f.about} onChange={upd('about')} placeholder="What kind of events do you host, and where?" style={{ minHeight: 96 }} /></div>
      </div>
      <div className="field"><label>KYC documents</label>
        <div className="kyc-grid">
          {KYC_DOCS.map((d) => (
            <label key={d.type} className={`kyc${files[d.type] ? ' on' : ''}`}>
              <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFiles({ ...files, [d.type]: e.target.files[0] || null })} />
              <Icon name={files[d.type] ? 'check' : 'download'} size={18} />
              <span><b>{d.label}</b><small>{files[d.type] ? files[d.type].name : 'Click to upload · JPG, PNG or PDF'}</small></span>
            </label>
          ))}
        </div>
      </div>
      {err && <div className="alert err"><Icon name="info" />{err}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <span className="spinner" />}Submit application & KYC</button>
    </form>
  );
}
