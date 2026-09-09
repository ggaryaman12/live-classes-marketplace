"use client";

import { Suspense, useEffect, useRef, useState } from "react";

/**
 * EnrollHeader — compact depth banner above the enrollment panel. Layered
 * parallax of drifting calendar pages and a ticket stub at three depths, a
 * headline that wipes in word by word, and a three-step marker for the flow
 * below (review · details · pay).
 *
 * prefers-reduced-motion: no drift, headline shown immediately.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const HEADLINE = ["You’re", "one", "step", "from", "enrolled."];
const STEPS = ["Review the session", "Add your details", "Confirm & pay"];

export default function EnrollHeader(props) {
  return (
    <Suspense fallback={<section className="bell-enroll-head" aria-busy="true" />}>
      <EnrollHeaderInner {...props} />
    </Suspense>
  );
}

function EnrollHeaderInner({
  eyebrow = "Enrolling in one live session",
}) {
  const rootRef = useRef(null);
  const p1 = useRef(null);
  const p2 = useRef(null);
  const p3 = useRef(null);
  const [ready, setReady] = useState(false);
  const [tz, setTz] = useState("your local time");

  useEffect(() => {
    if (!document.querySelector("link[data-bell-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONT_LINK;
      l.setAttribute("data-bell-fonts", "");
      document.head.appendChild(l);
    }
    const t = setTimeout(() => setReady(true), 60);
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time");
    } catch {
      /* keep default */
    }
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const tick = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      const s = window.scrollY || 0;
      if (p1.current) p1.current.style.transform = `translate3d(${cx * 6}px, ${cy * 4 + s * 0.04}px, 0) rotate(-4deg)`;
      if (p2.current) p2.current.style.transform = `translate3d(${cx * 15}px, ${cy * 10 - s * 0.03}px, 0) rotate(6deg)`;
      if (p3.current) p3.current.style.transform = `translate3d(${cx * 26}px, ${cy * 16 - s * 0.06}px, 0) rotate(-2deg)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <section ref={rootRef} className="bell-enroll-head" data-ready={ready} aria-label="Enrollment">
      <div ref={p3} className="eh-plane eh-p3" aria-hidden="true"><span className="eh-cal" /></div>
      <div ref={p2} className="eh-plane eh-p2" aria-hidden="true"><span className="eh-cal eh-cal-b" /></div>
      <div ref={p1} className="eh-plane eh-p1" aria-hidden="true"><span className="eh-stub" /></div>

      <div className="eh-frame">
        <p className="eh-eyebrow">{eyebrow}</p>
        <h1 className="eh-title">
          {HEADLINE.map((w, i) => (
            <span key={i} className="eh-word" style={{ "--i": i }}>
              <span>{w}</span>
              {i < HEADLINE.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>
        <ol className="eh-steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="eh-n">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="eh-note">
          Meeting times below show in <b>{tz}</b>. You’re enrolling under your
          account — the teacher will ask for your child’s name and age before
          the first meeting.
        </p>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-enroll-head{
  position:relative; isolation:isolate; overflow:hidden;
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:72px 20px 44px; border-bottom:1px solid var(--brand-line);
  min-height:320px;
}
@media (min-width:820px){ .bell-enroll-head{ padding:96px 32px 56px; } }

.eh-plane{ position:absolute; z-index:0; will-change:transform; pointer-events:none; }
.eh-p1{ inset:auto 4% 8% auto; z-index:1; }
.eh-p2{ inset:12% auto auto 3%; }
.eh-p3{ inset:-6% 18% auto auto; opacity:.5; filter:blur(2px); }
.eh-cal{
  display:block; width:clamp(90px,14vw,140px); aspect-ratio:4/5;
  border-radius:var(--radius);
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  border-top:10px solid color-mix(in srgb, var(--brand-accent) 45%, var(--brand-line));
  box-shadow:0 18px 40px -22px color-mix(in srgb, var(--brand-ink) 45%, transparent);
}
.eh-cal-b{ border-top-color:color-mix(in srgb, #2F6F7A 45%, var(--brand-line)); }
.eh-stub{
  display:block; width:clamp(120px,18vw,180px); height:64px;
  border-radius:12px;
  background:var(--brand-accent-soft);
  border:1px dashed color-mix(in srgb, var(--brand-accent) 40%, var(--brand-line));
  mask:radial-gradient(circle at left center, transparent 8px, #000 9px),
       radial-gradient(circle at right center, transparent 8px, #000 9px);
  mask-composite:intersect;
}

.eh-frame{ position:relative; z-index:2; max-width:720px; margin-inline:auto; text-align:center; }
.eh-eyebrow{
  display:inline-block; margin:0 0 14px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 82%, transparent);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.eh-title{
  font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.02em; line-height:1.06;
  font-size:clamp(1.9rem, 5.6vw, 3rem);
  margin:0 0 22px;
}
.eh-word{ display:inline-block; overflow:hidden; }
.eh-word > span{
  display:inline-block; transform:translateY(105%);
  transition:transform .55s var(--motion-ease);
  transition-delay:calc(var(--i) * 55ms + 80ms);
}
.bell-enroll-head[data-ready="true"] .eh-word > span{ transform:translateY(0); }

.eh-steps{
  list-style:none; margin:0 auto 18px; padding:0;
  display:flex; flex-wrap:wrap; gap:8px 10px; justify-content:center;
  font-size:.86rem; font-weight:600;
}
.eh-steps li{ display:flex; align-items:center; gap:7px; color:var(--brand-ink-soft); }
.eh-n{
  width:22px; height:22px; border-radius:50%;
  display:grid; place-items:center; font-size:.74rem;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display);
}
.eh-note{ margin:0; font-size:12.5px; color:var(--brand-ink-soft); line-height:1.6; max-width:52ch; margin-inline:auto; }
.eh-note b{ color:var(--brand-ink); }

@media (prefers-reduced-motion: reduce){
  .eh-plane{ transform:none !important; }
  .eh-word > span{ transform:none; transition:none; }
}
`;
