"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * UpcomingClasses — "Upcoming live classes" on a teacher's profile: the next
 * scheduled run of each class this teacher runs, with title, date/time (in
 * the viewer's timezone), price, and seats left. Complements the Catalogue
 * below it — Catalogue is what classes exist, this is when they next meet.
 *
 * There is no per-teacher session endpoint on Yelo yet, so this renders
 * clearly-labelled SAMPLE sessions. "Enroll" goes to the real checkout flow;
 * a full session is shown as a waitlist, never as addable.
 */

const CLASSES = [
  { id: "u1", title: "Junior Robotics: Build, Code, Play", date: "2026-09-11T16:00:00", price: 450, seatsTotal: 8, seatsFilled: 6 },
  { id: "u2", title: "Scratch Game Jam", date: "2026-09-09T17:30:00", price: 420, seatsTotal: 6, seatsFilled: 6 },
  { id: "u3", title: "Python for Curious Minds", date: "2026-09-10T16:30:00", price: 460, seatsTotal: 8, seatsFilled: 3 },
  { id: "u4", title: "Robotics Show & Tell", date: "2026-09-13T11:00:00", price: 400, seatsTotal: 8, seatsFilled: 7 },
];

export default function UpcomingClasses({
  heading = "Upcoming live classes",
}) {
  const [tz, setTz] = useState("your local time");

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time");
    } catch {
      /* keep default */
    }
  }, []);

  return (
    <section className="bell-uc" aria-labelledby="bell-uc-h">
      <div className="uc-frame">
        <div className="uc-head">
          <div>
            <h2 id="bell-uc-h">{heading}</h2>
            <p>Next scheduled session of each class, shown in {tz}.</p>
          </div>
          <span className="uc-sample-tag">Sample sessions — for layout</span>
        </div>

        <ul className="uc-list">
          {CLASSES.map((c, i) => {
            const seatsLeft = c.seatsTotal - c.seatsFilled;
            const full = seatsLeft <= 0;
            const low = !full && seatsLeft <= 2;
            const d = new Date(c.date);
            const when = d.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
            return (
              <li key={c.id} className="uc-row" style={{ "--i": i }}>
                <p className="uc-title">{c.title}</p>
                <p className="uc-when">{when}</p>
                <p className="uc-price"><b>₹{c.price}</b> <i>/ session</i></p>
                <p className="uc-seats" data-full={full} data-low={low}>
                  {full ? "Full — waitlist" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
                </p>
                <Link
                  href={`/checkout?class=${encodeURIComponent(c.title)}&session=${c.id}`}
                  className="uc-cta"
                  data-full={full}
                >
                  {full ? "Join waitlist" : "Enroll"}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-uc{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-uc{ padding:80px 32px; } }
.uc-frame{ max-width:1100px; margin-inline:auto; }
.uc-head{ display:flex; flex-wrap:wrap; gap:10px 16px; align-items:flex-start; justify-content:space-between; margin-bottom:22px; }
.uc-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0 0 4px; }
.uc-head p{ margin:0; color:var(--brand-ink-soft); font-size:.88rem; }
.uc-sample-tag{
  flex:0 0 auto; align-self:flex-start;
  padding:5px 12px; border-radius:980px; border:1px solid var(--brand-line);
  background:var(--brand-surface); color:var(--brand-ink-soft);
  font-size:11.5px; font-weight:700;
}

.uc-list{ list-style:none; margin:0; padding:0; border-top:1px solid var(--brand-line); }
.uc-row{
  display:grid; gap:6px 14px; align-items:center; padding:16px 4px;
  border-bottom:1px solid var(--brand-line);
  grid-template-columns:1fr; opacity:0; animation:uc-in .5s var(--motion-ease) forwards;
  animation-delay:calc(var(--i) * 70ms);
}
@media (min-width:760px){
  .uc-row{ grid-template-columns:2fr 1.3fr .9fr 1fr auto; }
}
@keyframes uc-in{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }

.uc-title{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1rem; }
.uc-when{ margin:0; color:var(--brand-ink-soft); font-size:.86rem; }
.uc-price{ margin:0; font-size:.9rem; }
.uc-price b{ font-variant-numeric:tabular-nums; }
.uc-price i{ font-style:normal; color:var(--brand-ink-soft); font-size:.78rem; }
.uc-seats{ margin:0; font-size:.82rem; font-weight:600; color:var(--brand-ink-soft); }
.uc-seats[data-low="true"]{ color:var(--brand-accent); }
.uc-seats[data-full="true"]{ color:var(--brand-accent); }
.uc-cta{
  justify-self:start;
  display:inline-flex; align-items:center; padding:9px 16px; border-radius:var(--radius);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; font-size:.86rem; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.uc-cta:hover{ filter:brightness(1.06); }
.uc-cta[data-full="true"]{ background:var(--brand-ink-soft); }
@media (min-width:760px){ .uc-cta{ justify-self:end; } }

.uc-cta:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

@media (prefers-reduced-motion: reduce){
  .uc-row{ opacity:1; animation:none; }
}
`;
