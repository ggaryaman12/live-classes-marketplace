'use client';
// Sticky header: brand, location, auth, cart. Cart button opens the slide-over.
// Typed + self-contained → maps to a { type:'Header' } component-JSON node.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { getSession, clearSession } from '../lib/session';
import AuthModal from './AuthModal';
import CartSheet from './CartSheet';

// This is a client component, so only NEXT_PUBLIC_* reaches the browser bundle and
// it is inlined at BUILD time — which is why the export writes both forms into
// .env.local and previewPool sets both in the build env. See app/lib/siteName.js.
const SITE_NAME = (process.env.NEXT_PUBLIC_SITE_NAME || '').replace(/\s+/g, ' ').trim() || 'Storefront';

export default function Header() {
  const { count } = useCart();
  const [session, setSess] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const sync = () => setSess(getSession());
    sync();
    window.addEventListener('yelo-session', sync);
    return () => window.removeEventListener('yelo-session', sync);
  }, []);

  return (
    <>
      <header className="hd">
        {/* The project's own name, not a hardcoded wordmark. This line said
            "market." for every storefront ever built, and because a new project now
            starts with this starter header until the build designs its own, it was
            the first thing a person saw. See app/lib/siteName.js. */}
        <Link href="/" className="hd-logo">{SITE_NAME}</Link>
        <nav className="hd-nav">
          <Link href="/">Browse</Link>
          <a href="#">Help</a>
          {session ? (
            <span className="hd-account">
              <span className="hd-hi">Hi, {session.name?.split(' ')[0] || 'there'}</span>
              <button className="hd-link" onClick={() => { clearSession(); }}>Sign out</button>
            </span>
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
    </>
  );
}
