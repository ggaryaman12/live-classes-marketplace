'use client';
// Customer auth modal — Login (password or phone-OTP) + Signup.
// Talks only to /api/auth (our server proxy), which adds the tenant envelope.
// On success we stash the vendor session in localStorage (POC-grade) and close.
import { useState } from 'react';
import { apiPath } from './lib/apiPath';

async function callAuth(action, fields) {
  const res = await fetch(apiPath('/api/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...fields }),
  });
  return res.json(); // { status, message, data }
}

function saveSession(data) {
  const v = data?.vendor_details || {};
  localStorage.setItem(
    'yelo_customer',
    JSON.stringify({
      vendor_id: v.vendor_id,
      access_token: data.access_token || data.app_access_token,
      first_name: v.first_name,
      email: v.email,
    })
  );
  // Notify other components (e.g. StoreList) that the session changed.
  window.dispatchEvent(new Event('yelo-auth'));
}

export default function AuthModal({ open, onClose, onAuthed }) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'otp'
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind:'error'|'ok', text }
  const [f, setF] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    country_code: '91',
    phone_number: '',
    otp: '',
  });

  if (!open) return null;

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const fail = (text) => setMsg({ kind: 'error', text });

  const done = (data) => {
    saveSession(data);
    onAuthed?.(data.vendor_details);
    onClose();
  };

  async function submitLoginPassword(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const creds = f.email.includes('@')
      ? { email: f.email }
      : { phone_no: `+${f.country_code} ${f.phone_number}` };
    const r = await callAuth('login', { ...creds, password: f.password });
    setBusy(false);
    if (r.status === 200) return done(r.data);
    fail(r.message || 'Login failed');
  }

  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await callAuth('send-otp', {
      phone_number: f.phone_number,
      country_code: f.country_code,
    });
    setBusy(false);
    if (r.status === 200) {
      setOtpSent(true);
      setMsg({ kind: 'ok', text: 'Code sent — check your phone.' });
    } else fail(r.message || 'Could not send code');
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await callAuth('verify-otp', {
      phone_number: f.phone_number,
      country_code: f.country_code,
      otp: f.otp,
    });
    setBusy(false);
    if (r.status === 200) return done(r.data);
    fail(r.message || 'Invalid code');
  }

  async function submitSignup(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await callAuth('signup', {
      first_name: f.first_name,
      last_name: f.last_name,
      email: f.email,
      password: f.password,
      country_code: f.country_code,
      phone_number: f.phone_number,
      phone_no: `+${f.country_code} ${f.phone_number}`,
    });
    setBusy(false);
    if (r.status === 200) return done(r.data);
    fail(r.message || 'Signup failed');
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="auth-x" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="auth-tabs">
          <button
            className={tab === 'login' ? 'on' : ''}
            onClick={() => {
              setTab('login');
              setMsg(null);
            }}
          >
            Sign in
          </button>
          <button
            className={tab === 'signup' ? 'on' : ''}
            onClick={() => {
              setTab('signup');
              setMsg(null);
            }}
          >
            Create account
          </button>
        </div>

        <h2 className="auth-title">
          {tab === 'login' ? 'Welcome back' : 'Join the marketplace'}
        </h2>

        {msg && <div className={`auth-msg ${msg.kind}`}>{msg.text}</div>}

        {tab === 'login' && (
          <>
            <div className="auth-seg">
              <button
                className={loginMode === 'password' ? 'on' : ''}
                onClick={() => {
                  setLoginMode('password');
                  setMsg(null);
                }}
              >
                Password
              </button>
              <button
                className={loginMode === 'otp' ? 'on' : ''}
                onClick={() => {
                  setLoginMode('otp');
                  setOtpSent(false);
                  setMsg(null);
                }}
              >
                Phone OTP
              </button>
            </div>

            {loginMode === 'password' ? (
              <form onSubmit={submitLoginPassword}>
                <input
                  className="auth-in"
                  placeholder="Email or phone number"
                  value={f.email}
                  onChange={set('email')}
                  autoFocus
                />
                <input
                  className="auth-in"
                  type="password"
                  placeholder="Password"
                  value={f.password}
                  onChange={set('password')}
                />
                <button className="auth-submit" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={otpSent ? verifyOtp : sendOtp}>
                <div className="auth-phone">
                  <input
                    className="auth-in cc"
                    placeholder="91"
                    value={f.country_code}
                    onChange={set('country_code')}
                  />
                  <input
                    className="auth-in"
                    placeholder="Phone number"
                    value={f.phone_number}
                    onChange={set('phone_number')}
                  />
                </div>
                {otpSent && (
                  <input
                    className="auth-in"
                    placeholder="Enter OTP"
                    value={f.otp}
                    onChange={set('otp')}
                    autoFocus
                  />
                )}
                <button className="auth-submit" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : otpSent
                      ? 'Verify & sign in'
                      : 'Send code'}
                </button>
              </form>
            )}
          </>
        )}

        {tab === 'signup' && (
          <form onSubmit={submitSignup}>
            <div className="auth-row">
              <input
                className="auth-in"
                placeholder="First name"
                value={f.first_name}
                onChange={set('first_name')}
                autoFocus
              />
              <input
                className="auth-in"
                placeholder="Last name"
                value={f.last_name}
                onChange={set('last_name')}
              />
            </div>
            <input
              className="auth-in"
              placeholder="Email"
              value={f.email}
              onChange={set('email')}
            />
            <div className="auth-phone">
              <input
                className="auth-in cc"
                placeholder="91"
                value={f.country_code}
                onChange={set('country_code')}
              />
              <input
                className="auth-in"
                placeholder="Phone number"
                value={f.phone_number}
                onChange={set('phone_number')}
              />
            </div>
            <input
              className="auth-in"
              type="password"
              placeholder="Password"
              value={f.password}
              onChange={set('password')}
            />
            <button className="auth-submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
