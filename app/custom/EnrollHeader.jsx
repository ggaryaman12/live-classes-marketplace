"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * EnrollHeader — a compact checkout header, not a hero. The old version was a
 * 320px+ parallax banner with a word-by-word headline that pushed the actual
 * checkout panel most of the way down the page. A checkout screen belongs to
 * discipline: the customer is mid-task, so this is now a slim bar — a back
 * link, a short title, and a three-step progress marker — that gets out of the
 * way of the form below.
 *
 * The step marker reflects where the parent is: "Subscribe" (chose a schedule
 * on the class page, now here) → "Details & payment" (this screen) →
 * "Confirmed". It reads step 2 as current on arrival.
 *
 * No motion beyond a token-timed underline on the active step; nothing to
 * disable for prefers-reduced-motion.
 */

const STEPS = ["Schedule", "Details & payment", "Confirmed"];

export default function EnrollHeader(props) {
  return (
    <Suspense fallback={<header className="ckh" aria-busy="true" />}>
      <EnrollHeaderInner {...props} />
    </Suspense>
  );
}

function EnrollHeaderInner({ eyebrow = "Confirm your subscription" }) {
  const params = useSearchParams();
  const [tz, setTz] = useState("");

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      /* no-op */
    }
  }, []);

  // Step 3 only once the flow is actually done (an order/rule id lands on the
  // URL); otherwise the parent is on step 2, here on this screen.
  const done = ["order", "order_id", "job_id", "rule_id", "enrolled"].some((k) => params.get(k));
  const current = done ? 2 : 1;

  // "Schedule" (step 1) is a real step back to the class page's scheduler,
  // carrying every choice the parent already made so nothing is re-picked.
  const product = params.get("product") || params.get("id");
  let scheduleHref = null;
  if (product && !done) {
    const sp = new URLSearchParams({ id: product });
    for (const k of ["frequency", "days", "start", "time", "endMode", "endDate", "occurrences"]) {
      const v = params.get(k);
      if (v) sp.set(k, v);
    }
    scheduleHref = `/p/class?${sp.toString()}`;
  }

  return (
    <header className="ckh">
      <div className="ckh-frame">
        <div className="ckh-top">
          <Link href="/stores" className="ckh-back">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Keep browsing
          </Link>
          {tz && <span className="ckh-tz">Times shown in {tz}</span>}
        </div>

        <h1 className="ckh-title">{eyebrow}</h1>

        <ol className="ckh-steps" aria-label="Checkout progress">
          {STEPS.map((s, i) => {
            const state = i < current ? "past" : i === current ? "current" : "next";
            const inner = (
              <>
                <span className="ckh-dot">{i < current ? "✓" : i + 1}</span>
                <span className="ckh-step-label">{s}</span>
              </>
            );
            const backable = i === 0 && scheduleHref;
            return (
              <li
                key={s}
                className="ckh-step"
                data-state={state}
                data-link={backable ? "1" : undefined}
                aria-current={i === current ? "step" : undefined}
              >
                {backable ? (
                  <Link href={scheduleHref} className="ckh-step-inner">{inner}</Link>
                ) : (
                  <span className="ckh-step-inner">{inner}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <style>{css}</style>
    </header>
  );
}

const css = `
.ckh{
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
.ckh-frame{
  max-width:1000px; margin-inline:auto;
  padding:16px clamp(14px,3.5vw,36px) 18px;
  display:grid; gap:12px;
}
@media (min-width:820px){ .ckh-frame{ padding-top:22px; padding-bottom:22px; } }

.ckh-top{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.ckh-back{
  display:inline-flex; align-items:center; gap:5px;
  color:var(--brand-ink-soft); text-decoration:none;
  font-size:.82rem; font-weight:600;
  transition:color var(--motion) var(--motion-ease);
}
.ckh-back svg{ width:14px; height:14px; }
.ckh-back:hover{ color:var(--brand-accent); }
.ckh-back:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; border-radius:4px; }
.ckh-tz{ font-size:.76rem; color:var(--brand-ink-soft); }

.ckh-title{
  margin:0; font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.01em; font-size:clamp(1.3rem,3.2vw,1.7rem);
}

.ckh-steps{
  list-style:none; margin:0; padding:0;
  display:flex; flex-wrap:wrap; gap:8px 18px;
}
.ckh-step{ display:inline-flex; align-items:center; font-size:.83rem; font-weight:600; }
.ckh-step-inner{
  display:inline-flex; align-items:center; gap:8px;
  color:inherit; text-decoration:none; border-radius:980px;
}
.ckh-step[data-link="1"] .ckh-step-inner{ cursor:pointer; }
.ckh-step[data-link="1"] .ckh-step-label{ text-decoration:underline; text-underline-offset:3px; text-decoration-color:color-mix(in srgb, var(--brand-accent) 45%, transparent); }
.ckh-step[data-link="1"] .ckh-step-inner:hover .ckh-step-label{ color:var(--brand-accent); text-decoration-color:var(--brand-accent); }
.ckh-step-inner:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
.ckh-dot{
  width:22px; height:22px; border-radius:50%; flex:none;
  display:grid; place-items:center; font-size:.72rem;
  border:1px solid var(--brand-line); background:var(--brand-surface);
  color:var(--brand-ink-soft);
}
.ckh-step[data-state="past"] .ckh-dot{ background:var(--brand-accent); border-color:var(--brand-accent); color:var(--brand-accent-ink); }
.ckh-step[data-state="past"] .ckh-step-label{ color:var(--brand-ink-soft); }
.ckh-step[data-state="current"] .ckh-dot{ background:var(--brand-accent-soft); border-color:var(--brand-accent); color:var(--brand-accent); }
.ckh-step[data-state="current"] .ckh-step-label{ color:var(--brand-ink); }
.ckh-step[data-state="next"] .ckh-step-label{ color:var(--brand-ink-soft); }
@media (max-width:520px){
  .ckh-step[data-state="next"] .ckh-step-label,
  .ckh-step[data-state="past"] .ckh-step-label{ display:none; }
}
`;
