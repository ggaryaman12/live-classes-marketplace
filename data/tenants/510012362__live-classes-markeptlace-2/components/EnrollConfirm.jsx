"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * EnrollConfirm — the authored moment at the end of the flow, built as a
 * class pass: a perforated ticket with the enrollment code as the largest
 * element after the headline, monospaced and select-all so it can be copied.
 *
 * Two states, and it never fakes one:
 *  - after a real enrollment (an order id in the URL) it shows that code and
 *    the bell mark eases in from visible — an arrival, not a pop.
 *  - before enrollment it shows the same pass as a labelled preview, with
 *    "your code appears here" in place of a code. No invented order number.
 *
 * The mark is CSS only (no WebGL, in keeping with the rest of Bell). Under
 * prefers-reduced-motion nothing animates and the pass is shown complete.
 */

const ORDER_KEYS = ["order", "order_id", "job_id", "enrolled", "job"];

export default function EnrollConfirm(props) {
  return (
    <Suspense fallback={<section className="bell-confirm" aria-busy="true" />}>
      <EnrollConfirmInner {...props} />
    </Suspense>
  );
}

function EnrollConfirmInner({
  previewHeading = "The moment you confirm",
  doneHeading = "Enrolled.",
}) {
  const params = useSearchParams();
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  let code = null;
  for (const k of ORDER_KEYS) {
    const v = params.get(k);
    if (v) {
      code = v;
      break;
    }
  }
  const done = Boolean(code);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(true);
      return;
    }
    const r = requestAnimationFrame(() => setShown(true));
    if (done && ref.current && typeof ref.current.scrollIntoView === "function") {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return () => cancelAnimationFrame(r);
  }, [done]);

  return (
    <section
      ref={ref}
      className="bell-confirm"
      data-done={done}
      data-shown={shown}
      aria-labelledby="bell-confirm-h"
    >
      <div className="bc-frame">
        {!done && (
          <p className="bc-preview-tag">Preview — this is what you’ll get</p>
        )}
        <h2 id="bell-confirm-h">{done ? doneHeading : previewHeading}</h2>
        <p className="bc-lede">
          {done
            ? "Your seat is held. The details are on their way to your inbox and your dashboard."
            : "Confirm below and your seat is held straight away — no waiting on a teacher to accept."}
        </p>

        <div className="bc-pass" role="group" aria-label="Enrollment pass">
          <div className="bc-pass-main">
            <span className="bc-bell" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3.2c-3.6 0-6 2.7-6 6.3 0 4.2-1.4 5.7-2.2 6.6-.5.6-.1 1.6.8 1.6h14.8c.9 0 1.3-1 .8-1.6-.8-.9-2.2-2.4-2.2-6.6 0-3.6-2.4-6.3-6-6.3Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="20.4" r="1.9" fill="var(--brand-accent)" />
              </svg>
            </span>
            <p className="bc-pass-label">Enrollment code</p>
            <p className="bc-code">{done ? code : "appears here"}</p>
            <p className="bc-pass-sub">
              {done
                ? "Keep this — it’s your reference for any change or refund request."
                : "You’ll be able to copy this the moment enrollment goes through."}
            </p>
          </div>
          <div className="bc-pass-stub">
            <ul>
              <li><b>Next</b> Check your dashboard for the exact meeting times, in your timezone.</li>
              <li><b>Join</b> The Join button opens 10 minutes before each meeting.</li>
              <li><b>Roster</b> The teacher will confirm your child’s name and age before day one.</li>
            </ul>
          </div>
        </div>

        {done && (
          <Link className="bc-cta" href="/">
            Back to Bell
          </Link>
        )}
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-confirm{
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:64px 20px 88px; border-top:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-confirm{ padding:88px 32px 120px; } }
.bc-frame{ max-width:640px; margin-inline:auto; text-align:center; }

.bc-preview-tag{
  display:inline-block; margin:0 0 12px; padding:5px 12px;
  border:1px solid var(--brand-line); border-radius:980px;
  font-size:11.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  color:var(--brand-ink-soft); background:var(--brand-surface);
}
.bc-frame h2{
  font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.02em;
  font-size:clamp(1.8rem, 5vw, 2.6rem); margin:0 0 10px;
}
.bc-lede{ margin:0 auto 28px; color:var(--brand-ink-soft); max-width:44ch; font-size:.98rem; line-height:1.5; }

.bc-pass{
  text-align:left; display:grid; gap:0; grid-template-columns:1fr;
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); overflow:hidden;
  box-shadow:0 24px 60px -34px color-mix(in srgb, var(--brand-ink) 60%, transparent);
}
@media (min-width:600px){ .bc-pass{ grid-template-columns:1.15fr 1fr; } }

.bc-pass-main{ padding:26px 24px; position:relative; }
.bc-bell{
  display:inline-flex; color:var(--brand-accent);
  transform:scale(.7); opacity:0;
  transition:transform .9s var(--motion-ease), opacity .5s ease;
}
.bell-confirm[data-shown="true"] .bc-bell{ transform:scale(1); opacity:1; }
.bc-pass-label{
  margin:14px 0 6px; font-size:.72rem; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--brand-ink-soft);
}
.bc-code{
  margin:0 0 10px;
  font-family:"SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
  font-size:clamp(1.5rem, 5.5vw, 2.4rem); font-weight:700; letter-spacing:.02em;
  color:var(--brand-ink); word-break:break-all;
  user-select:all; -webkit-user-select:all;
}
.bell-confirm[data-done="false"] .bc-code{ color:var(--brand-ink-soft); font-style:italic; font-weight:500; }
.bc-pass-sub{ margin:0; font-size:.82rem; color:var(--brand-ink-soft); line-height:1.5; }

.bc-pass-stub{
  padding:24px;
  border-top:1px dashed var(--brand-line);
  background:color-mix(in srgb, var(--brand-accent-soft) 40%, var(--brand-surface));
}
@media (min-width:600px){
  .bc-pass-stub{ border-top:0; border-left:1px dashed var(--brand-line); }
}
.bc-pass-stub ul{ list-style:none; margin:0; padding:0; display:grid; gap:12px; }
.bc-pass-stub li{ font-size:.85rem; color:var(--brand-ink-soft); line-height:1.45; }
.bc-pass-stub b{
  display:block; font-family:var(--brand-font-display); font-weight:600;
  font-size:.72rem; letter-spacing:.06em; text-transform:uppercase;
  color:var(--brand-accent); margin-bottom:2px;
}

.bc-cta{
  display:inline-block; margin-top:26px; padding:12px 22px;
  border-radius:var(--radius); background:var(--brand-accent);
  color:var(--brand-accent-ink); text-decoration:none;
  font-family:var(--brand-font-display); font-weight:600;
  transition:filter var(--motion) var(--motion-ease);
}
.bc-cta:hover{ filter:brightness(1.06); }
.bell-confirm a:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }

@media (prefers-reduced-motion: reduce){
  .bc-bell{ transition:none; transform:none; opacity:1; }
}
`;
