"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * RecurringSummary — shows on checkout when arriving from the class page's
 * Subscribe scheduler (?recurring=1&days=...&start=...&time=...&occurrences=...).
 * Purely a recap of the schedule the parent picked, above the real
 * CheckoutPanel/BillBreakdown — informational only. Completing a real
 * subscription (`recurring/saveRecurringTask`) requires a signed-in
 * customer session, which this storefront doesn't have wired yet, so this
 * doesn't claim to submit the recurring order itself; the CheckoutPanel
 * below still handles the actual payment step it already does.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function RecurringSummary(props) {
  return (
    <Suspense fallback={null}>
      <RecurringSummaryInner {...props} />
    </Suspense>
  );
}

function RecurringSummaryInner({
  heading = "Your subscription",
}) {
  const params = useSearchParams();
  // Only in stage 2 (details & payment) — while the scheduler is still up top
  // (no time yet, or the parent stepped back to edit) this recap is noise.
  if (params.get("recurring") !== "1" || !params.get("time") || params.get("step") === "schedule") {
    return null;
  }

  const days = (params.get("days") || "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
  const start = params.get("start");
  const time = params.get("time");
  const occurrences = params.get("occurrences");
  const frequency = params.get("frequency");

  const endLabel = occurrences ? `Ends after ${occurrences} session${occurrences === "1" ? "" : "s"}` : null;

  return (
    <section className="bell-rs" aria-labelledby="bell-rs-h">
      <div className="rs-frame">
        <h2 id="bell-rs-h">{heading}</h2>
        <ul className="rs-chips">
          {frequency && <li className="rs-chip rs-chip-cap">{frequency}</li>}
          {days && <li className="rs-chip">{days}</li>}
          {start && <li className="rs-chip">From {start}{time ? ` · ${time}` : ""}</li>}
          {endLabel && <li className="rs-chip">{endLabel}</li>}
        </ul>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-rs{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); border-bottom:1px solid var(--brand-line); }
.rs-frame{ max-width:1000px; margin-inline:auto; padding:14px clamp(14px,3.5vw,36px) 16px; display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; }
.rs-frame h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:.95rem; margin:0; }
.rs-chips{ list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
.rs-chip{
  padding:4px 10px; border-radius:980px; font-size:.76rem; font-weight:600;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.rs-chip-cap{ text-transform:capitalize; }
`;
