"use client";

/**
 * TeacherFAQ — three common questions on a teacher's page, answered with
 * facts already true elsewhere on Bell (timezone display, waitlist on a
 * full session, the age-range warning) rather than inventing a policy that
 * isn't established anywhere else in the product.
 *
 * Native <details>/<summary> — keyboard and screen-reader accessible with
 * no extra JS, no layout animation on open (height auto, no measured
 * transition), holds under prefers-reduced-motion by construction.
 */

const FAQS = [
  {
    q: "What timezone are the class times shown in?",
    a: "Always yours — every meeting time on this page is shown in your own timezone, with the zone spelled out next to it. The teacher sets their times in theirs; the conversion is automatic.",
  },
  {
    q: "What happens if a session is full?",
    a: "You can join the waitlist for that session and take the next open seat if one opens up. Seats are capped and never oversold.",
  },
  {
    q: "My child is just outside the listed age range — can they still join?",
    a: "You'll see a warning at enrollment, but you can go ahead. Plenty of teachers are glad to adjust for a motivated learner just outside the range.",
  },
];

export default function TeacherFAQ({
  heading = "Questions parents ask",
}) {
  return (
    <section className="bell-faq" aria-labelledby="bell-faq-h">
      <div className="faq-frame">
        <h2 id="bell-faq-h">{heading}</h2>
        <div className="faq-list">
          {FAQS.map((f) => (
            <details key={f.q} className="faq-item">
              <summary>
                <span>{f.q}</span>
                <span className="faq-chevron" aria-hidden="true">⌄</span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-faq{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-faq{ padding:80px 32px; } }
.faq-frame{ max-width:820px; margin-inline:auto; }
.faq-frame > h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0 0 22px; }

.faq-list{ display:grid; gap:10px; }
.faq-item{
  border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-surface); padding:4px 18px;
}
.faq-item summary{
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:14px 0; cursor:pointer; list-style:none;
  font-family:var(--brand-font-display); font-weight:600; font-size:.98rem;
}
.faq-item summary::-webkit-details-marker{ display:none; }
.faq-chevron{ flex:0 0 auto; color:var(--brand-ink-soft); transition:transform var(--motion) var(--motion-ease); }
.faq-item[open] .faq-chevron{ transform:rotate(180deg); }
.faq-item p{ margin:0 0 16px; color:var(--brand-ink-soft); font-size:.92rem; line-height:1.6; }

.faq-item summary:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; border-radius:6px; }
`;
