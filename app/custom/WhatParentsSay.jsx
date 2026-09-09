"use client";

import { useEffect, useState } from "react";

/**
 * WhatParentsSay — "What parents say" on a teacher's profile: parent name,
 * star rating, short quote. Tries the real merchant profile call for this
 * teacher first (their id, read from the URL) and renders whatever reviews
 * come back for real; if that returns nothing usable, falls back to clearly
 * labelled sample reviews so the section still reads as finished. Never
 * shows a sample review as if it were real.
 *
 * Self-contained: no cross-file imports, same reason as LiveCatalogue.jsx —
 * components here build individually from a flat folder, so a sibling `lib/`
 * import does not resolve.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
  dual_user_key: 0,
};

const SAMPLE_REVIEWS = [
  { customer_name: "Priya S.", rating: 5, review: "My daughter looks forward to this every week — she's actually disappointed when a session ends." },
  { customer_name: "Marcus T.", rating: 5, review: "Small group meant my son actually got to talk, not just watch. That made the difference for us." },
  { customer_name: "Anjali R.", rating: 4, review: "Great teaching, occasional tech hiccups on the video call. Would still recommend." },
];

function currentStoreId() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/store\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function Stars({ value }) {
  const pct = (value / 5) * 100;
  return (
    <span className="wps-stars" aria-hidden="true">
      <span className="wps-stars-on" style={{ width: `${pct}%` }}>★★★★★</span>
      <span className="wps-stars-off">★★★★★</span>
    </span>
  );
}

export default function WhatParentsSay({
  heading = "What parents say",
}) {
  const [state, setState] = useState("loading"); // loading | real | sample
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const storeId = currentStoreId();

    async function load() {
      if (!storeId) {
        if (!cancelled) {
          setReviews(SAMPLE_REVIEWS);
          setState("sample");
        }
        return;
      }
      try {
        const res = await fetch(`${YELO_BASE}/merchant/viewProfile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            base_version: "1.0.0",
            device_type: "WEB",
          },
          body: JSON.stringify({ ...YELO_TENANT, user_id: storeId }),
        });
        const json = await res.json();
        const live = json?.status === 200 ? json?.data?.last_review_rating : null;
        if (cancelled) return;
        if (Array.isArray(live) && live.length) {
          setReviews(
            live
              .filter((r) => r && r.review)
              .map((r) => ({ customer_name: r.customer_name, rating: r.rating, review: r.review }))
          );
          setState("real");
        } else {
          setReviews(SAMPLE_REVIEWS);
          setState("sample");
        }
      } catch {
        if (!cancelled) {
          setReviews(SAMPLE_REVIEWS);
          setState("sample");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bell-wps" aria-labelledby="bell-wps-h">
      <div className="wps-frame">
        <div className="wps-head">
          <h2 id="bell-wps-h">{heading}</h2>
          {state === "sample" && <span className="wps-sample-tag">Sample reviews — for layout</span>}
        </div>

        {state === "loading" ? (
          <ul className="wps-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="wps-skel">
                <span className="wps-skel-line" style={{ width: "40%" }} />
                <span className="wps-skel-line" style={{ width: "90%" }} />
                <span className="wps-skel-line" style={{ width: "60%" }} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="wps-grid">
            {reviews.map((r, i) => (
              <li key={i} className="wps-card">
                <Stars value={r.rating || 0} />
                <p className="wps-quote">“{r.review}”</p>
                <p className="wps-name">{r.customer_name || "A Bell parent"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-wps{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-wps{ padding:80px 32px; } }
.wps-frame{ max-width:1100px; margin-inline:auto; }
.wps-head{ display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; justify-content:space-between; margin-bottom:22px; }
.wps-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0; }
.wps-sample-tag{ padding:5px 12px; border-radius:980px; border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink-soft); font-size:11.5px; font-weight:700; }

.wps-grid{ list-style:none; margin:0; padding:0; display:grid; gap:16px; grid-template-columns:1fr; }
@media (min-width:640px){ .wps-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:980px){ .wps-grid{ grid-template-columns:repeat(3,1fr); } }

.wps-card{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:18px; display:grid; gap:10px; box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent); }
.wps-stars{ position:relative; display:inline-block; font-size:.95rem; letter-spacing:1px; }
.wps-stars-off{ color:color-mix(in srgb, var(--brand-ink-soft) 40%, transparent); }
.wps-stars-on{ position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:var(--brand-accent); }
.wps-quote{ margin:0; color:var(--brand-ink); font-size:.92rem; line-height:1.55; }
.wps-name{ margin:0; color:var(--brand-ink-soft); font-size:.82rem; font-weight:600; }

.wps-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:18px; display:grid; gap:10px; }
.wps-skel-line{ display:block; height:12px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:wps-sweep 1.4s ease-in-out infinite; }
@keyframes wps-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

@media (prefers-reduced-motion: reduce){
  .wps-skel-line{ animation:none; }
}
`;
