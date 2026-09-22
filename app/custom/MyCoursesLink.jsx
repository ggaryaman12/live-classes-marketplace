'use client';
/**
 * MyCoursesLink — a persistent, site-wide way to reach "My enrolled
 * courses" from anywhere a parent is browsing.
 *
 * NOTE ON SCOPE: the real top navbar (logo, Browse, Help, cart) is
 * `app/components/Header.jsx` in the platform app — shared chrome outside
 * this tenant's own workspace, so it can't be edited from here (see
 * CLAUDE.md boundaries). This is the nearest real equivalent: a small,
 * fixed, always-reachable tab, added to the page trees a parent actually
 * browses from (landing, teacher listing, a teacher's page, a class page —
 * not checkout, which stays distraction-free). Only renders once signed
 * in, since there's nothing to show a guest.
 *
 * PINNED BOTTOM-RIGHT, per instruction, stacked directly above the chat
 * launcher in that same corner (see HippoChatLauncher.jsx for the matching
 * offset) — Profile now sits alone at the top-right.
 *
 * No store id to carry — MySubscriptions.jsx lists every teacher's classes
 * in one call (see its own header note on why `user_id` isn't a real scope
 * on that endpoint), so this is just a plain link.
 *
 * Self-contained aside from the confirmed-real `../lib/session`.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession } from '../lib/session';

export default function MyCoursesLink() {
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
    <Link href="/p/my-subscriptions" className="mcl">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
      My courses
      <style>{css}</style>
    </Link>
  );
}

const css = `
.mcl{
  position:fixed; z-index:30; bottom:70px; right:18px;
  display:inline-flex; align-items:center; gap:7px;
  padding:11px 16px; border-radius:980px;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-body); font-weight:650; font-size:.84rem; text-decoration:none;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 22%, transparent);
  transition:transform var(--motion) var(--motion-ease), filter var(--motion) var(--motion-ease);
}
.mcl:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.mcl:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
@media (max-width:560px){ .mcl{ bottom:64px; right:14px; padding:9px 12px; font-size:.76rem; } }
`;
