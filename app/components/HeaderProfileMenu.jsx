'use client';
/**
 * HeaderProfileMenu — "Hi, {name}" in the header now opens a small profile
 * card right there in the header, instead of only being a link to the full
 * profile page. Shows the same identity (name, email) plus the same actions
 * as Profile.jsx (My subscriptions, Browse classes, Sign out), so a visitor
 * can check who they're signed in as or sign out without leaving the page
 * they're on. "View full profile" still goes to /p/profile for the complete
 * page.
 *
 * Closes on outside click, Escape, and navigation (route change unmounts the
 * header's own state anyway). Keyboard-operable: a real <button> trigger,
 * role="menu"/"menuitem" on the panel, arrow-key free (short list, Tab is
 * enough) but Escape returns focus to the trigger.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearSession } from '../lib/session';

export default function HeaderProfileMenu({ session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function signOut() {
    setOpen(false);
    clearSession();
    router.push('/');
  }

  const firstName = session?.name?.split(' ')[0] || 'there';
  const initial = (session?.name || session?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="hpm" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="hpm-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        Hi, {firstName}
        <svg className="hpm-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Account" className="hpm-panel">
          <div className="hpm-id">
            <span className="hpm-avatar" aria-hidden="true">{initial}</span>
            <div className="hpm-id-text">
              <p className="hpm-name">{session?.name || 'Your account'}</p>
              {session?.email && <p className="hpm-email">{session.email}</p>}
            </div>
          </div>

          <Link href="/p/my-subscriptions" role="menuitem" className="hpm-item" onClick={() => setOpen(false)}>
            My subscriptions
          </Link>
          <Link href="/stores" role="menuitem" className="hpm-item" onClick={() => setOpen(false)}>
            Browse classes
          </Link>
          <Link href="/p/profile" role="menuitem" className="hpm-item" onClick={() => setOpen(false)}>
            View full profile
          </Link>
          <button type="button" role="menuitem" className="hpm-item hpm-item-danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

const css = `
.hpm{ position:relative; }
.hpm-trigger{
  display:inline-flex; align-items:center; gap:5px;
  border:0; background:transparent; padding:0; margin:0;
  font:inherit; color:inherit; cursor:pointer;
  min-height:44px; touch-action:manipulation;
}
.hpm-trigger:hover{ color:var(--brand-accent, var(--brand)); }
.hpm-chevron{ transition:transform var(--motion,140ms) var(--motion-ease,ease); }
.hpm-trigger[aria-expanded="true"] .hpm-chevron{ transform:rotate(180deg); }

.hpm-panel{
  position:absolute; top:calc(100% + 10px); right:0; z-index:40;
  width:240px; padding:6px;
  background:var(--brand-surface); color:var(--brand-ink);
  border:1px solid var(--brand-line); border-radius:var(--radius-lg,12px);
  box-shadow:0 18px 44px -20px color-mix(in srgb, var(--brand-ink) 45%, transparent);
  animation:hpm-in 160ms cubic-bezier(.16,1,.3,1);
}
@keyframes hpm-in{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }

.hpm-id{ display:flex; align-items:center; gap:10px; padding:10px 10px 12px; border-bottom:1px solid var(--brand-line); margin-bottom:6px; }
.hpm-avatar{
  flex:none; width:34px; height:34px; border-radius:50%;
  display:grid; place-items:center; font-family:var(--brand-font-display); font-weight:700; font-size:.9rem;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.hpm-id-text{ min-width:0; }
.hpm-name{ margin:0; font-weight:650; font-size:.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hpm-email{ margin:1px 0 0; font-size:.76rem; color:var(--brand-ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.hpm-item{
  display:block; width:100%; text-align:left; border:0; background:transparent;
  padding:10px 10px; border-radius:8px; font:inherit; font-size:.86rem; font-weight:600;
  color:var(--brand-ink); text-decoration:none; cursor:pointer;
  min-height:40px; touch-action:manipulation;
}
.hpm-item:hover{ background:var(--brand-accent-soft); }
.hpm-item-danger{ color:#c0392b; }
.hpm-item-danger:hover{ background:color-mix(in srgb, #c0392b 10%, var(--brand-surface)); }

.hpm-trigger:focus-visible, .hpm-item:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; border-radius:6px; }
@media (prefers-reduced-motion: reduce){ .hpm-panel{ animation:none; } .hpm-chevron{ transition:none; } }
`;
