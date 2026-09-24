'use client';
// Sticky header: brand, location, auth, cart. Cart button opens the slide-over.
// Typed + self-contained → maps to a { type:'Header' } component-JSON node.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { getSession } from '../lib/session';
import AuthModal from './AuthModal';
import CartSheet from './CartSheet';

export default function Header() {
  const { count } = useCart();
  const [session, setSess] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // Nav shows the link to wherever you are NOT: home → Classes only,
  // Classes page → Home only, every other page → both.
  const path = usePathname() || '/';
  const onHome = path === '/';
  const onClasses = path === '/stores' || path.startsWith('/stores/');

  useEffect(() => {
    const sync = () => setSess(getSession());
    sync();
    window.addEventListener('yelo-session', sync);
    return () => window.removeEventListener('yelo-session', sync);
  }, []);

  return (
    <>
      <header className="hd">
        <Link href="/" className="hd-logo">
          <img
            src="https://spark-studio-india-bkt.s3.ap-south-1.amazonaws.com/assets-sparkstudio-co/staging/sparkLogo.png"
            alt="Spark Studio"
            height="34"
            style={{ height: 34, width: 'auto', display: 'block' }}
          />
        </Link>
        <nav className="hd-nav">
          {!onHome && <Link href="/">Home</Link>}
          {!onClasses && <Link href="/stores">Explore Courses</Link>}
          {session?.vendorId && (
            <Link href="/p/my-subscriptions" className="hd-mine" aria-label="My courses">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
              </svg>
              <span>My courses</span>
            </Link>
          )}
          {session ? (
            // Per instruction: no "Sign out" here — signing out now lives on
            // the profile page only, one click away via "Hi, {name}" below.
            <Link href="/p/profile" className="hd-hi">Hi, {session.name?.split(' ')[0] || 'there'}</Link>
          ) : (
            <button className="hd-signin" onClick={() => setAuthOpen(true)}>Sign in</button>
          )}
          <button className="hd-cart" onClick={() => setCartOpen(true)} aria-label="Cart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {count > 0 && <span className="hd-badge">{count}</span>}
          </button>
        </nav>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => { setAuthOpen(false); }} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} onSignIn={() => { setCartOpen(false); setAuthOpen(true); }} />
      <style>{`
        /* .hd-logo's shared rule (globals.css) is text-sizing only, meant
           for the old "market." wordmark — harmless left in place, but this
           component needs its own layout rule so the logo image centers
           correctly in the 60px header bar rather than sitting on its
           default inline baseline. */
        .hd .hd-logo{display:inline-flex;align-items:center}
        /* .hd-hi (globals.css) only sets size/weight, written for a plain
           span. Now that it's a real link to the profile page, it needs its
           own no-underline + hover treatment so it doesn't pick up default
           anchor styling nobody asked for. */
        .hd .hd-hi{text-decoration:none;color:inherit}
        .hd .hd-hi:hover{color:var(--brand);text-decoration:underline}
        /* "My courses" lives in the header now (it used to float bottom-right
           and collide with "Chat with us"). Plain nav link + small calendar
           icon; on phones it collapses to the icon alone so the bar still fits. */
        .hd .hd-mine{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:inherit;min-height:44px}
        .hd .hd-mine:hover{color:var(--brand)}
        .hd .hd-nav > *{white-space:nowrap}
        @media (max-width:640px){
          .hd .hd-mine span{display:none}
          .hd .hd-mine{justify-content:center;min-width:32px}
          .hd .hd-nav{gap:10px;font-size:.85rem}
        }
      `}</style>
    </>
  );
}
