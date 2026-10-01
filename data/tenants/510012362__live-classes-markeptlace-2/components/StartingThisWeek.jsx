"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * StartingThisWeek — the memorable scroll moment. As the page scrolls past
 * this section it pins and a Monday-to-Sunday strip of live classes scrubs
 * sideways; a "now" line sweeps the week and each card lifts as it crosses
 * centre. Reduced-motion / no-JS: a plain horizontally scrollable rail.
 *
 * The classes here are clearly-labelled PLACEHOLDERS. Real sessions appear
 * automatically once teachers publish classes in the Yelo dashboard — no
 * rebuild. Cards link into search (the class page arrives in a later pass).
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CLASSES = [
  { id: "s-201", subj: "life-skills", day: 0, time: "4:00 PM", title: "Dungeons & Dragons for beginners", teacher: "Mr. Oteng", age: "9–12", price: "₹420", seats: 2, hue: "#5C4A7A" },
  { id: "s-202", subj: "maths", day: 1, time: "9:30 AM", title: "Mental maths sprints", teacher: "Ms. Rao", age: "7–9", price: "₹300", seats: 5, hue: "#3E5C8A" },
  { id: "s-203", subj: "art", day: 1, time: "5:30 PM", title: "Draw your own comic", teacher: "Ms. Bello", age: "8–12", price: "₹480", seats: 0, hue: "#8A5038" },
  { id: "s-204", subj: "science", day: 2, time: "3:00 PM", title: "Kitchen chemistry", teacher: "Dr. Fenn", age: "10–13", price: "₹520", seats: 3, hue: "#4E6B3A" },
  { id: "s-205", subj: "languages", day: 3, time: "10:00 AM", title: "Spanish through games", teacher: "Sra. Diaz", age: "6–8", price: "₹360", seats: 4, hue: "#2F6F7A" },
  { id: "s-206", subj: "coding", day: 4, time: "4:30 PM", title: "Build a game in Scratch", teacher: "Mr. Park", age: "8–11", price: "₹450", seats: 1, hue: "#5C4A7A" },
  { id: "s-207", subj: "english", day: 5, time: "11:00 AM", title: "Creative writing workshop", teacher: "Ms. Levy", age: "11–14", price: "₹500", seats: 6, hue: "#7A4A6B" },
  { id: "s-208", subj: "life-skills", day: 5, time: "2:00 PM", title: "Intro to chess tactics", teacher: "CM Adisa", age: "7–10", price: "₹380", seats: 3, hue: "#8A6A1E" },
  { id: "s-209", subj: "science", day: 6, time: "5:00 PM", title: "Nature journaling", teacher: "Ms. Wong", age: "6–10", price: "₹340", seats: 8, hue: "#4E6B3A" },
];

export default function StartingThisWeek({
  heading = "Starting this week",
  browseHref = "/stores",
}) {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const [interactive, setInteractive] = useState(false);
  const nowIndex = 2; // Wed, placeholder "today"

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    setInteractive(true);

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const wrap = wrapRef.current;
        const track = trackRef.current;
        if (!wrap || !track) return;
        const rect = wrap.getBoundingClientRect();
        const span = rect.height - window.innerHeight;
        const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, span)));
        const max = track.scrollWidth - track.parentElement.clientWidth;
        track.style.transform = `translate3d(${-(p * Math.max(0, max)).toFixed(1)}px,0,0)`;
        track.style.setProperty("--sweep", p.toFixed(4));
        for (const card of track.querySelectorAll(".stw-card")) {
          const cr = card.getBoundingClientRect();
          const dist = Math.abs(cr.left + cr.width / 2 - window.innerWidth / 2);
          const lift = Math.max(0, 1 - dist / (window.innerWidth * 0.6));
          card.style.setProperty("--lift", lift.toFixed(3));
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      ref={wrapRef}
      className="bell-week"
      data-interactive={interactive}
      aria-labelledby="bell-week-h"
    >
      <div className="stw-sticky">
        <header className="stw-head">
          <div>
            <h2 id="bell-week-h">{heading}</h2>
            <p>
              Live sessions with open seats over the next seven days, in your
              timezone.
            </p>
          </div>
          <Link className="stw-all" href={`${browseHref}?sort=soonest`}>
            See all this week
          </Link>
        </header>

        <div className="stw-viewport">
          <div ref={trackRef} className="stw-track">
            <div className="stw-rail" aria-hidden="true">
              {DAYS.map((d, i) => (
                <span key={d} className="stw-day" data-now={i === nowIndex}>
                  {d}
                </span>
              ))}
              <span className="stw-now" />
            </div>

            <ol className="stw-cards">
              {CLASSES.map((c) => (
                <li
                  key={c.id}
                  className="stw-card"
                  style={{ "--col": c.day + 1, "--hue": c.hue }}
                >
                  <Link href={`${browseHref}?subject=${c.subj}`}>
                    <span className="stw-when">
                      {DAYS[c.day]} · {c.time}
                    </span>
                    <span className="stw-title">{c.title}</span>
                    <span className="stw-meta">
                      {c.teacher} · ages {c.age}
                    </span>
                    <span className="stw-foot">
                      <b>{c.price}</b>
                      <span className="stw-unit">/ session</span>
                      <span
                        className="stw-seats"
                        data-full={c.seats === 0}
                      >
                        {c.seats === 0
                          ? "Join waitlist"
                          : `${c.seats} seat${c.seats === 1 ? "" : "s"} left`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className="stw-note">
          Sample classes for layout. Your teachers’ real sessions show here once
          they publish in the dashboard.
        </p>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-week{
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
.bell-week[data-interactive="true"]{ height:280vh; }
.bell-week[data-interactive="true"] .stw-sticky{
  position:sticky; top:0; min-height:100vh;
  display:flex; flex-direction:column; justify-content:center;
  padding:48px 20px;
}
.stw-sticky{ padding:64px 20px; max-width:1280px; margin-inline:auto; }
@media (min-width:820px){ .stw-sticky{ padding:96px 32px; } }

.stw-head{ display:flex; flex-wrap:wrap; gap:12px 24px; align-items:end; justify-content:space-between; margin-bottom:28px; }
.stw-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.35rem); margin:0 0 6px; }
.stw-head p{ margin:0; color:var(--brand-ink-soft); max-width:44ch; }
.stw-all{ color:var(--brand-accent); font-weight:600; text-decoration:underline; text-underline-offset:3px; white-space:nowrap; }

.stw-viewport{ overflow:hidden; position:relative; }
.bell-week:not([data-interactive="true"]) .stw-viewport{ overflow-x:auto; scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch; }
.stw-track{ will-change:transform; }

.stw-rail{
  position:relative; display:grid;
  grid-template-columns:repeat(7, minmax(180px, 1fr));
  gap:16px; padding:0 4px 10px;
  border-bottom:1px solid var(--brand-line);
}
.stw-day{ font-family:var(--brand-font-display); font-weight:600; font-size:.9rem; color:var(--brand-ink-soft); }
.stw-day[data-now="true"]{ color:var(--brand-accent); }
.stw-now{
  position:absolute; top:0; bottom:0;
  left:calc((100% - 6 * 16px) / 7 * (2.5) + 16px * 2.5);
  width:2px; background:var(--brand-accent);
  transform:translateX(calc(var(--sweep, 0) * 40vw));
  opacity:.5;
}

.stw-cards{
  list-style:none; margin:0; padding:20px 4px 4px;
  display:grid; grid-template-columns:repeat(7, minmax(180px, 1fr));
  gap:16px; align-items:start;
}
.stw-card{ grid-column:var(--col); scroll-snap-align:start; }
.stw-card a{
  display:flex; flex-direction:column; gap:6px;
  padding:14px; border-radius:var(--radius);
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  border-top:3px solid color-mix(in srgb, var(--hue) 55%, var(--brand-line));
  color:var(--brand-ink); text-decoration:none;
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
  transform:translateY(calc(var(--lift, 0) * -8px));
  transition:transform .35s var(--motion-ease), box-shadow .35s var(--motion-ease);
}
.stw-card a:hover{ box-shadow:0 20px 40px -24px color-mix(in srgb, var(--brand-ink) 55%, transparent); }
.stw-when{ font-size:.78rem; font-weight:600; color:var(--brand-accent); letter-spacing:.02em; }
.stw-title{ font-family:var(--brand-font-display); font-weight:600; font-size:1rem; line-height:1.25; }
.stw-meta{ font-size:.82rem; color:var(--brand-ink-soft); }
.stw-foot{ display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; margin-top:4px; font-size:.9rem; }
.stw-foot b{ font-weight:600; font-variant-numeric:tabular-nums; }
.stw-unit{ font-size:.76rem; color:var(--brand-ink-soft); }
.stw-seats{ margin-left:auto; font-size:.76rem; font-weight:600; color:var(--brand-ink-soft); }
.stw-seats[data-full="true"]{ color:var(--brand-accent); }

.stw-note{ margin:22px 0 0; font-size:.8rem; color:var(--brand-ink-soft); font-style:italic; }

.stw-card a:focus-visible, .stw-all:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

@media (prefers-reduced-motion: reduce){
  .bell-week[data-interactive="true"]{ height:auto; }
  .bell-week[data-interactive="true"] .stw-sticky{ position:static; min-height:0; }
  .stw-track{ transform:none !important; }
  .stw-card a{ transform:none; transition:none; }
  .stw-now{ display:none; }
}
`;
