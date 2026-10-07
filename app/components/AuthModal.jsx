// ─────────────────────────────────────────────────────────────────────────────
// TALKS TO THE YELO BACKEND. Restyle it freely; keep the API calls.
//
// The markup, classes and copy in here are yours to change. The fetches, the
// field names and the order of the bill/order/payment calls are a contract with
// the YELO API — if they change, this still renders but stops working, and the
// failure shows up at the till rather than in the build.
//
// Endpoints and payloads: docs/YELO_API_REFERENCE.md
// ─────────────────────────────────────────────────────────────────────────────
'use client';
// Customer auth — phone OTP (primary) + email/password. Talks to /api/auth,
// which injects the tenant envelope server-side and calls the marketplace
// vendor endpoints. On success, stores the session (vendor_id + access_token).
import { useState } from 'react';
import Link from 'next/link';
import { setSession } from '../lib/session';
import { phoneNo, sessionFromLogin } from '../lib/auth';
import { apiPath } from '../lib/apiPath';

async function authCall(action, fields) {
  const r = await fetch(apiPath('/api/auth'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...fields }),
  });
  return r.json();
}

export default function AuthModal({ open, onClose, onAuthed }) {
  const [mode, setMode] = useState('phone');   // 'phone' | 'email'
  const [step, setStep] = useState('enter');    // 'enter' | 'otp'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!open) return null;
  const err = (m) => setMsg({ type: 'error', text: m });

  function done(data) {
    // The customer id is at data.vendor_details.vendor_id, not data.vendor_id.
    // Reading the top level left vendorId undefined and every later call went
    // out as a guest on a signed-in session. sessionFromLogin handles both.
    setSession(sessionFromLogin(data, { name, phone, email }));
    onAuthed?.();
  }

  async function sendOtp() {
    if (!/^\d{10}$/.test(phone)) return err('Enter a 10-digit phone number');
    setBusy(true); setMsg(null);
    // `phone` ONLY. The customer/* endpoints validate with Joi and reject
    // unknown keys — phone_no and country_code are not in their schemas.
    const r = await authCall('send-otp', { phone, is_login: 1 });
    setBusy(false);
    if (r.status === 200 || r.status === 201) { setStep('otp'); setMsg({ type: 'ok', text: 'OTP sent to your phone' }); }
    else err(r.message || 'Could not send OTP');
  }

  async function verifyOtp() {
    setBusy(true); setMsg(null);
    // Same schema, same rule. `name` is not accepted here either — it is
    // carried on signup, not on OTP verification.
    const r = await authCall('verify-otp', { phone, otp });
    setBusy(false);
    if (r.status === 200 && r.data?.access_token) done(r.data);
    else err(r.message || 'Invalid code');
  }

  async function emailAuth() {
    setBusy(true); setMsg(null);
    const r = await authCall(signup ? 'signup' : 'login',
      // marketplace_vendor_login/signup DO read phone_no, and it must contain a
      // space: extractPhoneNumber (marketplace.js:5708) does split(" ")[1] and
      // throws a 500 without one.
      signup ? { email, password, name, phone_no: phoneNo('91', phone), country_code: '91' } : { email, password });
    setBusy(false);
    if (r.status === 200 && r.data?.access_token) done(r.data);
    else err(r.message || (signup ? 'Could not sign up' : 'Wrong email or password'));
  }

  return (
    <div className="auth-scrim" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <button className="auth-x" onClick={onClose} aria-label="Close">×</button>
        <div className="auth-h">Welcome</div>
        <div className="auth-sub">Sign in to order and track deliveries.</div>

        <div className="auth-switch">
          <button className={mode === 'phone' ? 'on' : ''} onClick={() => { setMode('phone'); setStep('enter'); setMsg(null); }}>Phone</button>
          <button className={mode === 'email' ? 'on' : ''} onClick={() => { setMode('email'); setMsg(null); }}>Email</button>
        </div>

        {/* This is the customer sign-in/up modal — teaching is a different
            account entirely (a real merchant signup, see TeacherOnboarding.jsx),
            so this is a way out of this modal into that flow, not another mode
            of it. Closes this modal on click so it doesn't sit open over the
            page it navigates to. */}
        <p className="auth-become">
          Want to teach here instead?{' '}
          <Link href="/p/teacher-onboarding" onClick={onClose}>Become a teacher</Link>
        </p>

        {mode === 'phone' && step === 'enter' && (
          <>
            <label className="auth-l">Phone number</label>
            <div className="auth-phone">
              <span className="auth-cc">+91</span>
              <input className="auth-in" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="9876543210" autoFocus />
            </div>
            <input className="auth-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (for new accounts)" />
            {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}
            <button className="auth-go" disabled={busy} onClick={sendOtp}>{busy ? 'Sending…' : 'Send OTP'}</button>
          </>
        )}

        {mode === 'phone' && step === 'otp' && (
          <>
            <label className="auth-l">Enter the 6-digit code sent to +91 {phone}</label>
            <input className="auth-in otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus />
            {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}
            <button className="auth-go" disabled={busy || otp.length < 4} onClick={verifyOtp}>{busy ? 'Verifying…' : 'Verify & continue'}</button>
            <button className="auth-back" onClick={() => setStep('enter')}>← Change number</button>
          </>
        )}

        {mode === 'email' && (
          <>
            {signup && <input className="auth-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />}
            <input className="auth-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoFocus />
            <input className="auth-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            {signup && (
              <div className="auth-phone">
                <span className="auth-cc">+91</span>
                <input className="auth-in" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Phone" />
              </div>
            )}
            {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}
            <button className="auth-go" disabled={busy} onClick={emailAuth}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
            <button className="auth-back" onClick={() => { setSignup(!signup); setMsg(null); }}>
              {signup ? 'Have an account? Sign in' : 'New here? Create an account'}
            </button>
          </>
        )}

        <style>{`
          .auth-become{ margin:14px 0 0; text-align:center; font-size:.82rem; color:var(--brand-ink-soft, inherit); }
          .auth-become a{ font-weight:650; color:var(--brand-accent, inherit); text-decoration:underline; text-underline-offset:2px; }
          .auth-become a:hover{ filter:brightness(1.06); }
        `}</style>
      </div>
    </div>
  );
}
