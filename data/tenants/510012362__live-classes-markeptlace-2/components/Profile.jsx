'use client';
/**
 * Profile — the page the header's own "Hi, {name}" now links straight to
 * (see chrome/Header.jsx). Shows the real signed-in customer (name, email,
 * phone — the same `../lib/session` contract the rest of this storefront
 * already relies on) and is where "Sign out" also lives as a second, always
 * -reachable home for it.
 *
 * SIGNED-OUT STATE ALSO HOSTS A REAL SIGNUP FORM (CreateAccount.jsx) — the
 * header's own "Create account" was silently failing every real attempt
 * (traced and fixed there: a wrong field name plus a missing anti-abuse
 * fingerprint, both outside this workspace to patch directly). Login already
 * works fine through the header, so this only replaces the broken half.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSession, clearSession } from '../lib/session';
import CreateAccount from './CreateAccount';

export default function Profile() {
  const router = useRouter();
  const [session, setLocalSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocalSession(getSession());
    setReady(true);
    const onChange = () => setLocalSession(getSession());
    window.addEventListener('yelo-session', onChange);
    return () => window.removeEventListener('yelo-session', onChange);
  }, []);

  function signOut() {
    clearSession();
    router.push('/');
  }

  if (!ready) return null;

  if (!session?.vendorId) {
    return (
      <section className="pf">
        <div className="pf-frame pf-empty pf-guest">
          <h1>Create your account</h1>
          <p>Already have one? Sign in from the menu at the top of the page instead.</p>
          <CreateAccount onCreated={() => setLocalSession(getSession())} />
          <Link href="/stores" className="pf-link pf-browse-link">Browse classes</Link>
        </div>
        <style>{css}</style>
      </section>
    );
  }

  const initial = (session.name || session.email || '?').trim().charAt(0).toUpperCase();

  return (
    <section className="pf">
      <div className="pf-frame">
        <h1 className="pf-title">My profile</h1>

        <div className="pf-card">
          <div className="pf-id">
            <span className="pf-avatar" aria-hidden="true">{initial}</span>
            <div>
              <p className="pf-name">{session.name || 'Parent'}</p>
              {session.email && <p className="pf-sub">{session.email}</p>}
            </div>
          </div>

          <dl className="pf-details">
            <div>
              <dt>Name</dt>
              <dd>{session.name || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{session.email || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{session.phone || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="pf-menu" role="group" aria-label="Account">
          <Link href="/p/my-subscriptions" className="pf-row">
            <span className="pf-row-icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            </span>
            <span className="pf-row-label">My subscriptions</span>
            <svg className="pf-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
          <Link href="/stores" className="pf-row">
            <span className="pf-row-icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </span>
            <span className="pf-row-label">Browse classes</span>
            <svg className="pf-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
          <button type="button" className="pf-row pf-row-danger" onClick={signOut}>
            <span className="pf-row-icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            </span>
            <span className="pf-row-label">Sign out</span>
          </button>
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.pf{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px 72px; min-height:60vh; }
.pf-frame{ max-width:520px; margin-inline:auto; display:grid; gap:22px; }
.pf-title{ margin:0; font-family:var(--brand-font-display); font-weight:650; letter-spacing:-.01em; font-size:clamp(1.5rem,4vw,2rem); }

.pf-card{
  background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  padding:24px; display:grid; gap:20px;
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
.pf-id{ display:flex; align-items:center; gap:14px; }
.pf-avatar{
  width:52px; height:52px; border-radius:50%; flex:none;
  display:grid; place-items:center; font-family:var(--brand-font-display); font-weight:700; font-size:1.3rem;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.pf-name{ margin:0; font-weight:650; font-size:1.05rem; }
.pf-sub{ margin:2px 0 0; font-size:.85rem; color:var(--brand-ink-soft); }

.pf-details{ margin:0; display:grid; gap:12px; padding-top:16px; border-top:1px solid var(--brand-line); }
.pf-details > div{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.pf-details dt{ font-size:.72rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--brand-ink-soft); }
.pf-details dd{ margin:0; font-size:.9rem; font-weight:600; text-align:right; }

/* Account actions live in one cohesive card as a real menu — rows, not
   loose disconnected pills — with "Sign out" set apart by a divider and a
   danger tint instead of sitting as a peer action next to navigation. */
.pf-menu{
  background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  overflow:hidden; box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
.pf-row{
  display:flex; align-items:center; gap:12px; width:100%; text-align:left;
  padding:15px 18px; border:0; border-bottom:1px solid var(--brand-line);
  background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-size:.92rem; font-weight:600;
  text-decoration:none; cursor:pointer;
  transition:background var(--motion) var(--motion-ease);
}
.pf-menu .pf-row:last-child{ border-bottom:0; }
.pf-row:hover{ background:var(--brand-accent-soft); }
.pf-row-icon{
  flex:none; display:grid; place-items:center; width:34px; height:34px; border-radius:50%;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.pf-row-label{ flex:1; min-width:0; }
.pf-row-chevron{ flex:none; color:var(--brand-ink-soft); }
.pf-row-danger{ color:#c0392b; }
.pf-row-danger .pf-row-icon{ background:color-mix(in srgb, #c0392b 12%, var(--brand-accent-soft)); color:#c0392b; }
.pf-row-danger:hover{ background:color-mix(in srgb, #c0392b 8%, var(--brand-surface)); }

.pf-empty{ text-align:center; padding:48px 24px; background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg); }
.pf-empty h1{ margin:0 0 10px; font-family:var(--brand-font-display); font-size:1.3rem; }
.pf-empty p{ margin:0 0 18px; color:var(--brand-ink-soft); font-size:.9rem; }
.pf-guest{ text-align:left; }
.pf-guest h1{ text-align:center; }
.pf-guest p{ text-align:center; }
.pf-link{
  padding:9px 15px; border-radius:980px; border:1px solid var(--brand-line);
  color:var(--brand-ink); font-size:.84rem; font-weight:600; text-decoration:none;
  transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.pf-link:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.pf-browse-link{ display:block; text-align:center; margin-top:14px; }

.pf-row:focus-visible, .pf-link:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:-2px; }
`;
