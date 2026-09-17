'use client';
/**
 * Profile — the page ProfileLink.jsx points at. Shows the real signed-in
 * customer (name, email, phone — the same `../lib/session` contract the
 * rest of this storefront already relies on) and is where "Sign out" now
 * lives, per the instruction to move it out of the header.
 *
 * SIGN OUT HERE, NOT REMOVED FROM THE HEADER: the header ("Hi, {name}" /
 * "Sign out") is `app/components/Header.jsx`, shared platform chrome
 * rendered directly in the root layout — outside this tenant's workspace,
 * with no page-tree node to swap it for (see CLAUDE.md boundaries; the same
 * limitation MyCoursesLink.jsx already documents). This build can't remove
 * a button from a file it isn't allowed to edit. What it CAN do — and does
 * — is give "sign out" a real second home here, so a parent who reaches
 * their profile through this page never needs the header's own button.
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

        <div className="pf-links">
          <Link href="/p/my-subscriptions" className="pf-link">My subscriptions</Link>
          <Link href="/stores" className="pf-link">Browse classes</Link>
        </div>

        <button type="button" className="pf-signout" onClick={signOut}>Sign out</button>
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

.pf-links{ display:flex; flex-wrap:wrap; gap:10px; }
.pf-link{
  padding:9px 15px; border-radius:980px; border:1px solid var(--brand-line);
  color:var(--brand-ink); font-size:.84rem; font-weight:600; text-decoration:none;
  transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.pf-link:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }

.pf-signout{
  justify-self:start; padding:11px 20px; border-radius:980px; border:1px solid var(--brand-line);
  background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-weight:650; font-size:.88rem; cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease), background var(--motion) var(--motion-ease);
}
.pf-signout:hover{ border-color:color-mix(in srgb, var(--brand-ink) 40%, var(--brand-line)); background:var(--brand-accent-soft); }

.pf-empty{ text-align:center; padding:48px 24px; background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg); }
.pf-empty h1{ margin:0 0 10px; font-family:var(--brand-font-display); font-size:1.3rem; }
.pf-empty p{ margin:0 0 18px; color:var(--brand-ink-soft); font-size:.9rem; }
.pf-guest{ text-align:left; }
.pf-guest h1{ text-align:center; }
.pf-guest p{ text-align:center; }
.pf-browse-link{ display:block; text-align:center; margin-top:14px; }
.pf-cta{
  display:inline-block; padding:11px 22px; border-radius:980px;
  background:var(--brand-accent); color:var(--brand-accent-ink); font-weight:650; font-size:.88rem; text-decoration:none;
}

.pf-signout:focus-visible, .pf-link:focus-visible, .pf-cta:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
`;
