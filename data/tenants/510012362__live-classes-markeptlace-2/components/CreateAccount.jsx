'use client';
/**
 * CreateAccount — a real, working signup form. Built because the header's
 * own "Create account" (chrome/AuthModal.jsx) was failing every real attempt
 * with a generic "Can not process your request at this moment," and this
 * traced the actual cause instead of guessing:
 *
 *  1. `marketplace_vendor_signup`'s handler treats `first_name` as the one
 *     truly mandatory name field (routes/marketplace.js:5991,6052-6058 —
 *     `manData = [marketplace_reference_id, first_name]`, and a blank one
 *     fails with the generic PARAMETER_MISSING text, "Can not process your
 *     request at this moment," english.js:7). The shared AuthModal sends
 *     `name`, never `first_name` — so that field was always blank server
 *     side, on every signup attempt, regardless of what the parent typed.
 *  2. A SECOND, separate gate: `if (domain_name && !opts.token) return
 *     INVALID_ACTION` (routes/marketplace.js:6343-6348), where
 *     `opts.token = req.body.fp || 0`. `fp` is a browser fingerprint the
 *     real client generates via the `get-browser-fingerprint` npm package
 *     (signup.component.ts:764) — not installed in this storefront's bundle
 *     (CLAUDE.md: can't add dependencies), so a lightweight real substitute
 *     is computed here instead: a stable hash of real, available browser
 *     properties (userAgent, screen size, timezone, language,
 *     hardwareConcurrency) — a genuine per-browser fingerprint, not a
 *     placeholder string, verified live to satisfy this same gate.
 *
 * Live-verified end to end with both fixes applied: real 200, "Logged in
 * successfully," a real access_token and vendor_details.
 *
 * Reuses the same real, already-correct helpers the rest of this storefront
 * relies on: `../lib/session` (setSession) and `../lib/auth`
 * (sessionFromLogin, phoneNo) — only the signup FIELD MAPPING was wrong,
 * not those.
 */
import { useState } from 'react';
import { setSession } from '../lib/session';
import { sessionFromLogin, phoneNo } from '../lib/auth';
import { YELO_BASE, YELO_TENANT } from '../lib/yeloTenant';


// A real, stable per-browser fingerprint from properties the browser already
// exposes — not a random or fake value. djb2, a small well-known string hash,
// keeps this dependency-free.
function browserFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(navigator.hardwareConcurrency || ''),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) hash = ((hash << 5) + hash + parts.charCodeAt(i)) >>> 0;
  return `web-${hash.toString(36)}`;
}

export default function CreateAccount({ onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Add your name.');
    if (!email.trim() && !phone.trim()) return setError('Add an email or phone number.');
    if (!password || password.length < 4) return setError('Choose a password (at least 4 characters).');

    setBusy(true);
    try {
      const res = await fetch(`${YELO_BASE}/marketplace_vendor_signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...YELO_TENANT,
          app_type: 'WEB',
          first_name: name.trim(),
          email: email.trim() || undefined,
          password,
          ...(phone.trim() ? { phone_no: phoneNo('91', phone.trim()), country_code: '91' } : {}),
          fp: browserFingerprint(),
        }),
      });
      const j = await res.json();
      // The real response is {status, message, data:{access_token,
      // vendor_details,...}} — sessionFromLogin reads vendor_details/
      // access_token off the object it's given directly, so it needs `j.data`,
      // not the outer envelope. Passing `j` here was a real bug: every field
      // it looks for came back undefined, so it fell through to `null`
      // (guest) for vendorId/token and to the typed `name` fallback for
      // display — a signed-up account that silently behaved like a guest.
      if (j?.status === 200 && j?.data?.access_token) {
        setSession(sessionFromLogin(j.data, { name, email, phone }));
        onCreated?.();
        return;
      }
      setError(j?.message || 'Could not create your account — please try again.');
    } catch {
      setError('Could not reach the server — please try again.');
    }
    setBusy(false);
  }

  return (
    <form className="ca" onSubmit={submit}>
      <input className="ca-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
      <input className="ca-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
      <div className="ca-phone">
        <span className="ca-cc">+91</span>
        <input className="ca-in" inputMode="numeric" maxLength={10} value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Phone (optional if email given)" autoComplete="tel-national" />
      </div>
      <input className="ca-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" />
      {error && <div className="ca-error" role="alert">{error}</div>}
      <button type="submit" className="ca-cta" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <style>{css}</style>
    </form>
  );
}

const css = `
.ca{ display:grid; gap:10px; }
.ca-in{
  width:100%; padding:11px 13px; border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-size:.9rem;
}
.ca-phone{ display:flex; gap:8px; align-items:center; }
.ca-cc{ padding:11px 10px; border:1px solid var(--brand-line); border-radius:var(--radius); color:var(--brand-ink-soft); font-size:.9rem; }
.ca-phone .ca-in{ flex:1; }
.ca-error{ font-size:.82rem; color:var(--brand-accent); background:var(--brand-accent-soft); border-radius:var(--radius); padding:9px 11px; }
.ca-cta{
  padding:11px 20px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-accent); color:var(--brand-accent-ink); font:inherit; font-weight:650; font-size:.9rem;
}
.ca-cta:disabled{ opacity:.6; cursor:default; }
.ca-in:focus-visible, .ca-cta:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
`;
