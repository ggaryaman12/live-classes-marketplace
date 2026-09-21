'use client';
/**
 * HippoChatLauncher — real live-chat support, traced to the actual product:
 * "Hippo" is Yelo's internal name for its Fugu-powered chat widget
 * (yelo-server services/hippoService.js — FUGU_CHAT_SERVER_URL, and the real
 * marketplace webapp's own script loader, load-scripts.class.ts:62-86, which
 * injects `https://chat.hippochat.io/js/widget.js`). Not invented — this is
 * the same script tag and the same global `window.startConversation(...)`
 * call the real storefront uses (set-external-lib.service.ts:198-227).
 *
 * WHY THIS ISN'T ON THE HEADER'S "HELP" LINK: that link lives in
 * app/components/Header.jsx, shared platform chrome in the root layout,
 * outside this tenant's workspace — the same boundary already true for
 * "Hi, {name}" and "Sign out" (see ProfileLink.jsx). This is the same
 * workaround: a small, fixed, always-reachable launcher on the pages a
 * parent actually browses, not the header itself.
 *
 * PINNED BOTTOM-RIGHT, per instruction — Profile and My courses live in
 * their own row at the top-right instead (see ProfileLink.jsx /
 * MyCoursesLink.jsx), so this sits alone at the bottom with no risk of
 * covering either.
 *
 * THE TOKEN: the widget needs this tenant's real `fugu_chat_token` (and
 * `is_fugu_bot_enabled`), which the real webapp reads from
 * `marketplace_fetch_app_configuration`. That call used to answer with a
 * genuine SQL error for this tenant — root cause found: `YELO_TENANT.
 * domain_name` below was wrong (freelancer.jungleworks.me instead of this
 * tenant's real deliverecttest.devweb1.yelo.red). Fixed now — verified live,
 * real 200, real `fugu_chat_token`. This still only renders once a real
 * token actually comes back rather than assuming one, so a tenant with chat
 * genuinely turned off correctly shows nothing.
 *
 * TWO REAL BUGS FIXED HERE, IN ORDER:
 * 1. Loading the script and calling `startConversation(...)` was never
 *    enough alone — the actual client calls a SECOND, load-bearing step
 *    first: `window.fuguInit({appSecretKey: fugu_chat_token, ...})`, once,
 *    whenever `config.is_fugu_chat_enabled` is true (app.component.ts:
 *    161-169 → set-external-lib.service.ts initFuguWidget():91-131).
 *    `startConversation` only does anything once `fuguInit` has registered
 *    the widget with that token.
 * 2. THE SCRIPT URL ITSELF WAS WRONG FOR THIS TENANT. `chat.hippochat.io/
 *    js/widget.js` (the real client's PRODUCTION build) is a small,
 *    hardcoded lookup of a handful of specific known live customer tokens —
 *    a test token was never going to do anything with it. Now pointed at
 *    `script-dev.hippochat.io/public/js/widget-3002.js`, this tenant's real
 *    dev widget build (confirmed live: a genuine ~47KB generic widget,
 *    exposes both `fuguInit` and `startConversation`) — this specific URL,
 *    not the generic beta one, is what actually matches this backend
 *    (test-api-3025).
 */
import { useEffect, useRef, useState } from 'react';

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.devweb1.yelo.red',
  dual_user_key: 0,
  language: 'en',
};

function loadHippoScript() {
  return new Promise((resolve, reject) => {
    if (document.getElementById('hippoScript')) return resolve(true);
    const script = document.createElement('script');
    script.id = 'hippoScript';
    script.src = 'https://script-dev.hippochat.io/public/js/widget-3002.js';
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Hippo chat script failed to load'));
    document.head.appendChild(script);
  });
}

export default function HippoChatLauncher() {
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const initRef = useRef(null); // the fuguInit() promise, started at most once

  useEffect(() => {
    let cancelled = false;
    fetch(`${YELO_BASE}/marketplace_fetch_app_configuration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
      body: JSON.stringify(YELO_TENANT),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const d = j?.data;
        if (j?.status === 200 && d?.is_fugu_chat_enabled && d?.fugu_chat_token) {
          setReady(true);
          // Boot the widget now, same timing intent as the real client's
          // app.component.ts — no reason to wait for a click when the config
          // is already in hand, and startConversation needs this done first.
          initRef.current = loadHippoScript().then(
            () =>
              new Promise((resolve) => {
                if (typeof window.fuguInit !== 'function') return resolve(false);
                window.fuguInit({
                  appSecretKey: d.fugu_chat_token,
                  alwaysSkipBot: !d.is_fugu_bot_enabled,
                  language: d.language || 'en',
                  color: d.color || undefined,
                  tags: [`${d.form_name || 'Storefront'} Webapp`],
                  // The widget draws its OWN floating bubble by default — a
                  // real, reported bug: it landed bottom-right, overlapping
                  // this build's own floating nav buttons, with a broken
                  // image icon of its own. 'completeHide' is a real, confirmed option in
                  // this exact script (widget-3002.js — every collapseType
                  // branch checks for it) that keeps the widget fully
                  // invisible until code calls `startConversation`, which is
                  // exactly what the "Chat with us" button already does —
                  // one trigger, not two competing ones.
                  collapseType: 'completeHide',
                  callback: () => resolve(true),
                });
                // Some widget builds never fire `callback` when there's
                // nothing to announce — don't hang the first click forever.
                setTimeout(() => resolve(true), 4000);
              })
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function open() {
    setOpening(true);
    try {
      if (initRef.current) await initRef.current;
      if (typeof window.startConversation === 'function') {
        window.startConversation({});
      }
    } catch {
      /* widget failed to load or init — nothing to open */
    }
    setOpening(false);
  }

  if (!ready) return null;

  return (
    <button type="button" className="hcl" onClick={open} disabled={opening} aria-label="Chat with support">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      {opening ? 'Opening…' : 'Chat with us'}
      <style>{css}</style>
    </button>
  );
}

const css = `
.hcl{
  position:fixed; z-index:30; bottom:18px; right:18px;
  display:inline-flex; align-items:center; gap:7px;
  padding:11px 16px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-body); font-weight:650; font-size:.84rem;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 22%, transparent);
  transition:transform var(--motion) var(--motion-ease), filter var(--motion) var(--motion-ease);
}
.hcl:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.hcl:disabled{ opacity:.7; cursor:default; transform:none; }
.hcl:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
@media (max-width:560px){ .hcl{ bottom:14px; right:14px; padding:10px 14px; font-size:.8rem; } }
@media (prefers-reduced-motion:reduce){ .hcl:hover{ transform:none; } }
`;
