"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * SubjectTiles — real business categories from this tenant's backend
 * (`businessCategory/getCategory`), rendered as tilting tiles. Confirmed
 * live: status 200, 13 real categories (id, name, icon/thumb_list,
 * is_all_category). Field names and click behaviour (is_all_category tile
 * browses everything; the rest carry a real category id) match how
 * platform-source's business-categories component consumes this endpoint.
 *
 * Note: this tenant's real categories are general services (Handyman
 * Services, AC repair, Gardening & Landscaping...), not kids' school
 * subjects — that's what the backend actually has, so that's what's shown.
 *
 * CLICK BEHAVIOUR: a tile no longer navigates away. It sets `?category=<id>`
 * (+ `categoryName` for the label) on this same page and scrolls down to
 * "Teachers with classes open now" (`#teachers-open-now`), which reads that
 * param and re-fetches filtered. Verified live and real, not a client-side
 * filter: `marketplace/marketplace_get_city_storefronts_v3` (the same browse
 * call TeacherDirectory already uses) accepts `business_category_id` — called
 * with a real category id it returned a different, smaller, real result set
 * (3 stores) than the unfiltered call (9 stores), and a bogus id returned 0 —
 * same field/endpoint the real webapp's restaurant list uses
 * (restaurants.component.ts, `obj['business_category_id']`). The
 * "Browse everything" tile (`is_all_category`) clears the filter instead.
 *
 * Falls back to a small labelled placeholder set only if the real call
 * fails outright (network/backend error) — not normally hit, since the
 * endpoint has been verified to return real data reliably.
 */

const HUES = ["#2F6F7A", "#7A4A6B", "#4E6B3A", "#3E5C8A", "#8A6A1E", "#5C4A7A", "#8A5038", "#5F5140"];

const FALLBACK = [
  { id: "fallback-1", name: "Handyman Services" },
  { id: "fallback-2", name: "Home Painting" },
  { id: "fallback-3", name: "Gardening & Landscaping" },
  { id: "fallback-4", name: "Graphic Design" },
];

const API_BASE = "https://test-api-new-3008.jungleworks.com";
const QUERY =
  "domain_name=deliverecttest.devweb1.yelo.red&post_to_get=1&marketplace_user_id=510009445" +
  "&version=2&vendor_id=40951&latitude=28.61482&longitude=77.219989&home_delivery=1&dual_user_key=0&language=en";

export default function SubjectTiles({
  heading = "Browse by category",
  subhead = "What this teacher network actually offers right now, pulled live from the marketplace.",
}) {
  const pathname = usePathname();
  const [state, setState] = useState("loading"); // loading | real | fallback
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/businessCategory/getCategory?${QUERY}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
        });
        const json = await res.json();
        if (cancelled) return;
        const list = json?.status === 200 ? json?.data?.result : null;
        if (Array.isArray(list) && list.length) {
          setCategories(list);
          setState("real");
        } else {
          setCategories(FALLBACK);
          setState("fallback");
        }
      } catch {
        if (!cancelled) {
          setCategories(FALLBACK);
          setState("fallback");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiles = categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    icon: c.thumb_list?.["200x200"] || c.icon || "",
    isAll: !!c.is_all_category,
    hue: HUES[i % HUES.length],
  }));

  return (
    <section className="bell-subjects" aria-labelledby="bell-subjects-h">
      <div className="bs-frame">
        <header className="bs-head">
          <h2 id="bell-subjects-h">{heading}</h2>
          <p>{subhead}</p>
          {state === "fallback" && <span className="bs-fallback-tag">Sample categories — live feed unavailable right now</span>}
        </header>

        {state === "loading" ? (
          <ul className="bs-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}><span className="bs-skel" /></li>
            ))}
          </ul>
        ) : (
          <ul className="bs-grid">
            {tiles.map((t) => {
              const href = t.isAll
                ? `${pathname}#teachers-open-now`
                : `${pathname}?category=${t.id}&categoryName=${encodeURIComponent(t.name)}#teachers-open-now`;
              return (
                <li key={t.id}>
                  <Tile tile={t} href={href} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <style>{css}</style>
    </section>
  );
}

function Tile({ tile, href }) {
  const ref = useRef(null);
  const router = useRouter();
  const [tiltable, setTiltable] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTiltable(fine && !reduced);
  }, []);

  // Same page, so this is a filter + scroll, not a navigation: update the URL
  // (so the section below can read `category` and it's shareable/bookmarkable)
  // without Next's default hard jump-to-top, then ease down to the section
  // ourselves — instant under prefers-reduced-motion.
  const onClick = (e) => {
    e.preventDefault();
    router.push(href, { scroll: false });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      document.getElementById("teachers-open-now")?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const onMove = (e) => {
    if (!tiltable) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 11).toFixed(2)}deg`);
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "0%");
  };

  return (
    <Link
      ref={ref}
      href={href}
      className="bs-tile"
      style={{ "--hue": tile.hue }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onClick={onClick}
    >
      {tile.icon ? (
        <img className="bs-icon" src={tile.icon} alt="" width="36" height="36" loading="lazy" />
      ) : (
        <span className="bs-glyph" aria-hidden="true">●</span>
      )}
      <span className="bs-name">{tile.isAll ? "Browse everything" : tile.name}</span>
    </Link>
  );
}

const css = `
.bell-subjects{
  background:var(--brand-paper); color:var(--brand-ink);
  font-family:var(--brand-font-body);
  padding:64px 20px; border-bottom:1px solid var(--brand-line);
}
@media (min-width:820px){ .bell-subjects{ padding:96px 32px; } }
.bs-frame{ max-width:1200px; margin-inline:auto; }
.bs-head h2{
  font-family:var(--brand-font-display); font-weight:600;
  letter-spacing:-.01em; font-size:clamp(1.6rem, 4vw, 2.35rem);
  margin:0 0 8px;
}
.bs-head p{ margin:0 0 10px; color:var(--brand-ink-soft); font-size:1rem; max-width:46ch; }
.bs-fallback-tag{
  display:inline-block; margin:0 0 22px; padding:5px 12px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink-soft);
  font-size:11.5px; font-weight:700;
}
.bs-head p + .bs-fallback-tag{ margin-top:0; }

.bs-grid{
  list-style:none; margin:22px 0 0; padding:0;
  display:grid; gap:14px;
  grid-template-columns:repeat(2, 1fr);
}
@media (min-width:560px){ .bs-grid{ grid-template-columns:repeat(3, 1fr); } }
@media (min-width:900px){ .bs-grid{ grid-template-columns:repeat(4, 1fr); } }

.bs-tile{
  --mx:50%; --my:0%; --rx:0deg; --ry:0deg;
  position:relative; display:flex; flex-direction:column; gap:10px;
  min-height:110px; padding:18px;
  border-radius:var(--radius-lg);
  background:
    radial-gradient(120px 120px at var(--mx) var(--my), color-mix(in srgb, var(--hue) 26%, transparent), transparent 70%),
    color-mix(in srgb, var(--hue) 9%, var(--brand-surface));
  border:1px solid color-mix(in srgb, var(--hue) 34%, var(--brand-line));
  color:var(--brand-ink); text-decoration:none;
  transform:perspective(680px) rotateX(var(--rx)) rotateY(var(--ry));
  transform-style:preserve-3d;
  transition:transform .3s var(--motion-ease), box-shadow .3s var(--motion-ease);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
.bs-tile:hover{
  box-shadow:0 18px 40px -22px color-mix(in srgb, var(--hue) 55%, transparent);
}
.bs-icon{
  width:32px; height:32px; border-radius:8px; object-fit:cover;
  background:var(--brand-surface); transform:translateZ(24px);
}
.bs-glyph{
  font-size:22px; line-height:1; color:color-mix(in srgb, var(--hue) 70%, var(--brand-ink));
  transform:translateZ(24px);
}
.bs-name{ font-family:var(--brand-font-display); font-weight:600; font-size:1rem; transform:translateZ(16px); }

.bs-skel{
  display:block; min-height:110px; border-radius:var(--radius-lg);
  background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%);
  background-size:200% 100%; animation:bs-sweep 1.4s ease-in-out infinite;
}
@keyframes bs-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.bs-tile:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:3px; }

@media (prefers-reduced-motion: reduce){
  .bs-tile{ transform:none; transition:none; }
  .bs-skel{ animation:none; }
}
`;
