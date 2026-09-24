"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * BellHero — the landing hero, written for the STUDENT as the customer.
 *
 * Layout family: split. Bold left-aligned question + an "I want to learn…"
 * search on the left; a layered collage of people learning on the right.
 * Depth is layered parallax (no WebGL): a back plane (organic accent shape),
 * a mid plane (the photos) and a front plane (floating chips) that move at
 * different rates with the pointer and a touch of scroll. The headline
 * assembles word by word; the photos rise in one after another and then
 * drift gently.
 *
 * Every colour comes from the theme tokens. Photos sit on token-derived
 * surfaces so both light and dark read correctly.
 *
 * prefers-reduced-motion: no parallax, no drift, no entrance — the collage and
 * headline are simply there, fully composed.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const img = (id, w, h) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

const PHOTOS = [
  {
    key: "a",
    src: img("1588072432836-e10032774350", 720, 900),
    w: 720,
    h: 900,
    alt: "A child in glasses concentrating on a drawing at a busy classroom table",
  },
  {
    key: "b",
    src: img("1610484826967-09c5720778c7", 480, 480),
    w: 480,
    h: 480,
    alt: "A student in headphones following a live class on a laptop",
  },
  {
    key: "c",
    src: img("1522202176988-66273c2fd55f", 760, 608),
    w: 760,
    h: 608,
    alt: "Three learners laughing together over their laptops",
  },
  {
    key: "d",
    src: img("1571260899304-425eee4c7efc", 400, 400),
    w: 400,
    h: 400,
    alt: "Students taking notes during a lesson",
  },
];

const HEADLINE = ["What", "do", "you", "want", "to", "learn", "today?"];
const EM_WORD = 5; // "learn"

export default function BellHero({
  eyebrow = "Live online classes · real teachers",
  searchPlaceholder = "I want to learn… chess, drawing, coding",
  browseHref = "/stores",
}) {
  const router = useRouter();
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const reduced = usePrefersReducedMotion();

  // headline + collage assemble on mount
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // load display + body fonts once
  useEffect(() => {
    if (document.querySelector("link[data-bell-fonts]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_LINK;
    l.setAttribute("data-bell-fonts", "");
    document.head.appendChild(l);
  }, []);

  // Pointer + scroll parallax: one rAF loop writes three CSS variables, and the
  // three layers read them at different strengths (transform only). Paused
  // while the hero is off-screen.
  useEffect(() => {
    if (reduced) return;
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let visible = true;
    let px = 0, py = 0; // target
    let cx = 0, cy = 0; // eased
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      px = Math.max(-1, Math.min(1, px));
      py = Math.max(-1, Math.min(1, py));
    };
    const tick = () => {
      if (visible) {
        cx += (px - cx) * 0.07;
        cy += (py - cy) * 0.07;
        el.style.setProperty("--px", cx.toFixed(3));
        el.style.setProperty("--py", cy.toFixed(3));
        el.style.setProperty("--sy", String(Math.min(window.scrollY || 0, 700)));
      }
      raf = requestAnimationFrame(tick);
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    io?.observe(el);
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
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

  return (
    <section
      ref={rootRef}
      className="bell-hero"
      data-ready={ready}
      aria-label="Find a live online class"
    >
      <div className="bh-frame">
        <div className="bh-copy">
          <p className="bh-eyebrow">
            <BellMark /> {eyebrow}
          </p>

          <h1 className="bh-title">
            {HEADLINE.map((w, i) => (
              <span key={i} className="bh-word" style={{ "--i": i }}>
                <span className={i === EM_WORD ? "bh-em" : undefined}>{w}</span>
                {i < HEADLINE.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>

          <p className="bh-sub">
            Live classes with real teachers, in small groups, at a time that
            fits you. Pick something you love and jump in.
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
            <button type="submit">Find my class</button>
          </form>

          <p className="bh-reassure">
            Times shown in your timezone · Join one session at a time ·{" "}
            <Link href={browseHref}>Browse every class</Link>
          </p>
        </div>

        <div className="bh-cluster">
          <div className="bh-layer bh-back" aria-hidden="true">
            <span className="bh-shape" />
          </div>

          <div className="bh-layer bh-mid">
            {PHOTOS.map((p, i) => (
              <figure key={p.key} className={`bh-photo bh-photo-${p.key}`} style={{ "--n": i }}>
                <img
                  src={p.src}
                  alt={p.alt}
                  width={p.w}
                  height={p.h}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  decoding="async"
                />
              </figure>
            ))}
          </div>

          <div className="bh-layer bh-front" aria-hidden="true">
            <span className="bh-chip bh-chip-1">
              <i className="bh-chip-dot" /> Live with a real teacher
            </span>
            <span className="bh-chip bh-chip-2">Pick your own time</span>
          </div>
        </div>
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
  padding:44px 20px 56px;
  background:var(--brand-paper);
  color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
@media (min-width:900px){ .bell-hero{ padding:84px 40px 92px; } }

.bh-frame{
  position:relative; z-index:2;
  max-width:1180px; margin-inline:auto;
  display:grid; gap:36px; align-items:center;
}
@media (min-width:900px){
  .bh-frame{ grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:56px; }
}
.bh-copy{ min-width:0; }

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
  font-weight:700; letter-spacing:-.025em; line-height:1.02;
  font-size:clamp(2.6rem, 9vw, 4.7rem);
  margin:0 0 18px;
  text-wrap:balance;
}
/* wrapper clips the rise; padding keeps descenders (y, g) from being cut */
.bh-word{ display:inline-block; overflow:hidden; padding-bottom:.14em; margin-bottom:-.14em; }
.bh-word > span{
  display:inline-block; position:relative;
  transform:translateY(110%);
  transition:transform .62s var(--motion-ease);
  transition-delay:calc(var(--i) * 60ms + 90ms);
}
.bell-hero[data-ready="true"] .bh-word > span{ transform:translateY(0); }
.bh-em{ color:var(--brand-accent); }
.bh-em::after{
  content:""; position:absolute; left:0; right:0; bottom:.06em; height:.15em;
  border-radius:99px; background:color-mix(in srgb, var(--brand-accent) 30%, transparent);
  transform-origin:left; transform:scaleX(0);
  transition:transform .7s var(--motion-ease) .95s;
}
.bell-hero[data-ready="true"] .bh-em::after{ transform:scaleX(1); }

.bh-sub{
  max-width:38ch; margin:0 0 26px;
  font-size:clamp(1.02rem, 2.4vw, 1.25rem); line-height:1.5;
  color:var(--brand-ink-soft);
}

.bh-search{
  display:flex; gap:8px; flex-wrap:wrap;
  max-width:560px; margin:0 0 16px;
  padding:8px; border-radius:var(--radius-lg);
  background:var(--brand-surface);
  border:1px solid var(--brand-line);
  box-shadow:0 18px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.bh-search input{
  flex:1 1 220px; min-width:0; min-height:48px;
  border:0; background:transparent; outline:none;
  padding:12px 12px; font-size:16px; font-family:inherit;
  color:var(--brand-ink);
}
.bh-search input::placeholder{ color:color-mix(in srgb, var(--brand-ink-soft) 85%, transparent); }
.bh-search button{
  flex:1 1 auto; min-height:48px;
  border:0; border-radius:calc(var(--radius-lg) - 6px);
  padding:12px 22px; font-size:15px; font-weight:650; font-family:var(--brand-font-display);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  cursor:pointer; touch-action:manipulation;
  transition:filter var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
@media (min-width:480px){ .bh-search button{ flex:0 0 auto; } }
.bh-search button:hover{ filter:brightness(1.06); }
.bh-search button:active{ transform:translateY(1px); }
.bh-search:focus-within{ border-color:var(--brand-accent); }

.bh-reassure{
  margin:0; font-size:13px; color:var(--brand-ink-soft); line-height:1.6;
}
.bh-reassure a{ color:var(--brand-accent); text-decoration:underline; text-underline-offset:2px; font-weight:600; }

/* ---------- collage: three parallax layers ---------- */
.bh-cluster{
  position:relative; width:100%; max-width:520px; margin-inline:auto;
  aspect-ratio:1 / 1.02;
}
.bh-layer{ position:absolute; inset:0; will-change:transform; }
.bh-back{ pointer-events:none; transform:translate3d(calc(var(--px,0) * -6px), calc(var(--py,0) * -4px + var(--sy,0) * .03px), 0); }
.bh-mid{ pointer-events:none; transform:translate3d(calc(var(--px,0) * 12px), calc(var(--py,0) * 9px + var(--sy,0) * -.04px), 0); }
.bh-front{ pointer-events:none; transform:translate3d(calc(var(--px,0) * 24px), calc(var(--py,0) * 16px + var(--sy,0) * -.08px), 0); }

.bh-shape{
  position:absolute; inset:6% 2% 0 8%;
  border-radius:38% 62% 55% 45% / 48% 42% 58% 52%;
  background:
    radial-gradient(70% 70% at 30% 25%, color-mix(in srgb, var(--brand-accent) 22%, var(--brand-accent-soft)), var(--brand-accent-soft) 70%);
}

.bh-photo{
  position:absolute; margin:0; overflow:hidden;
  border-radius:var(--radius-lg);
  border:4px solid var(--brand-surface);
  background:var(--brand-accent-soft);
  box-shadow:0 24px 50px -24px color-mix(in srgb, var(--brand-ink) 60%, transparent);
  transform:rotate(var(--r, 0deg));
  animation:
    bh-rise .8s var(--motion-ease) calc(.25s + var(--n) * .14s) both,
    bh-drift 9s ease-in-out calc(1.4s + var(--n) * .9s) infinite;
}
.bh-photo img{ display:block; width:100%; height:100%; object-fit:cover; }
.bh-photo-a{ left:0;   top:5%;    width:57%; aspect-ratio:4 / 5; --r:-2.5deg; }
.bh-photo-b{ right:1%; top:0;     width:40%; aspect-ratio:1;     --r:3deg; }
.bh-photo-c{ right:0;  bottom:0;  width:58%; aspect-ratio:5 / 4; --r:2deg; }
.bh-photo-d{ left:5%;  bottom:3%; width:34%; aspect-ratio:1;     --r:-4deg; }

.bh-chip{
  position:absolute; display:inline-flex; align-items:center; gap:7px;
  padding:8px 13px; border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink);
  border:1px solid var(--brand-line);
  font-size:13px; font-weight:650; line-height:1.2; white-space:nowrap;
  box-shadow:0 12px 28px -14px color-mix(in srgb, var(--brand-ink) 55%, transparent);
  animation:bh-rise .8s var(--motion-ease) 1s both;
}
.bh-chip-dot{ width:8px; height:8px; border-radius:50%; background:var(--brand-accent); flex:none; }
.bh-chip-1{ left:-1%; top:50%; }
.bh-chip-2{ right:2%; top:47%; animation-delay:1.15s; }
@media (max-width:420px){
  .bh-chip{ font-size:12px; padding:7px 10px; }
  .bh-chip-1{ left:0; }
  .bh-chip-2{ top:59%; }
}

@keyframes bh-rise{
  from{ opacity:0; transform:translateY(26px) rotate(var(--r, 0deg)); }
  to{ opacity:1; transform:translateY(0) rotate(var(--r, 0deg)); }
}
@keyframes bh-drift{ 0%,100%{ translate:0 0; } 50%{ translate:0 -9px; } }

:where(.bell-hero) a:focus-visible,
:where(.bell-hero) button:focus-visible,
:where(.bell-hero) input:focus-visible{
  outline:3px solid var(--brand-accent);
  outline-offset:2px; border-radius:6px;
}

.bh-visually-hidden{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}

@media (prefers-reduced-motion: reduce){
  .bh-layer{ transform:none !important; }
  .bh-photo, .bh-chip{ animation:none; }
  .bh-word > span{ transform:none; transition:none; }
  .bh-em::after{ transform:scaleX(1); transition:none; }
}
`;
