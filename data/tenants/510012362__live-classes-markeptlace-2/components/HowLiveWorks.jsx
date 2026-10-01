"use client";

import { useEffect, useRef } from "react";

/**
 * HowLiveWorks — a layered parallax band explaining a live class in three
 * steps. A midground "board" plane and a foreground layer of supply doodles
 * drift at different rates as the section scrolls through the viewport.
 * Reduced-motion: everything holds still, layout identical.
 */

const STEPS = [
  {
    n: "01",
    title: "Find a time that fits",
    body: "Filter by your child’s age and the days you’re free. Every session shows its meeting times in your timezone.",
  },
  {
    n: "02",
    title: "Enroll one child in one session",
    body: "Pick the session, choose which child, pay once. Small groups, capped seats, no surprises.",
  },
  {
    n: "03",
    title: "Join the live room",
    body: "The Join button opens ten minutes before class. The teacher meets your kid on video, every week.",
  },
];

export default function HowLiveWorks({ heading = "How a live class works" }) {
  const ref = useRef(null);
  const boardRef = useRef(null);
  const doodleRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const p = (window.innerHeight - r.top) / (window.innerHeight + r.height); // 0..1
        const c = Math.min(1, Math.max(0, p));
        if (boardRef.current) boardRef.current.style.transform = `translate3d(0, ${(c - 0.5) * 44}px, 0)`;
        if (doodleRef.current) doodleRef.current.style.transform = `translate3d(0, ${(c - 0.5) * -80}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section ref={ref} className="bell-how" aria-labelledby="bell-how-h">
      <div ref={boardRef} className="bh2-board" aria-hidden="true" />
      <div ref={doodleRef} className="bh2-doodles" aria-hidden="true">
        <span>✏️</span>
        <span>📐</span>
        <span>🔭</span>
        <span>🎨</span>
        <span>♟️</span>
      </div>

      <div className="bh2-frame">
        <h2 id="bell-how-h">{heading}</h2>
        <ol className="bh2-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="bh2-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-how{
  position:relative; isolation:isolate; overflow:hidden;
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:80px 20px; border-bottom:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-how{ padding:120px 32px; } }

.bh2-board{
  position:absolute; inset:-12% -4% auto -4%; height:70%; z-index:0;
  border-radius:var(--radius-lg);
  background:
    linear-gradient(color-mix(in srgb, var(--brand-accent) 8%, transparent), transparent),
    color-mix(in srgb, var(--brand-ink) 4%, var(--brand-surface));
  border:1px solid var(--brand-line);
  will-change:transform;
}
.bh2-doodles{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  will-change:transform;
}
.bh2-doodles span{ position:absolute; font-size:clamp(20px,4vw,34px); opacity:.55; }
.bh2-doodles span:nth-child(1){ left:6%; top:18%; }
.bh2-doodles span:nth-child(2){ right:9%; top:12%; }
.bh2-doodles span:nth-child(3){ right:14%; bottom:16%; }
.bh2-doodles span:nth-child(4){ left:11%; bottom:12%; }
.bh2-doodles span:nth-child(5){ left:47%; top:6%; }

.bh2-frame{ position:relative; z-index:2; max-width:1200px; margin-inline:auto; }
.bh2-frame h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.35rem); margin:0 0 36px; }

.bh2-steps{ list-style:none; margin:0; padding:0; display:grid; gap:20px; grid-template-columns:1fr; }
@media (min-width:760px){ .bh2-steps{ grid-template-columns:repeat(3, 1fr); gap:24px; } }
.bh2-steps li{
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  border-radius:var(--radius-lg);
  padding:24px;
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
.bh2-n{
  display:inline-block; font-family:var(--brand-font-display); font-weight:700;
  font-size:.85rem; letter-spacing:.08em;
  color:var(--brand-accent);
  padding:4px 10px; border-radius:980px;
  background:var(--brand-accent-soft);
  margin-bottom:14px;
}
.bh2-steps h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1.2rem; margin:0 0 8px; }
.bh2-steps p{ margin:0; color:var(--brand-ink-soft); line-height:1.55; font-size:.95rem; }

@media (prefers-reduced-motion: reduce){
  .bh2-board, .bh2-doodles{ transform:none !important; }
}
`;
