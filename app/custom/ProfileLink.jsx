'use client';
/**
 * ProfileLink — the nearest real equivalent to "click your name in the
 * header to reach your profile." The real top navbar ("Hi, {name}" / "Sign
 * out") is `app/components/Header.jsx` in the platform app — shared chrome
 * rendered directly in the root layout, outside this tenant's own workspace
 * (see CLAUDE.md boundaries). It isn't driven by a page tree, so there's no
 * node to swap it for, and no prop this build can pass it to move "Sign out"
 * elsewhere or make the name a link. This is the nearest real workaround: a
 * small, fixed, always-reachable tab on the pages a parent actually browses
 * from — pinned top-right, under the real header, stacked just above the
 * relocated chat launcher so neither covers the other. Only renders once
 * signed in.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession } from '../lib/session';

export default function ProfileLink() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
    const onChange = () => setSession(getSession());
    window.addEventListener('yelo-session', onChange);
    return () => window.removeEventListener('yelo-session', onChange);
  }, []);

  if (!ready || !session?.vendorId) return null;

  return (
    <Link href="/p/profile" className="pfl">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="8" r="3.4" /><path d="M4.5 20c1.6-3.8 5-5.5 7.5-5.5S18.4 16.2 20 20" strokeLinecap="round" />
      </svg>
      {session.name?.split(' ')[0] || 'My profile'}
      <style>{css}</style>
    </Link>
  );
}

const css = `
.pfl{
  position:fixed; z-index:30; top:76px; right:18px;
  display:inline-flex; align-items:center; gap:7px;
  padding:11px 16px; border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink);
  border:1px solid var(--brand-line);
  font-family:var(--brand-font-body); font-weight:650; font-size:.84rem; text-decoration:none;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 18%, transparent);
  transition:transform var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease);
}
.pfl:hover{ border-color:var(--brand-accent); color:var(--brand-accent); transform:translateY(-1px); }
.pfl:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
@media (max-width:560px){ .pfl{ top:70px; right:14px; padding:10px 14px; font-size:.8rem; } }
@media (prefers-reduced-motion:reduce){ .pfl:hover{ transform:none; } }
`;
