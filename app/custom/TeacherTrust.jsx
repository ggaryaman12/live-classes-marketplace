"use client";

/**
 * TeacherTrust — closing band on a teacher's profile. Plain-language notes on
 * verification and how enrollment works, plus the messaging entry point,
 * which is deliberately disabled for this first pass (a control that posts
 * nowhere is worse than no control) with the reason shown.
 */

const NOTES = [
  {
    t: "Reviewed before listing",
    b: "Teachers submit their experience and verification before any class goes live, and every new class is checked by our team before parents can enrol.",
  },
  {
    t: "You enrol in one session",
    b: "Not the whole course — a specific scheduled run with its own start date, meeting times and seat count.",
  },
  {
    t: "Times in your timezone",
    b: "Every meeting time on this page is shown in your own timezone, with the zone named next to it. The teacher sets times in theirs.",
  },
  {
    t: "Full session? Join the waitlist",
    b: "Seats are capped and never oversold. If a run is full you can add your child to the waitlist for the next open seat.",
  },
];

export default function TeacherTrust({
  heading = "Enrolling with this teacher",
  browseHref = "/stores",
}) {
  return (
    <section className="bell-tt" aria-labelledby="bell-tt-h">
      <div className="tt-frame">
        <h2 id="bell-tt-h">{heading}</h2>

        <ul className="tt-grid">
          {NOTES.map((n) => (
            <li key={n.t}>
              <h3>{n.t}</h3>
              <p>{n.b}</p>
            </li>
          ))}
        </ul>

        <div className="tt-msg">
          <div>
            <h3>Have a question before you enrol?</h3>
            <p>
              Direct messaging with teachers is arriving soon. For now, class
              details and learning goals live on each class below.
            </p>
          </div>
          <button type="button" disabled aria-disabled="true" title="Messaging is not available yet">
            Message teacher — soon
          </button>
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-tt{
  background:var(--brand-accent-soft); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:72px 20px; border-top:1px solid var(--brand-line);
}
[data-theme="dark"] .bell-tt{ background:color-mix(in srgb, var(--brand-accent-soft) 55%, var(--brand-paper)); }
@media (min-width:820px){ .bell-tt{ padding:104px 32px; } }
.tt-frame{ max-width:1100px; margin-inline:auto; }
.tt-frame > h2{
  font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em;
  font-size:clamp(1.5rem,3.6vw,2.1rem); margin:0 0 28px;
}
.tt-grid{
  list-style:none; margin:0 0 24px; padding:0;
  display:grid; gap:16px; grid-template-columns:1fr;
}
@media (min-width:640px){ .tt-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:1000px){ .tt-grid{ grid-template-columns:repeat(4,1fr); } }
.tt-grid li{
  background:var(--brand-surface); border:1px solid var(--brand-line);
  border-radius:var(--radius); padding:18px;
}
.tt-grid h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1rem; margin:0 0 7px; }
.tt-grid p{ margin:0; color:var(--brand-ink-soft); font-size:.88rem; line-height:1.5; }

.tt-msg{
  display:flex; flex-wrap:wrap; gap:16px 24px; align-items:center; justify-content:space-between;
  background:var(--brand-surface); border:1px solid var(--brand-line);
  border-radius:var(--radius-lg); padding:22px;
}
.tt-msg h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1.05rem; margin:0 0 6px; }
.tt-msg p{ margin:0; color:var(--brand-ink-soft); font-size:.9rem; max-width:52ch; }
.tt-msg button{
  border:1px dashed var(--brand-line); background:var(--brand-paper);
  color:var(--brand-ink-soft); font:inherit; font-weight:600; font-size:.86rem;
  padding:11px 18px; border-radius:var(--radius); cursor:not-allowed; white-space:nowrap;
}
.bell-tt button:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
`;
