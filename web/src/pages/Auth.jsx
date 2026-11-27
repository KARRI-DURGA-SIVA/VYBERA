import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { IS_SANDBOX, forgotPassword, sendOtp, verifyOtp } from '../lib/api';
import { staffLogin } from '../lib/staff';
import { adminLogin } from '../lib/admin';

function AuthArt({ title, sub }) {
  return (
    <div className="auth-art">
      <Link to="/" className="brand" style={{ position: 'relative' }}>
        <img src="/logo.png" alt="" style={{ background: 'var(--paper)', borderRadius: 10, padding: 4, width: 48, height: 40 }} />
        <span className="brand-name" style={{ color: '#fff' }}>BEE<b>·</b>OAK</span>
      </Link>
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}

const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

function GoogleButton({ to, label = 'Continue with Google' }) {
  const { googleLogin, notify } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const u = await googleLogin();
      notify(`Welcome, ${u.firstName || 'friend'}!`);
      nav(to, { replace: true });
    } catch (ex) { notify(ex.message, 'err'); setBusy(false); }
  };
  return (
    <button type="button" className="btn btn-lg btn-block g-btn" onClick={go} disabled={busy}>
      {busy ? <span className="spinner dark" /> : <GoogleG />}{label}
    </button>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} style={{ paddingRight: 64 }} />
      <button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

const useRedirect = () => {
  const loc = useLocation();
  return loc.state?.from || '/';
};

export function Login() {
  const { user, login, notify } = useApp();
  const nav = useNavigate();
  const to = useRedirect();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'forgot' ? 'forgot' : 'login');
  const [as] = useState(params.get('as') === 'staff' ? 'staff' : 'customer');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  if (user && mode === 'login' && as === 'customer') return <Navigate to={to} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    setBusy(true);
    try {
      if (as === 'staff' && mode === 'login') {
        const d = await staffLogin(id, pw);
        notify(`Welcome back, ${d.user.name.split(' ')[0]}`);
        nav(d.memberships.length === 1 ? `/staff/m/${d.memberships[0].memberId}` : '/staff', { replace: true });
      } else if (mode === 'forgot') {
        const d = await forgotPassword(id.trim());
        setMsg(d.message || 'If that email is registered, a reset link has been sent.');
      } else {
        let u;
        try { u = await login(id, pw); } catch (custErr) {
          // Admin credentials entered on the customer sign-in → open the admin dashboard.
          try { const a = await adminLogin(id, pw); notify(`Signed in as ${a.role || 'admin'}`); nav('/admin', { replace: true }); setBusy(false); return; } catch { throw custErr; }
        }
        notify(`Welcome back, ${u.firstName || 'friend'}!`);
        nav(to, { replace: true });
      }
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <AuthArt title={<>Every great night <em>starts here.</em></>} sub="Sign in to access your tickets, track bookings and check in faster at every BEE-OAK event." />
      <div className="auth-form">
        <div className="auth-card reveal">
          <div className="auth-mbrand m-only"><img src="/logo.png" alt="" /><b>BEE-OAK</b></div>
          {(mode === 'forgot' || as === 'staff') && <>
            <h1>{mode === 'forgot' ? 'Reset password' : 'Staff sign in'}</h1>
            <p>{mode === 'forgot' ? 'Enter your account email and we’ll send a secure reset link.' : 'For Opportunity event staff. Use the account you registered with through your recruitment link.'}</p>
          </>}
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="l-id">{mode === 'forgot' ? 'Email' : 'Email or mobile number'}</label>
              <input id="l-id" className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus />
            </div>
            {mode === 'login' && (
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label htmlFor="l-pw">Password</label>
                  <button type="button" className="link" style={{ border: 0, background: 'none', fontSize: 13 }} onClick={() => { setMode('forgot'); setErr(''); }}>Forgot password?</button>
                </div>
                <PasswordInput id="l-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            {err && <div className="alert err"><Icon name="info" />{err}</div>}
            {msg && <div className="alert ok"><Icon name="check" />{msg}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <span className="spinner" />}{mode === 'forgot' ? 'Send reset link' : as === 'staff' ? 'Sign in to staff dashboard' : 'Sign in'}</button>
            {mode === 'login' && as === 'customer' && <GoogleButton to={to} />}
            {mode === 'forgot' ? (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => { setMode('login'); setMsg(''); }}>Back to sign in</button>
            ) : (
              <>
                <div className="or">New to BEE-OAK?</div>
                <Link to="/register" state={{ from: to }} className="btn btn-ghost btn-lg btn-block">Create an account</Link>
              </>
            )}
            {IS_SANDBOX && <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Existing BEE-OAK app accounts sign in against the live API. Accounts created on this site are kept in a local sandbox.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

export function Register() {
  const { user, signup, notify } = useApp();
  const nav = useNavigate();
  const to = useRedirect();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', city: '', password: '', confirm: '' });
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && step === 1) return <Navigate to={to} replace />;

  const upd = (k) => (e) => {
    setF({ ...f, [k]: k === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value });
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest); // eslint-disable-line no-unused-vars
  };

  const validate = () => {
    const e = {};
    if (f.firstName.trim().length < 2) e.firstName = 'Enter your first name';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email';
    if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (!f.city.trim()) e.city = 'Enter your city';
    if (f.password.length < 8) e.password = 'Use at least 8 characters';
    else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Include letters and numbers';
    if (f.confirm !== f.password) e.confirm = 'Passwords don’t match';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const startOtp = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validate()) return;
    setBusy(true);
    try { await sendOtp(f.phone); setStep(2); } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const finish = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{6}$/.test(otp)) { setErr('Enter the 6-digit code sent to your phone'); return; }
    setBusy(true);
    try {
      const v = await verifyOtp(f.phone, otp);
      const u = await signup({ ...f, otpAccessToken: v.accessToken });
      notify(`Welcome to BEE-OAK, ${u.firstName}!`);
      nav(to, { replace: true });
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  const fld = (k, label, type = 'text', extra = {}) => (
    <div className={`field${extra.full ? ' full' : ''}`}>
      <label htmlFor={`r-${k}`}>{label}</label>
      {k === 'phone' ? (
        <div className="phone-wrap"><span>+91</span><input id="r-phone" className={`input${errors.phone ? ' err' : ''}`} value={f.phone} onChange={upd('phone')} inputMode="numeric" autoComplete="tel-national" /></div>
      ) : type === 'password' ? (
        <PasswordInput id={`r-${k}`} value={f[k]} onChange={upd(k)} autoComplete="new-password" />
      ) : (
        <input id={`r-${k}`} className={`input${errors[k] ? ' err' : ''}`} type={type} value={f[k]} onChange={upd(k)} autoComplete={extra.ac} />
      )}
      {errors[k] && <span className="field-err">{errors[k]}</span>}
    </div>
  );

  return (
    <div className="auth">
      <AuthArt title={<>Join the hive. <em>Book in seconds.</em></>} sub="One account for every concert, show and experience on BEE-OAK — with your QR tickets always in your pocket." />
      <div className="auth-form">
        <div className="auth-card reveal" style={{ maxWidth: 520 }}>
          <div className="auth-mbrand m-only"><img src="/logo.png" alt="" /><b>BEE-OAK</b></div>
          <span className="eyebrow">Step {step} of 2</span>
          <h1 style={{ marginTop: 8 }}>{step === 1 ? 'Create your account' : 'Verify your mobile'}</h1>
          <p>{step === 1 ? 'It takes less than a minute.' : <>We sent a 6-digit code to <b>+91 {f.phone}</b>.{IS_SANDBOX && ' (Sandbox code: 123456)'}</>}</p>
          {step === 1 ? (
            <form onSubmit={startOtp} noValidate>
              <div className="form-grid">
                {fld('firstName', 'First name', 'text', { ac: 'given-name' })}
                {fld('lastName', 'Last name', 'text', { ac: 'family-name' })}
                {fld('email', 'Email', 'email', { full: true, ac: 'email' })}
                {fld('phone', 'Mobile number')}
                {fld('city', 'City', 'text', { ac: 'address-level2' })}
                {fld('password', 'Password', 'password')}
                {fld('confirm', 'Confirm password', 'password')}
              </div>
              {err && <div className="alert err"><Icon name="info" />{err}</div>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <span className="spinner" />}Continue</button>
              <div className="or">or</div>
              <GoogleButton to={to} label="Sign up with Google" />
              <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>Already have an account? <Link to="/login" state={{ from: to }} className="link">Sign in</Link></p>
            </form>
          ) : (
            <form onSubmit={finish} noValidate>
              <div className="field">
                <label htmlFor="r-otp">One-time password</label>
                <input id="r-otp" className="input mono" style={{ fontSize: 24, letterSpacing: '.5em', textAlign: 'center', height: 60 }} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus />
              </div>
              {err && <div className="alert err"><Icon name="info" />{err}</div>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <span className="spinner" />}Verify & create account</button>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="link" style={{ border: 0, background: 'none' }} onClick={() => { setStep(1); setErr(''); setOtp(''); }}>← Edit details</button>
                <button type="button" className="link" style={{ border: 0, background: 'none' }} onClick={async () => { try { await sendOtp(f.phone); notify('A new code has been sent'); } catch (ex) { setErr(ex.message); } }}>Resend code</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
