"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TeacherEditorial — the landing page's single teacher moment. Instead of a
 * bare "highly rated teachers" grid repeated from every other page, this is
 * an editorial lead-in: a warm statement that wipes in, the vetting promise,
 * and a layered collage of teacher portraits at four depths that drift with
 * scroll and the pointer, back planes softened with depth-of-field.
 *
 * The live roster grid (StoreGrid, real merchant data) sits directly below
 * this in the tree — this band is its introduction, not a second copy.
 *
 * Portraits are term-addressed stock standing in for real teacher photos.
 * prefers-reduced-motion: the collage holds still, statement shows at once.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const PORTRAITS = [
  { q: "woman,teacher,smiling", subject: "Reading & Writing", depth: 1.0, x: "85%", y: "16%", w: 180 },
  { q: "man,teacher,portrait", subject: "Coding & Tech", depth: 0.62, x: "8%", y: "18%", w: 150 },
  { q: "teacher,classroom,woman", subject: "Science", depth: 0.5, x: "91%", y: "64%", w: 140 },
  { q: "music,teacher,man", subject: "Music & Drama", depth: 0.3, x: "6%", y: "74%", w: 126 },
  { q: "art,teacher,woman", subject: "Art & Design", depth: 0.22, x: "24%", y: "93%", w: 120 },
];

const PROMISES = [
  "Every teacher submits their experience and ID before they can list.",
  "Each class is checked by our team before a parent can enrol.",
  "Ratings and reviews come only from parents whose child actually attended.",
];

export default function TeacherEditorial({
  eyebrow = "Who's teaching",
  statement = "The people your kid will actually meet — not a logo, not a bot. Real teachers, running small rooms they've built themselves.",
}) {
  const wrapRef = useRef(null);
  const layerRefs = useRef([]);
  const [ready, setReady] = useState(false);
  const [prog, setProg] = useState(0);

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
    let lastP = -1;
    const onMove = (e) => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const loop = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      const onScreen = r && r.bottom > -200 && r.top < window.innerHeight + 200;
      if (onScreen) {
        const p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
        const c = Math.min(1, Math.max(0, p));
        if (Math.abs(c - lastP) > 0.003) {
          lastP = c;
          setProg(c);
        }
        cx += (tx - cx) * 0.05;
        cy += (ty - cy) * 0.05;
        layerRefs.current.forEach((el, i) => {
          if (!el) return;
          const d = PORTRAITS[i].depth;
          const drift = (c - 0.5) * (60 + d * 90);
          el.style.transform = `translate3d(${cx * (8 + d * 26)}px, ${cy * (6 + d * 16) - drift}px, 0)`;
        });
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

  const wipe = ready ? Math.min(1, 0.15 + prog * 1.4) : 0;

  return (
    <section ref={wrapRef} className="bell-ted" data-ready={ready} aria-labelledby="bell-ted-h">
      <div className="ted-collage" aria-hidden="true">
        {PORTRAITS.map((p, i) => {
          const src = `https://source.unsplash.com/400x500/?${encodeURIComponent(p.q)}`;
          const fallback = `https://picsum.photos/seed/bell-teacher-${i}/400/500`;
          return (
            <figure
              key={i}
              ref={(el) => (layerRefs.current[i] = el)}
              className="ted-portrait"
              style={{
                left: p.x,
                top: p.y,
                width: `clamp(96px, ${p.w / 10}vw, ${p.w}px)`,
                "--d": p.depth,
                zIndex: Math.round(p.depth * 10),
              }}
            >
              <img
                src={src}
                alt=""
                width="400"
                height="500"
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                }}
              />
              <figcaption>{p.subject}</figcaption>
            </figure>
          );
        })}
      </div>

      <div className="ted-frame">
        <p className="ted-eyebrow">{eyebrow}</p>
        <h2 id="bell-ted-h" className="ted-statement">
          <span
            className="ted-statement-inner"
            style={{ clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}
          >
            {statement}
          </span>
        </h2>
        <ul className="ted-promises">
          {PROMISES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="ted-cue">The teachers with classes open right now ↓</p>
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-ted{
  position:relative; isolation:isolate; overflow:hidden;
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:88px 20px; border-bottom:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-ted{ padding:128px 32px 112px; } }

.ted-collage{ position:absolute; inset:0; z-index:0; pointer-events:none; }
.ted-portrait{
  position:absolute; margin:0; transform:translate(-50%,-50%);
  will-change:transform;
  opacity:calc(.5 + var(--d) * .5);
  filter:blur(calc((1 - var(--d)) * 3px));
}
.ted-portrait img{
  width:100%; height:auto; display:block;
  border-radius:var(--radius-lg);
  border:1px solid var(--brand-line);
  background:var(--brand-accent-soft);
  box-shadow:0 24px 60px -30px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.ted-portrait figcaption{
  position:absolute; left:8px; bottom:8px;
  padding:3px 9px; border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 88%, transparent);
  border:1px solid var(--brand-line);
  font-size:10.5px; font-weight:600; color:var(--brand-ink-soft);
}

.ted-frame{
  position:relative; z-index:2;
  max-width:640px; margin-inline:auto; text-align:center;
  background:color-mix(in srgb, var(--brand-paper) 72%, transparent);
  backdrop-filter:blur(3px);
  border-radius:var(--radius-lg);
  padding:12px 8px;
}
.ted-eyebrow{
  display:inline-block; margin:0 0 16px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:var(--brand-surface);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.ted-statement{
  font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.015em; line-height:1.18;
  font-size:clamp(1.5rem, 4.2vw, 2.5rem);
  margin:0 auto 26px; max-width:22ch;
}
.ted-statement-inner{ display:inline-block; }

.ted-promises{
  list-style:none; margin:0 auto 24px; padding:0;
  display:grid; gap:10px; max-width:44ch;
  text-align:left;
}
.ted-promises li{
  position:relative; padding-left:26px;
  font-size:.9rem; color:var(--brand-ink-soft); line-height:1.5;
}
.ted-promises li::before{
  content:""; position:absolute; left:0; top:.35em;
  width:14px; height:14px; border-radius:50%;
  background:var(--brand-accent-soft);
  border:2px solid var(--brand-accent);
}
.ted-cue{
  margin:0; font-size:.82rem; font-weight:600; color:var(--brand-accent);
}

@media (prefers-reduced-motion: reduce){
  .ted-portrait{ transform:translate(-50%,-50%) !important; }
  .ted-statement-inner{ clip-path:none !important; }
}
`;
