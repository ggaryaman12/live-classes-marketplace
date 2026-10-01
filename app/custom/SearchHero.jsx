"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * SearchHero — the banner at the top of the Explore Courses page.
 *
 * Same family as the home hero (see BellHero) but compact, so the classes are
 * never far below the fold: a bold left-aligned headline and the search on the
 * left; on wide screens a small collage of learners on the right, built from
 * three parallax layers (an organic accent shape behind, photos in the middle,
 * a floating chip in front) that move at different rates with the pointer.
 * On phones the collage is dropped and the search sits right under the headline.
 *
 * The search field writes ?q= into the URL, which the results grid below
 * reads — so a link to the results can be copied and shared.
 *
 * Every colour comes from the theme tokens. prefers-reduced-motion: no
 * parallax, no drift, no entrance — fully composed and static.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const img = (id, w, h) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

const PHOTOS = [
  {
    key: "a",
    src: img("1522202176988-66273c2fd55f", 640, 512),
    w: 640,
    h: 512,
    alt: "Three learners laughing together over their laptops",
  },
  {
    key: "b",
    src: img("1588072432836-e10032774350", 400, 500),
    w: 400,
    h: 500,
    alt: "A child in glasses concentrating on a drawing at a classroom table",
  },
  {
    key: "c",
    src: img("1610484826967-09c5720778c7", 400, 400),
    w: 400,
    h: 400,
    alt: "A student in headphones following a live class on a laptop",
  },
];

const HEADLINE = ["Find", "a", "class", "you’ll", "love."];
const EM_WORD = 4;

export default function SearchHero(props) {
  return (
    <Suspense fallback={<section className="bell-search-hero" aria-busy="true" />}>
      <SearchHeroInner {...props} />
    </Suspense>
  );
}

function SearchHeroInner({
  eyebrow = "Every class is a live video meeting with a real teacher",
  searchPlaceholder = "I want to learn… chess, drawing, coding",
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rootRef = useRef(null);
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

  // Pointer + scroll parallax: one rAF loop writes CSS variables the three
  // layers read at different strengths (transform only). Off-screen = paused.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let visible = true;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    };
    const tick = () => {
      if (visible) {
        cx += (tx - cx) * 0.07;
        cy += (ty - cy) * 0.07;
        el.style.setProperty("--px", cx.toFixed(3));
        el.style.setProperty("--py", cy.toFixed(3));
        el.style.setProperty("--sy", String(Math.min(window.scrollY || 0, 600)));
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
      <div className="bsh-frame">
        <div className="bsh-copy">
          <p className="bsh-eyebrow">{eyebrow}</p>
          <h1 className="bsh-title">
            {HEADLINE.map((w, i) => (
              <span key={i} className="bsh-word" style={{ "--i": i }}>
                <span className={i === EM_WORD ? "bsh-em" : undefined}>{w}</span>
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
          <p className="bsh-hint">Narrow it down by price, age or availability below. The link to your results is yours to share.</p>
        </div>

        <div className="bsh-cluster">
          <div className="bsh-layer bsh-back" aria-hidden="true">
            <span className="bsh-shape" />
          </div>
          <div className="bsh-layer bsh-mid">
            {PHOTOS.map((p, i) => (
              <figure key={p.key} className={`bsh-photo bsh-photo-${p.key}`} style={{ "--n": i }}>
                <img src={p.src} alt={p.alt} width={p.w} height={p.h} loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
          <div className="bsh-layer bsh-front" aria-hidden="true">
            <span className="bsh-chip"><i className="bsh-chip-dot" /> Join one session at a time</span>
          </div>
        </div>
      </div>

      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-search-hero{
  position:relative; isolation:isolate; overflow:hidden;
  padding:40px 20px 44px;
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  border-bottom:1px solid var(--brand-line);
}
@media (min-width:900px){ .bell-search-hero{ padding:64px 40px 64px; } }

.bsh-frame{
  position:relative; z-index:2; max-width:1200px; margin-inline:auto;
  display:grid; gap:28px; align-items:center;
}
@media (min-width:900px){
  .bsh-frame{ grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); gap:48px; }
}
.bsh-copy{ min-width:0; }

.bsh-eyebrow{
  display:inline-block; margin:0 0 14px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 80%, transparent);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.bsh-title{
  font-family:var(--brand-font-display); font-weight:700;
  letter-spacing:-.025em; line-height:1.03;
  font-size:clamp(2.3rem, 7.6vw, 3.9rem);
  margin:0 0 22px; text-wrap:balance;
}
/* wrapper clips the rise; padding keeps descenders from being cut */
.bsh-word{ display:inline-block; overflow:hidden; padding-bottom:.14em; margin-bottom:-.14em; }
.bsh-word > span{
  display:inline-block; position:relative; transform:translateY(110%);
  transition:transform .6s var(--motion-ease);
  transition-delay:calc(var(--i) * 55ms + 80ms);
}
.bell-search-hero[data-ready="true"] .bsh-word > span{ transform:translateY(0); }
.bsh-em{ color:var(--brand-accent); }
.bsh-em::after{
  content:""; position:absolute; left:0; right:0; bottom:.06em; height:.15em;
  border-radius:99px; background:color-mix(in srgb, var(--brand-accent) 30%, transparent);
  transform-origin:left; transform:scaleX(0);
  transition:transform .7s var(--motion-ease) .8s;
}
.bell-search-hero[data-ready="true"] .bsh-em::after{ transform:scaleX(1); }

.bsh-search{
  display:flex; gap:8px; flex-wrap:wrap;
  max-width:560px; margin:0 0 12px;
  padding:8px; border-radius:var(--radius-lg);
  background:var(--brand-surface); border:1px solid var(--brand-line);
  box-shadow:0 18px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.bsh-search input{
  flex:1 1 200px; min-width:0; min-height:48px; border:0; background:transparent; outline:none;
  padding:12px; font-size:16px; font-family:inherit; color:var(--brand-ink);
}
.bsh-search input::placeholder{ color:color-mix(in srgb, var(--brand-ink-soft) 85%, transparent); }
.bsh-search button{
  flex:1 1 auto; min-height:48px;
  border:0; border-radius:calc(var(--radius-lg) - 6px);
  padding:12px 22px; font-size:15px; font-weight:650;
  font-family:var(--brand-font-display);
  background:var(--brand-accent); color:var(--brand-accent-ink); cursor:pointer;
  touch-action:manipulation;
  transition:filter var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
@media (min-width:480px){ .bsh-search button{ flex:0 0 auto; } }
.bsh-search button:hover{ filter:brightness(1.06); }
.bsh-search button:active{ transform:translateY(1px); }
/* Focus: no red border — a soft tint ring keeps the focus position visible. */
.bsh-search:focus-within{ box-shadow:0 0 0 4px color-mix(in srgb, var(--brand-accent) 14%, transparent), 0 18px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent); }
.bsh-search input:focus, .bsh-search input:focus-visible{ outline:none; box-shadow:none; }
.bsh-hint{ margin:0; font-size:13px; line-height:1.55; color:var(--brand-ink-soft); max-width:52ch; }

/* ---------- collage (wide screens only): three parallax layers ---------- */
.bsh-cluster{ display:none; }
@media (min-width:900px){
  .bsh-cluster{ display:block; position:relative; width:100%; max-width:460px; aspect-ratio:1.25 / 1; margin-inline:auto; }
}
.bsh-layer{ position:absolute; inset:0; will-change:transform; pointer-events:none; }
.bsh-back{ transform:translate3d(calc(var(--px,0) * -6px), calc(var(--py,0) * -4px + var(--sy,0) * .03px), 0); }
.bsh-mid{ transform:translate3d(calc(var(--px,0) * 12px), calc(var(--py,0) * 9px + var(--sy,0) * -.04px), 0); }
.bsh-front{ transform:translate3d(calc(var(--px,0) * 22px), calc(var(--py,0) * 14px + var(--sy,0) * -.07px), 0); }

.bsh-shape{
  position:absolute; inset:4% 0 0 6%;
  border-radius:40% 60% 52% 48% / 50% 44% 56% 50%;
  background:radial-gradient(70% 70% at 30% 25%, color-mix(in srgb, var(--brand-accent) 22%, var(--brand-accent-soft)), var(--brand-accent-soft) 70%);
}
.bsh-photo{
  position:absolute; margin:0; overflow:hidden;
  border-radius:var(--radius-lg); border:4px solid var(--brand-surface);
  background:var(--brand-accent-soft);
  box-shadow:0 22px 44px -22px color-mix(in srgb, var(--brand-ink) 60%, transparent);
  transform:rotate(var(--r, 0deg));
  animation:
    bsh-rise .8s var(--motion-ease) calc(.2s + var(--n) * .14s) both,
    bsh-drift 9s ease-in-out calc(1.2s + var(--n) * .9s) infinite;
}
.bsh-photo img{ display:block; width:100%; height:100%; object-fit:cover; }
.bsh-photo-a{ left:0;   top:8%;  width:62%; aspect-ratio:5 / 4; --r:-2deg; }
.bsh-photo-b{ right:2%; top:0;   width:32%; aspect-ratio:4 / 5; --r:3deg; }
.bsh-photo-c{ right:0;  bottom:2%; width:38%; aspect-ratio:1;   --r:-3deg; }
.bsh-chip{
  position:absolute; left:4%; bottom:6%; display:inline-flex; align-items:center; gap:7px;
  padding:8px 13px; border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink); border:1px solid var(--brand-line);
  font-size:13px; font-weight:650; white-space:nowrap;
  box-shadow:0 12px 28px -14px color-mix(in srgb, var(--brand-ink) 55%, transparent);
  animation:bsh-rise .8s var(--motion-ease) .9s both;
}
.bsh-chip-dot{ width:8px; height:8px; border-radius:50%; background:var(--brand-accent); flex:none; }

@keyframes bsh-rise{
  from{ opacity:0; transform:translateY(24px) rotate(var(--r, 0deg)); }
  to{ opacity:1; transform:translateY(0) rotate(var(--r, 0deg)); }
}
@keyframes bsh-drift{ 0%,100%{ translate:0 0; } 50%{ translate:0 -8px; } }

.bsh-vh{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
:where(.bell-search-hero) button:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; border-radius:6px; }

@media (prefers-reduced-motion: reduce){
  .bsh-layer{ transform:none !important; }
  .bsh-photo, .bsh-chip{ animation:none; }
  .bsh-word > span{ transform:none; transition:none; }
  .bsh-em::after{ transform:scaleX(1); transition:none; }
}
`;
