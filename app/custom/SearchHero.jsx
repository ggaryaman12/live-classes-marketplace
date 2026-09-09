"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * SearchHero — compact banner for the class-search page. Depth is layered
 * parallax: three planes of faint "timetable" slot pills drifting at
 * different rates behind the headline, plus a couple of bright class chips
 * in the foreground. Headline reveals word by word under a wipe.
 * prefers-reduced-motion: static, composed, no drift.
 *
 * The search field writes ?q= into the URL, which the results grid below
 * reads — so a parent can copy the link and send it to a partner.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const HEADLINE = ["Find", "a", "class", "that", "fits", "your", "week."];
const SLOT_ROWS = 5;
const SLOT_COLS = 7;

export default function SearchHero(props) {
  return (
    <Suspense fallback={<section className="bell-search-hero" aria-busy="true" />}>
      <SearchHeroInner {...props} />
    </Suspense>
  );
}

function SearchHeroInner({
  eyebrow = "Every class is a live video meeting with a real teacher",
  searchPlaceholder = "Search “Roblox”, “phonics”, “debate club”…",
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rootRef = useRef(null);
  const p1 = useRef(null);
  const p2 = useRef(null);
  const p3 = useRef(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!document.querySelector("link[data-bell-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONT_LINK;
      l.setAttribute("data-bell-fonts", "");
      document.head.appendChild(l);
    }
    const t = setTimeout(() => setReady(true), 60);
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
      if (p1.current) p1.current.style.transform = `translate3d(${cx * 6}px, ${cy * 4 + s * 0.05}px, 0)`;
      if (p2.current) p2.current.style.transform = `translate3d(${cx * 16}px, ${cy * 10 + s * 0.02}px, 0)`;
      if (p3.current) p3.current.style.transform = `translate3d(${cx * 30}px, ${cy * 18 - s * 0.04}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const submit = useCallback(
    (e) => {
      e.preventDefault();
      const next = new URLSearchParams(Array.from(params.entries()));
      const v = q.trim();
      if (v) next.set("q", v);
      else next.delete("q");
      router.push(`/stores${next.toString() ? `?${next}` : ""}`);
    },
    [q, params, router]
  );

  return (
    <section ref={rootRef} className="bell-search-hero" data-ready={ready} aria-label="Search live classes">
      <div ref={p3} className="bsh-plane bsh-p3" aria-hidden="true">
        {grid("a")}
      </div>
      <div ref={p2} className="bsh-plane bsh-p2" aria-hidden="true">
        {grid("b")}
      </div>
      <div ref={p1} className="bsh-plane bsh-p1" aria-hidden="true">
        <span className="bsh-chip bsh-chip-1">Sat · 10:00 AM</span>
        <span className="bsh-chip bsh-chip-2">Tue · 4:30 PM</span>
        <span className="bsh-chip bsh-chip-3">3 seats left</span>
      </div>

      <div className="bsh-frame">
        <p className="bsh-eyebrow">{eyebrow}</p>
        <h1 className="bsh-title">
          {HEADLINE.map((w, i) => (
            <span key={i} className="bsh-word" style={{ "--i": i }}>
              <span>{w}</span>
              {i < HEADLINE.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>
        <form className="bsh-search" onSubmit={submit} role="search">
          <label htmlFor="bell-search-q" className="bsh-vh">Search live classes</label>
          <input
            id="bell-search-q"
            type="search"
            inputMode="search"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <button type="submit">Search</button>
        </form>
        <p className="bsh-hint">Filter by your child’s age and the days you’re free — the results link is yours to share.</p>
      </div>

      <style>{css}</style>
    </section>
  );
}

function grid(key) {
  const cells = [];
  for (let r = 0; r < SLOT_ROWS; r++) {
    for (let c = 0; c < SLOT_COLS; c++) {
      const on = (r * 7 + c * 3 + key.charCodeAt(0)) % 5 === 0;
      cells.push(<span key={`${key}-${r}-${c}`} className="bsh-slot" data-on={on} />);
    }
  }
  return <div className="bsh-slotgrid">{cells}</div>;
}

const css = `
.bell-search-hero{
  position:relative; isolation:isolate; overflow:hidden;
  min-height:min(56vh, 460px);
  display:flex; align-items:center;
  padding:80px 20px 56px;
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-search-hero{ padding:104px 32px 72px; } }

.bsh-plane{ position:absolute; inset:-10% -8%; z-index:0; will-change:transform; pointer-events:none; }
.bsh-slotgrid{
  position:absolute; inset:0;
  display:grid; grid-template-columns:repeat(7, 1fr); gap:14px;
  padding:6% 8%;
}
.bsh-slot{
  border-radius:8px; min-height:26px;
  border:1px solid color-mix(in srgb, var(--brand-line) 80%, transparent);
  background:transparent;
}
.bsh-slot[data-on="true"]{
  background:color-mix(in srgb, var(--brand-accent-soft) 80%, transparent);
  border-color:color-mix(in srgb, var(--brand-accent) 30%, var(--brand-line));
}
.bsh-p3{ filter:blur(4px); opacity:.5; }
.bsh-p2{ opacity:.7; }
.bsh-p1{ z-index:1; }
.bsh-chip{
  position:absolute; padding:8px 12px; border-radius:980px;
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  font-size:12px; font-weight:600; color:var(--brand-ink-soft);
  box-shadow:0 12px 30px -16px color-mix(in srgb, var(--brand-ink) 45%, transparent);
  animation:bsh-bob 7s ease-in-out infinite;
}
.bsh-chip-1{ left:6%; top:20%; }
.bsh-chip-2{ right:8%; top:14%; animation-delay:-2s; }
.bsh-chip-3{ right:12%; bottom:16%; color:var(--brand-accent); animation-delay:-4s; }
@keyframes bsh-bob{ 0%,100%{ translate:0 0 } 50%{ translate:0 -10px } }

.bsh-frame{ position:relative; z-index:2; width:100%; max-width:680px; margin-inline:auto; text-align:center; }
.bsh-eyebrow{
  display:inline-block; margin:0 0 14px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 80%, transparent);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.bsh-title{
  font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.02em; line-height:1.05;
  font-size:clamp(2rem, 6vw, 3.2rem);
  margin:0 0 20px;
}
.bsh-word{ display:inline-block; overflow:hidden; }
.bsh-word > span{
  display:inline-block; transform:translateY(105%);
  transition:transform .6s var(--motion-ease);
  transition-delay:calc(var(--i) * 50ms + 80ms);
}
.bell-search-hero[data-ready="true"] .bsh-word > span{ transform:translateY(0); }

.bsh-search{
  display:flex; gap:8px; flex-wrap:wrap;
  max-width:520px; margin:0 auto 12px;
  padding:8px; border-radius:var(--radius-lg);
  background:var(--brand-surface); border:1px solid var(--brand-line);
  box-shadow:0 18px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.bsh-search input{
  flex:1 1 200px; min-width:0; border:0; background:transparent; outline:none;
  padding:12px; font-size:16px; font-family:inherit; color:var(--brand-ink);
}
.bsh-search input::placeholder{ color:color-mix(in srgb, var(--brand-ink-soft) 80%, transparent); }
.bsh-search button{
  border:0; border-radius:calc(var(--radius-lg) - 6px);
  padding:12px 20px; font-size:15px; font-weight:600;
  font-family:var(--brand-font-display);
  background:var(--brand-accent); color:var(--brand-accent-ink); cursor:pointer;
  transition:filter var(--motion) var(--motion-ease);
}
.bsh-search button:hover{ filter:brightness(1.06); }
.bsh-search:focus-within{ border-color:var(--brand-accent); }
.bsh-hint{ margin:0; font-size:12.5px; color:var(--brand-ink-soft); }

.bsh-vh{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
:where(.bell-search-hero) button:focus-visible,
:where(.bell-search-hero) input:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; border-radius:6px; }

@media (prefers-reduced-motion: reduce){
  .bsh-plane{ transform:none !important; }
  .bsh-chip{ animation:none; }
  .bsh-word > span{ transform:none; transition:none; }
}
`;
