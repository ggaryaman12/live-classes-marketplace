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
 * WHY IT MAY SHOW NOTHING YET: the widget needs this tenant's real
 * `fugu_chat_token` (and `is_fugu_bot_enabled`), which the real webapp reads
 * from `marketplace_fetch_app_configuration` — the same endpoint that has
 * been answering with a genuine SQL error for this tenant all session
 * (verified live, repeatedly: status 201, ER_PARSE_ERROR). Rather than fake
 * a chat button with no real business behind it, this only renders once a
 * real token comes back. The moment that config call starts working for
 * this tenant (or a real token is supplied directly), this starts working
 * with no further code changes.
 *
 * ONE HONEST GAP: the real client's only confirmed `startConversation(...)`
 * call is for chatting about a specific order (transaction_id, a store
 * name). There's no order context for a general "Help" click, so this sends
 * the call with none of those fields — the safest reading of the one real
 * shape found in source, not something verified against a live token (there
 * isn't one to test with yet).
 */
import { useEffect, useState } from 'react';

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.freelancer.jungleworks.me',
  dual_user_key: 0,
  language: 'en',
};

function loadHippoScript() {
  return new Promise((resolve, reject) => {
    if (document.getElementById('hippoScript')) return resolve(true);
    const script = document.createElement('script');
    script.id = 'hippoScript';
    script.src = 'https://chat.hippochat.io/js/widget.js';
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Hippo chat script failed to load'));
    document.head.appendChild(script);
  });
}

export default function HippoChatLauncher() {
  const [token, setToken] = useState(null);
  const [botEnabled, setBotEnabled] = useState(true);
  const [opening, setOpening] = useState(false);

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
        if (j?.status === 200 && j?.data?.fugu_chat_token) {
          setToken(j.data.fugu_chat_token);
          setBotEnabled(!!j.data.is_fugu_bot_enabled);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function open() {
    setOpening(true);
    try {
      await loadHippoScript();
      const obj = {};
      if (!botEnabled) {
        obj.skipBot = 1;
        obj.skipBotReason = null;
      }
      if (typeof window.startConversation === 'function') {
        window.startConversation(obj);
      }
    } catch {
      /* script failed to load — nothing to open */
    }
    setOpening(false);
  }

  if (!token) return null;

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
  position:fixed; z-index:30; left:18px; bottom:18px;
  display:inline-flex; align-items:center; gap:7px;
  padding:11px 16px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-ink); color:var(--brand-paper);
  font-family:var(--brand-font-body); font-weight:650; font-size:.84rem;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 22%, transparent);
  transition:transform var(--motion) var(--motion-ease), filter var(--motion) var(--motion-ease);
}
.hcl:hover{ filter:brightness(1.15); transform:translateY(-1px); }
.hcl:disabled{ opacity:.7; cursor:default; transform:none; }
.hcl:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
@media (max-width:560px){ .hcl{ left:14px; bottom:14px; padding:10px 14px; font-size:.8rem; } }
@media (prefers-reduced-motion:reduce){ .hcl:hover{ transform:none; } }
`;
