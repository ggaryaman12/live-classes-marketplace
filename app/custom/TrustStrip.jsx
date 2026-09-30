"use client";

import Link from "next/link";

/**
 * TrustStrip — the closing band. A parent is about to hand over money for
 * their child; this is the plain-language reassurance about who teaches and
 * how sessions run. No claims the backend can't stand behind — links go to
 * pages that exist (search).
 */

const POINTS = [
  {
    title: "Teachers are reviewed before they list",
    body: "Every teacher submits their experience and verification before a single class goes live, and new classes are checked before parents can see them.",
  },
  {
    title: "Small groups, capped seats",
    body: "Class sizes are set by the teacher and never oversold. When a session is full you can join the waitlist instead.",
  },
  {
    title: "Your timezone, spelled out",
    body: "Meeting times always display in your own timezone with the zone named next to them, so there's no mental maths on a school night.",
  },
  {
    title: "One session at a time",
    body: "You enroll your child in a specific scheduled run, not an open-ended course. You always know exactly which meetings you paid for.",
  },
];

export default function TrustStrip({
  heading = "Enough to feel good about handing over the tablet",
  browseHref = "/stores",
  classHref = "/p/class",
}) {
  return (
    <section className="bell-trust" aria-labelledby="bell-trust-h">
      <div className="bt-frame">
        <h2 id="bell-trust-h">{heading}</h2>
        <ul className="bt-grid">
          {POINTS.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
        <div className="bt-cta">
          <Link className="bt-btn" href={browseHref}>
            Browse every class
          </Link>
          <Link className="bt-link" href={classHref}>
            See what a class page looks like →
          </Link>
          <span>Add Bell to your home screen to check the week at a glance.</span>
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-trust{
  background:var(--brand-accent-soft); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:72px 20px; border-bottom:1px solid var(--brand-line);
}
[data-theme="dark"] .bell-trust{ background:color-mix(in srgb, var(--brand-accent-soft) 60%, var(--brand-paper)); }
@media (min-width:820px){ .bell-trust{ padding:104px 32px; } }
.bt-frame{ max-width:1200px; margin-inline:auto; }
.bt-frame h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.35rem); margin:0 0 32px; max-width:20ch; }

.bt-grid{ list-style:none; margin:0 0 36px; padding:0; display:grid; gap:20px; grid-template-columns:1fr; }
@media (min-width:640px){ .bt-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:1000px){ .bt-grid{ grid-template-columns:repeat(4,1fr); } }
.bt-grid li{
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  border-radius:var(--radius);
  padding:20px;
}
.bt-grid h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1.02rem; margin:0 0 8px; }
.bt-grid p{ margin:0; color:var(--brand-ink-soft); font-size:.9rem; line-height:1.55; }

.bt-cta{ display:flex; flex-wrap:wrap; align-items:center; gap:14px 20px; }
.bt-btn{
  display:inline-block; padding:12px 22px; border-radius:var(--radius);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.bt-btn:hover{ filter:brightness(1.06); }
.bt-link{
  font-size:.9rem; font-weight:600; color:var(--brand-accent);
  text-decoration:underline; text-underline-offset:3px;
}
.bt-cta span{ font-size:.88rem; color:var(--brand-ink-soft); }
.bt-btn:focus-visible, .bt-link:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }
`;
