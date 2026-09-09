"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * RecurringSummary — shows on checkout when arriving from the class page's
 * Subscribe scheduler (?recurring=1&days=...&start=...&time=...&endMode=...).
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
  if (params.get("recurring") !== "1") return null;

  const days = (params.get("days") || "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
  const start = params.get("start");
  const time = params.get("time");
  const endMode = params.get("endMode");
  const endDate = params.get("endDate");
  const occurrences = params.get("occurrences");
  const frequency = params.get("frequency");

  return (
    <section className="bell-rs" aria-labelledby="bell-rs-h">
      <div className="rs-frame">
        <h2 id="bell-rs-h">{heading}</h2>
        <dl className="rs-grid">
          {frequency && (
            <div>
              <dt>Frequency</dt>
              <dd style={{ textTransform: "capitalize" }}>{frequency}</dd>
            </div>
          )}
          {days && (
            <div>
              <dt>Days</dt>
              <dd>{days}</dd>
            </div>
          )}
          {start && (
            <div>
              <dt>Starts</dt>
              <dd>{start}{time ? ` · ${time}` : ""}</dd>
            </div>
          )}
          <div>
            <dt>Ends</dt>
            <dd>{endMode === "occurrences" ? `After ${occurrences} session${occurrences === "1" ? "" : "s"}` : endDate || "—"}</dd>
          </div>
        </dl>
        <p className="rs-note">
          This is a recap of the schedule you chose — confirm and pay below.
        </p>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-rs{ background:var(--brand-accent-soft); color:var(--brand-ink); font-family:var(--brand-font-body); padding:28px 20px; border-bottom:1px solid var(--brand-line); }
[data-theme="dark"] .bell-rs{ background:color-mix(in srgb, var(--brand-accent-soft) 55%, var(--brand-paper)); }
@media (min-width:820px){ .bell-rs{ padding:36px 32px; } }
.rs-frame{ max-width:720px; margin-inline:auto; }
.rs-frame h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:1.2rem; margin:0 0 14px; }
.rs-grid{ margin:0 0 12px; display:grid; gap:12px; grid-template-columns:repeat(2,1fr); }
@media (min-width:560px){ .rs-grid{ grid-template-columns:repeat(4,1fr); } }
.rs-grid dt{ font-size:.7rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--brand-ink-soft); margin-bottom:3px; }
.rs-grid dd{ margin:0; font-weight:600; font-size:.9rem; }
.rs-note{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); font-style:italic; }
`;
