"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * BellHero — the landing hero for Bell, a marketplace of live online classes
 * for kids. Depth is layered parallax (no WebGL): a back grain plane, a
 * mid glow plane, and a slow-drifting ring of "video tile" cards standing in
 * for a live class gathering before the bell. The headline assembles word by
 * word on load; a sub-line reveals under a wipe mask as the hero scrolls.
 *
 * prefers-reduced-motion: ring resolves to a static composed arrangement,
 * headline shows immediately, no parallax, no drift.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const TILES = [
  { initial: "A", label: "Chess club", live: true, hue: "#2F6F7A" },
  { initial: "M", label: "Story writing", hue: "#7A4A6B" },
  { initial: "R", label: "Volcano science", hue: "#4E6B3A" },
  { initial: "K", label: "Spanish games", hue: "#3E5C8A" },
  { initial: "J", label: "Comic art", hue: "#8A6A1E" },
  { initial: "S", label: "Coding: Scratch", hue: "#5C4A7A" },
  { initial: "L", label: "Times tables", live: true, hue: "#8A5038" },
  { initial: "D", label: "Nature journal", hue: "#2F6F7A" },
];

const HEADLINE = ["Live", "classes", "that", "meet", "your", "kid", "where", "they", "are."];

export default function BellHero({
  eyebrow = "Live online classes for curious kids",
  searchPlaceholder = "Try “chess”, “creative writing”, “fractions”…",
  browseHref = "/stores",
}) {
  const router = useRouter();
  const rootRef = useRef(null);
  const ringRef = useRef(null);
  const midRef = useRef(null);
  const backRef = useRef(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const reduced = usePrefersReducedMotion();

  // headline assemble on mount
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // load display + body fonts once
  useEffect(() => {
    if (document.querySelector('link[data-bell-fonts]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_LINK;
    l.setAttribute("data-bell-fonts", "");
    document.head.appendChild(l);
  }, []);

  // pointer + scroll parallax via rAF
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let px = 0, py = 0; // target
    let cx = 0, cy = 0; // current
    const onMove = (e) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const tick = () => {
      cx += (px - cx) * 0.06;
      cy += (py - cy) * 0.06;
      const s = window.scrollY || 0;
      if (backRef.current)
        backRef.current.style.transform = `translate3d(${cx * 6}px, ${cy * 4 + s * 0.04}px, 0)`;
      if (midRef.current)
        midRef.current.style.transform = `translate3d(${cx * 16}px, ${cy * 12 + s * 0.09}px, 0)`;
      if (ringRef.current)
        ringRef.current.style.transform = `translate3d(${cx * 30}px, ${cy * 20 - s * 0.05}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  const submit = useCallback(
    (e) => {
      e.preventDefault();
      const q = query.trim();
      router.push(q ? `${browseHref}?q=${encodeURIComponent(q)}` : browseHref);
    },
    [query, router, browseHref]
  );

  const ring = useMemo(() => {
    // ellipse layout, back tiles pushed away + blurred for depth of field
    return TILES.map((t, i) => {
      const a = (i / TILES.length) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 40;
      const y = 50 + Math.sin(a) * 34;
      const depth = (Math.sin(a) + 1) / 2; // 0 back .. 1 front
      return { ...t, x, y, depth, delay: i * 0.7 };
    });
  }, []);

  return (
    <section
      ref={rootRef}
      className="bell-hero"
      data-ready={ready}
      aria-label="Bell — live online classes for kids"
    >
      <div ref={backRef} className="bh-plane bh-back" aria-hidden="true" />
      <div ref={midRef} className="bh-plane bh-mid" aria-hidden="true">
        <span className="bh-blob bh-blob-1" />
        <span className="bh-blob bh-blob-2" />
      </div>

      <div ref={ringRef} className="bh-plane bh-ring" aria-hidden="true">
        {ring.map((t, i) => (
          <figure
            key={i}
            className="bh-tile"
            data-live={t.live ? "yes" : "no"}
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              "--tile-hue": t.hue,
              "--tile-depth": t.depth.toFixed(3),
              "--tile-delay": `${t.delay}s`,
            }}
          >
            <span className="bh-tile-face">{t.initial}</span>
            <figcaption>
              {t.live && <b className="bh-dot" aria-hidden="true" />}
              {t.label}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="bh-frame">
        <p className="bh-eyebrow">
          <BellMark /> {eyebrow}
        </p>

        <h1 className="bh-title">
          {HEADLINE.map((w, i) => (
            <span key={i} className="bh-word" style={{ "--i": i }}>
              <span>{w}</span>
              {i < HEADLINE.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>

        <p className="bh-sub">
          <span className="bh-sub-inner">
            Real teachers, small groups, a set time each week. Search by your
            child’s age and the days that fit your family.
          </span>
        </p>

        <form className="bh-search" onSubmit={submit} role="search">
          <label htmlFor="bell-hero-q" className="bh-visually-hidden">
            Search live classes
          </label>
          <input
            id="bell-hero-q"
            type="search"
            inputMode="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <button type="submit">Find a class</button>
        </form>

        <p className="bh-reassure">
          Times shown in your timezone · Enroll in one session, not the whole
          course · <Link href={browseHref}>Browse every class</Link>
        </p>
      </div>

      <style>{css}</style>
    </section>
  );
}

function BellMark() {
  return (
    <svg
      className="bh-bell"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3.2c-3.6 0-6 2.7-6 6.3 0 4.2-1.4 5.7-2.2 6.6-.5.6-.1 1.6.8 1.6h14.8c.9 0 1.3-1 .8-1.6-.8-.9-2.2-2.4-2.2-6.6 0-3.6-2.4-6.3-6-6.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="20.4" r="1.9" fill="var(--brand-accent)" />
    </svg>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

const css = `
.bell-hero{
  position:relative; isolation:isolate; overflow:hidden;
  min-height:min(88vh, 760px);
  display:flex; align-items:center;
  padding:96px 20px 72px;
  background:var(--brand-paper);
  color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-hero{ padding:120px 32px 104px; } }

.bh-plane{ position:absolute; inset:-8% -6%; z-index:0; will-change:transform; pointer-events:none; }
.bh-back{
  background:
    radial-gradient(60% 55% at 50% 40%, color-mix(in srgb, var(--brand-accent-soft) 70%, transparent), transparent 70%);
  filter:blur(6px);
}
.bh-mid{ }
.bh-blob{ position:absolute; border-radius:50%; filter:blur(30px); opacity:.5; }
.bh-blob-1{ width:42vw; max-width:420px; aspect-ratio:1; left:-6%; top:8%;
  background:radial-gradient(circle, color-mix(in srgb, var(--brand-accent) 34%, transparent), transparent 70%); }
.bh-blob-2{ width:36vw; max-width:360px; aspect-ratio:1; right:-4%; bottom:2%;
  background:radial-gradient(circle, color-mix(in srgb, #2F6F7A 30%, transparent), transparent 70%); }

.bh-ring{ z-index:1; }
.bh-tile{
  position:absolute; margin:0; transform:translate(-50%,-50%);
  width:clamp(78px, 15vw, 132px);
  opacity:calc(.34 + var(--tile-depth) * .62);
  filter:blur(calc((1 - var(--tile-depth)) * 3px));
  animation:bh-float 9s ease-in-out infinite;
  animation-delay:var(--tile-delay);
}
.bh-tile-face{
  display:flex; align-items:center; justify-content:center;
  aspect-ratio:4/3; border-radius:var(--radius);
  background:color-mix(in srgb, var(--tile-hue) 20%, var(--brand-surface));
  border:1px solid color-mix(in srgb, var(--tile-hue) 42%, var(--brand-line));
  color:color-mix(in srgb, var(--tile-hue) 62%, var(--brand-ink));
  font-family:var(--brand-font-display); font-weight:600;
  font-size:clamp(20px, 4vw, 32px);
  box-shadow:0 10px 30px -14px color-mix(in srgb, var(--brand-ink) 40%, transparent);
}
.bh-tile figcaption{
  display:flex; align-items:center; gap:5px;
  margin-top:6px; font-size:11px; line-height:1.2;
  color:var(--brand-ink-soft); font-weight:500;
}
.bh-dot{
  width:6px; height:6px; border-radius:50%;
  background:var(--brand-accent);
  box-shadow:0 0 0 0 color-mix(in srgb, var(--brand-accent) 60%, transparent);
  animation:bh-pulse 2.4s ease-out infinite;
}
@keyframes bh-float{ 0%,100%{ translate:0 0 } 50%{ translate:0 -12px } }
@keyframes bh-pulse{
  0%{ box-shadow:0 0 0 0 color-mix(in srgb, var(--brand-accent) 55%, transparent) }
  70%{ box-shadow:0 0 0 9px transparent } 100%{ box-shadow:0 0 0 0 transparent }
}

.bh-frame{
  position:relative; z-index:2;
  width:100%; max-width:760px; margin-inline:auto;
  text-align:center;
}
.bh-eyebrow{
  display:inline-flex; align-items:center; gap:8px;
  margin:0 0 18px; padding:7px 14px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 80%, transparent);
  font-size:13px; font-weight:600; letter-spacing:.01em;
  color:var(--brand-ink-soft);
}
.bh-bell{ color:var(--brand-accent); }

.bh-title{
  font-family:var(--brand-font-display);
  font-weight:600; letter-spacing:-.02em; line-height:1.04;
  font-size:clamp(2.4rem, 7.4vw, 4rem);
  margin:0 0 18px;
}
.bh-word{ display:inline-block; overflow:hidden; }
.bh-word > span{
  display:inline-block;
  transform:translateY(105%);
  transition:transform .62s var(--motion-ease);
  transition-delay:calc(var(--i) * 55ms + 90ms);
}
.bell-hero[data-ready="true"] .bh-word > span{ transform:translateY(0); }

.bh-sub{
  max-width:34ch; margin:0 auto 26px;
  font-size:clamp(1rem, 2.4vw, 1.24rem); line-height:1.5;
  color:var(--brand-ink-soft);
}
.bh-sub-inner{
  display:inline-block;
  clip-path:inset(0 100% 0 0);
  transition:clip-path .9s var(--motion-ease) .3s;
}
.bell-hero[data-ready="true"] .bh-sub-inner{ clip-path:inset(0 0 0 0); }

.bh-search{
  display:flex; gap:8px; flex-wrap:wrap;
  max-width:520px; margin:0 auto 16px;
  padding:8px; border-radius:var(--radius-lg);
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  box-shadow:0 18px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.bh-search input{
  flex:1 1 220px; min-width:0;
  border:0; background:transparent; outline:none;
  padding:12px 12px; font-size:16px; font-family:inherit;
  color:var(--brand-ink);
}
.bh-search input::placeholder{ color:color-mix(in srgb, var(--brand-ink-soft) 80%, transparent); }
.bh-search button{
  flex:0 0 auto;
  border:0; border-radius:calc(var(--radius-lg) - 6px);
  padding:12px 20px; font-size:15px; font-weight:600; font-family:var(--brand-font-display);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  cursor:pointer; transition:filter var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
.bh-search button:hover{ filter:brightness(1.06); }
.bh-search button:active{ transform:translateY(1px); }
.bh-search:focus-within{ border-color:var(--brand-accent); }

.bh-reassure{
  margin:0; font-size:13px; color:var(--brand-ink-soft); line-height:1.6;
}
.bh-reassure a{ color:var(--brand-accent); text-decoration:underline; text-underline-offset:2px; font-weight:600; }

.bh-visually-hidden{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}

:where(.bell-hero) a:focus-visible,
:where(.bell-hero) button:focus-visible,
:where(.bell-hero) input:focus-visible{
  outline:3px solid var(--brand-accent);
  outline-offset:2px; border-radius:6px;
}

@media (prefers-reduced-motion: reduce){
  .bh-plane{ transform:none !important; }
  .bh-tile{ animation:none; }
  .bh-dot{ animation:none; }
  .bh-word > span{ transform:none; transition:none; }
  .bh-sub-inner{ clip-path:none; transition:none; }
}
`;
