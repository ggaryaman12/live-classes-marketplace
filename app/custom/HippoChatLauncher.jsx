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
 * WHY THIS ISN'T ON THE HEADER'S "HELP" LINK: "Help" is a static placeholder
 * in chrome/Header.jsx with nothing behind it yet — this is a small, fixed,
 * always-reachable launcher on the pages a parent actually browses instead,
 * not a rework of that link.
 *
 * PINNED BOTTOM-RIGHT, per instruction — My courses moved to sit directly
 * above it in the same corner (see MyCoursesLink.jsx); Profile now lives in
 * the header itself ("Hi, {name}" links to /p/profile, see chrome/Header.jsx),
 * so nothing else shares this bottom-right stack but the two of them.
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The widget's own functions (startConversation & co) silently do NOTHING
// until it reports "SetupComplete" — which fires the fuguInit callback. The old
// code gave up waiting after 4s and called startConversation anyway, so on a
// slow phone/tablet connection the tap was swallowed with no feedback ("chat
// not working"). Now: wait for the real callback (capped), and keep retrying
// the open until the widget panel is genuinely showing.
function bootWidget(d) {
  return loadHippoScript().then(
    () =>
      new Promise((resolve) => {
        if (typeof window.fuguInit !== 'function') return resolve(false);
        window.fuguInit({
          appSecretKey: d.fugu_chat_token,
          alwaysSkipBot: !d.is_fugu_bot_enabled,
          language: d.language || 'en',
          color: d.color || undefined,
          tags: [`${d.form_name || 'Storefront'} Webapp`],
          // 'completeHide' keeps the widget's own bubble invisible so our
          // "Chat with us" button is the single trigger (see the header note).
          collapseType: 'completeHide',
          callback: () => resolve(true),
        });
        setTimeout(() => resolve(false), 20000);
      })
  );
}

const panelOpen = () => {
  const f = document.getElementById('iframe_fuguWidgetContent');
  return !!f && !f.classList.contains('collapsed');
};

export default function HippoChatLauncher() {
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false); // the chat panel is showing
  const cfgRef = useRef(null);  // the tenant's chat config, once fetched
  const initRef = useRef(null); // the boot promise, restarted only if the widget was torn down

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
          cfgRef.current = d;
          setReady(true);
          // Boot now, same timing intent as the real client's app.component.ts.
          initRef.current = bootWidget(d);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Track whether the panel is really showing, so this button can double as a
  // reliable "Close chat" (the widget's own round × can be small or covered).
  useEffect(() => {
    if (!ready) return;
    const sync = () => setChatOpen(panelOpen());
    const id = setInterval(sync, 500);
    sync();
    return () => clearInterval(id);
  }, [ready]);

  function close() {
    try {
      if (typeof window.fuguWidget_Collapse === 'function') window.fuguWidget_Collapse();
    } catch {
      /* fall through to the direct collapse below */
    }
    // Belt and braces: collapse the iframes ourselves too, exactly as the
    // widget does on its own Collapse message.
    ['iframe_fuguWidgetContent', 'iframe_fuguWidget'].forEach((id) => {
      document.getElementById(id)?.classList.add('collapsed');
    });
    setChatOpen(false);
  }

  async function open() {
    if (chatOpen) return close();
    if (opening) return;
    setOpening(true);
    setFailed(false);
    let opened = false;
    try {
      // Closing the chat makes the widget destroy its iframes; boot it again.
      if (!document.getElementById('iframe_fuguWidgetContent') && cfgRef.current) {
        initRef.current = bootWidget(cfgRef.current);
      }
      if (initRef.current) await initRef.current;
      const started = Date.now();
      while (Date.now() - started < 12000) {
        try {
          if (typeof window.startConversation === 'function') window.startConversation({});
        } catch {
          /* widget mid-setup — retry */
        }
        await wait(400);
        if (panelOpen()) { opened = true; break; }
      }
    } catch {
      /* widget failed to load or init */
    }
    setOpening(false);
    if (opened) setChatOpen(true);
    if (!opened) {
      setFailed(true);
      setTimeout(() => setFailed(false), 6000);
    }
  }

  if (!ready) return null;

  return (
    <>
      <button type="button" className="hcl" onClick={open} disabled={opening} aria-label="Chat with support">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {opening ? 'Connecting…' : chatOpen ? 'Close chat' : 'Chat with us'}
      </button>
      {failed && (
        <p className="hcl-note" role="status">Chat isn't reachable right now. Please try again in a moment.</p>
      )}
      <style>{css}</style>
    </>
  );
}

const css = `
.hcl{
  position:fixed; z-index:30; bottom:calc(18px + var(--float-lift, 0px)); right:18px;
  display:inline-flex; align-items:center; gap:7px;
  padding:11px 16px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-body); font-weight:650; font-size:.84rem;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 22%, transparent);
  transition:transform var(--motion) var(--motion-ease), filter var(--motion) var(--motion-ease);
}
.hcl{ min-height:44px; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.hcl-note{
  position:fixed; z-index:31; right:18px; bottom:calc(72px + var(--float-lift, 0px));
  margin:0; max-width:min(78vw,280px); padding:10px 14px; border-radius:var(--radius);
  background:var(--brand-surface); color:var(--brand-ink); border:1px solid var(--brand-line);
  font-family:var(--brand-font-body); font-size:.82rem;
  box-shadow:0 6px 18px color-mix(in srgb, var(--brand-ink) 22%, transparent);
}
/* While the chat is COLLAPSED the widget's launcher/panel iframes must be out
   of hit-testing — sitting fixed at the bottom-right with a huge z-index they
   can swallow taps meant for the Enroll bar and this button. Scoped to
   .collapsed on purpose: when the chat is OPEN the widget's own round × has to
   stay clickable (a blanket pointer-events:none here once made it unclosable). */
html body iframe#iframe_fuguWidget.collapsed,
html body iframe#iframe_fuguWidgetContent.collapsed{ display:none !important; pointer-events:none !important; }
.hcl:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.hcl:disabled{ opacity:.7; cursor:default; transform:none; }
.hcl:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
@media (max-width:560px){ .hcl{ bottom:calc(14px + var(--float-lift, 0px)); right:14px; padding:10px 14px; font-size:.8rem; } }
@media (prefers-reduced-motion:reduce){ .hcl:hover{ transform:none; } }
`;
