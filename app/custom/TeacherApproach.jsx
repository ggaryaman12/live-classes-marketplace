"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TeacherApproach — the depth section on a teacher's profile. It sits under
 * the live StoreHeader (which carries the teacher's real name, rating and
 * subjects) and gives the page its atmosphere: a "lesson board" of layered
 * parallax planes — ruled paper, drifting supplies — behind a statement that
 * wipes in, then three "what a class with me looks like" moments that rise
 * in as the section enters view.
 *
 * The reveal is triggered by IntersectionObserver, not by scroll distance
 * through a tall pinned region — a section that only reveals after ~2
 * viewport-heights of scrolling reads as broken when it's already on screen
 * at page load (it was: text sat fully invisible, clipped/opacity-0, until
 * scrolled deep into). The observer fires as soon as the section is on
 * screen, including immediately on mount if it already is, so nothing ever
 * sits blank.
 *
 * The copy here is about how live classes run on Bell, not claims about a
 * specific teacher, so it stays honest whichever profile it renders on.
 * prefers-reduced-motion: no drift, no wipe — everything shown at once.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const MOMENTS = [
  {
    k: "Before",
    t: "You get the meeting link and a short note on what to bring",
    b: "Every session shows its exact meeting times in your timezone. The Join button opens ten minutes early so there's no scramble at the top of the hour.",
  },
  {
    k: "During",
    t: "A small group on video, cameras on, everyone gets airtime",
    b: "Group size is capped and never oversold. If a session is full you join the waitlist and take the next open seat.",
  },
  {
    k: "After",
    t: "A recap of what the class covered and what comes next",
    b: "You enrolled your child in one scheduled run — you always know which meetings you paid for and when the next one is.",
  },
];

export default function TeacherApproach({
  eyebrow = "How a class runs",
  statement = "Live means a real teacher, a set time each week, and a room small enough that your child is seen.",
}) {
  const wrapRef = useRef(null);
  const p1 = useRef(null);
  const p2 = useRef(null);
  const p3 = useRef(null);
  const [interactive, setInteractive] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!document.querySelector("link[data-bell-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONT_LINK;
      l.setAttribute("data-bell-fonts", "");
      document.head.appendChild(l);
    }
  }, []);

  // reveal once the section is actually on screen — fires immediately if
  // it already is at mount, so the section is never sitting blank
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setInteractive(true);
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e) => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const loop = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      const onScreen = rect && rect.bottom > -200 && rect.top < window.innerHeight + 200;
      if (onScreen) {
        cx += (tx - cx) * 0.05;
        cy += (ty - cy) * 0.05;
        const s = window.scrollY || 0;
        if (p1.current) p1.current.style.transform = `translate3d(${cx * 6}px, ${cy * 4 + s * 0.03}px, 0)`;
        if (p2.current) p2.current.style.transform = `translate3d(${cx * 16}px, ${cy * 11 - s * 0.02}px, 0)`;
        if (p3.current) p3.current.style.transform = `translate3d(${cx * 28}px, ${cy * 18 - s * 0.05}px, 0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const wipe = !interactive || revealed ? 1 : 0;

  return (
    <section
      ref={wrapRef}
      className="bell-approach"
      data-interactive={interactive}
      data-revealed={revealed}
      aria-labelledby="bell-approach-h"
    >
      <div className="ta-sticky">
        <div ref={p3} className="ta-plane ta-p3" aria-hidden="true"><span className="ta-rule" /></div>
        <div ref={p2} className="ta-plane ta-p2" aria-hidden="true">
          <span className="ta-doodle" style={{ left: "8%", top: "16%" }}>📐</span>
          <span className="ta-doodle" style={{ right: "10%", top: "12%" }}>📖</span>
          <span className="ta-doodle" style={{ right: "16%", bottom: "18%" }}>🎵</span>
          <span className="ta-doodle" style={{ left: "12%", bottom: "14%" }}>🧭</span>
        </div>
        <div ref={p1} className="ta-plane ta-p1" aria-hidden="true">
          <span className="ta-chip">Cameras on</span>
          <span className="ta-chip ta-chip-b">Capped seats</span>
        </div>

        <div className="ta-frame">
          <p className="ta-eyebrow">{eyebrow}</p>
          <h2 id="bell-approach-h" className="ta-statement">
            <span
              className="ta-statement-inner"
              style={{ clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}
            >
              {statement}
            </span>
          </h2>

          <ol className="ta-moments">
            {MOMENTS.map((m, i) => (
              <li key={m.k} style={{ "--i": i }}>
                <span className="ta-k">{m.k}</span>
                <h3>{m.t}</h3>
                <p>{m.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-approach{
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
.ta-sticky{
  position:relative; overflow:hidden;
  padding:72px 20px;
  max-width:1100px; margin-inline:auto;
}
@media (min-width:820px){ .ta-sticky{ padding:110px 32px; } }

.ta-plane{ position:absolute; inset:-8% -6%; z-index:0; will-change:transform; pointer-events:none; }
.ta-p3{ opacity:.4; }
.ta-rule{
  position:absolute; inset:0;
  background-image:repeating-linear-gradient(
    to bottom, transparent 0 33px,
    color-mix(in srgb, var(--brand-accent) 22%, var(--brand-line)) 33px 34px);
  mask-image:radial-gradient(70% 60% at 50% 45%, #000, transparent 75%);
}
.ta-p2 .ta-doodle{ position:absolute; font-size:clamp(20px,3.6vw,32px); opacity:.55; }
.ta-p1{ z-index:1; }
.ta-chip{
  position:absolute; left:4%; top:26%;
  padding:7px 12px; border-radius:980px;
  background:var(--brand-surface); border:1px solid var(--brand-line);
  font-size:12px; font-weight:600; color:var(--brand-ink-soft);
  box-shadow:0 12px 28px -16px color-mix(in srgb, var(--brand-ink) 45%, transparent);
}
.ta-chip-b{ left:auto; right:5%; bottom:24%; top:auto; color:var(--brand-accent); }

.ta-frame{ position:relative; z-index:2; width:100%; }
.ta-eyebrow{
  display:inline-block; margin:0 0 16px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 82%, transparent);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.ta-statement{
  font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.015em; line-height:1.16;
  font-size:clamp(1.5rem, 4.4vw, 2.7rem);
  margin:0 0 40px; max-width:20ch;
}
.ta-statement-inner{ display:inline-block; transition:clip-path .7s var(--motion-ease); }

.ta-moments{
  list-style:none; margin:0; padding:0;
  display:grid; gap:18px; grid-template-columns:1fr;
}
@media (min-width:780px){ .ta-moments{ grid-template-columns:repeat(3,1fr); gap:20px; } }
.ta-moments li{
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  border-radius:var(--radius-lg);
  padding:22px;
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
  opacity:0; transform:translateY(20px);
  transition:opacity .5s var(--motion-ease), transform .5s var(--motion-ease);
  transition-delay:calc(var(--i) * 110ms + 120ms);
}
.bell-approach[data-revealed="true"] .ta-moments li,
.bell-approach[data-interactive="false"] .ta-moments li{
  opacity:1; transform:none;
}
.ta-k{
  display:inline-block; font-family:var(--brand-font-display); font-weight:700;
  font-size:.72rem; letter-spacing:.08em; text-transform:uppercase;
  color:var(--brand-accent);
  background:var(--brand-accent-soft);
  padding:4px 10px; border-radius:980px; margin-bottom:12px;
}
.ta-moments h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1.06rem; line-height:1.3; margin:0 0 8px; }
.ta-moments p{ margin:0; color:var(--brand-ink-soft); font-size:.9rem; line-height:1.55; }

@media (prefers-reduced-motion: reduce){
  .ta-plane{ transform:none !important; }
  .ta-statement-inner{ clip-path:none !important; transition:none; }
  .ta-moments li{ opacity:1 !important; transform:none !important; transition:none; }
}
`;
