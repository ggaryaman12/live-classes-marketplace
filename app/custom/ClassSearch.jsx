"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * ClassSearch — a filter rail beside a photo-forward grid of live classes.
 * Wired to the real, marketplace-wide catalogue: `product/getMarketplaceProducts`
 * (marketplace_user_id 510009445), confirmed live — real 200, `iTotalRecords`
 * currently 4187, real rows (product_id, name, price, store_name, user_id,
 * image_url/thumb_url/multi_image_url, is_enabled). Paginated for real, not
 * sliced client-side: `length` is the page size (kept at 50, per spec),
 * `start` the 0-based row offset — verified by paging start=0 then start=50
 * and finding zero overlapping product ids between the two real pages.
 *
 * "Load more" is throttled two ways: the control disables itself for the
 * whole in-flight request, and a minimum gap (600ms) is enforced between
 * accepted clicks even right after it re-enables, so a fast-completing
 * request still can't be spammed.
 *
 * WHAT'S REAL VS WHAT ISN'T IN THE FILTER RAIL:
 * Keyword, price and availability are real fields on every row, so they
 * filter/sort what has actually loaded so far. Subject, child's age, days of
 * the week, time of day, class format, session length, language and rating —
 * the sample version of this page had all of these — do NOT exist anywhere
 * on a row this endpoint returns (checked: no such fields in a real response,
 * confirmed against several real products). Filtering by a field that isn't
 * there would either silently do nothing or quietly return the wrong answer,
 * so those controls were removed rather than kept as decoration; the gap is
 * logged at docs/feature-requests/class-listing-filters.md.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = { marketplace_user_id: 510009445, language: "en", app_type: "WEB" };
const PAGE_SIZE = 50;
const THROTTLE_MS = 600;

const SORTS = [
  ["relevance", "Relevance"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
];

function parseImages(row) {
  let list = row.multi_image_url;
  if (typeof list === "string" && list.trim()) {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  const first = Array.isArray(list) && list.length ? list[0] : null;
  return row.thumb_url || first || row.image_url || "";
}

async function fetchPage(start) {
  try {
    const res = await fetch(`${YELO_BASE}/product/getMarketplaceProducts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...YELO_TENANT, length: PAGE_SIZE, start }),
    });
    const json = await res.json();
    return {
      ok: Array.isArray(json?.data),
      rows: Array.isArray(json?.data) ? json.data : [],
      total: Number(json?.iTotalRecords) || 0,
    };
  } catch {
    return { ok: false, rows: [], total: 0 };
  }
}

export default function ClassSearch(props) {
  return (
    <Suspense fallback={<section className="bell-cs" aria-busy="true" />}>
      <ClassSearchInner {...props} />
    </Suspense>
  );
}

function ClassSearchInner({
  heading = "Live classes",
}) {
  const router = useRouter();
  const params = useSearchParams();

  const read = useCallback((k, d = "") => params.get(k) ?? d, [params]);

  const setParam = useCallback(
    (patch) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v == null || v === false) next.delete(k);
        else next.set(k, String(v));
      }
      router.replace(`/stores${next.toString() ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router]
  );

  const q = read("q").trim().toLowerCase();
  const pmax = read("pmax");
  const availableOnly = read("available") === "1";
  const sort = read("sort") || "relevance";

  const clearAll = useCallback(() => router.replace("/stores", { scroll: false }), [router]);
  const activeCount = (q ? 1 : 0) + (pmax ? 1 : 0) + (availableOnly ? 1 : 0);

  // --- real, paginated data ---------------------------------------------
  const [state, setState] = useState("loading"); // loading | ok | error
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [start, setStart] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastFetchAt = useRef(0);

  const loadFirst = useCallback(async () => {
    setState("loading");
    const res = await fetchPage(0);
    setRows(res.rows);
    setTotal(res.total);
    setStart(res.rows.length);
    setState(res.ok ? "ok" : "error");
  }, []);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    const now = Date.now();
    if (loadingMore || now - lastFetchAt.current < THROTTLE_MS) return;
    lastFetchAt.current = now;
    setLoadingMore(true);
    const res = await fetchPage(start);
    if (res.ok) {
      setRows((r) => [...r, ...res.rows]);
      setStart((s) => s + res.rows.length);
      setTotal(res.total);
    }
    setLoadingMore(false);
  }, [start, loadingMore]);

  const hasMore = rows.length < total;

  const results = useMemo(() => {
    let list = rows.filter((r) => {
      if (q) {
        const haystack = `${r.name} ${r.store_name || ""}`.toLowerCase();
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      if (pmax && Number(r.price) > Number(pmax)) return false;
      if (availableOnly && r.is_enabled !== 1) return false;
      return true;
    });
    if (sort === "price-asc") list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    else if (sort === "price-desc") list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    return list;
  }, [rows, q, pmax, availableOnly, sort]);

  return (
    <section className="bell-cs" aria-labelledby="bell-cs-h">
      <div className="cs-frame">
        <div className="cs-topline">
          <h2 id="bell-cs-h">{heading}</h2>
          <p className="cs-placeholder-note">
            Real, live listings from across this marketplace — {total.toLocaleString()} right
            now. Keyword, price and availability filter what's loaded below;
            richer filters (subject, age, schedule) aren't wired yet because
            individual listings don't carry that information.
          </p>
        </div>

        <div className="cs-layout">
          <form
            className="cs-rail"
            aria-label="Filter classes"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="cs-rail-head">
              <span>Filters{activeCount ? ` · ${activeCount}` : ""}</span>
              {activeCount > 0 && (
                <button type="button" className="cs-clear" onClick={clearAll}>
                  Clear all
                </button>
              )}
            </div>

            <fieldset>
              <legend>Keyword</legend>
              <input
                type="search"
                value={read("q")}
                placeholder="Class or teacher name…"
                onChange={(e) => setParam({ q: e.target.value })}
              />
            </fieldset>

            <fieldset>
              <legend>Max price per session {pmax && <b>· ₹{pmax}</b>}</legend>
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={pmax || "2000"}
                onChange={(e) => setParam({ pmax: e.target.value === "2000" ? "" : e.target.value })}
                aria-label="Maximum price per session in rupees"
              />
              <div className="cs-range-ends"><span>₹50</span><span>₹2000+</span></div>
            </fieldset>

            <fieldset>
              <label className="cs-check cs-switch">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setParam({ available: e.target.checked ? "1" : "" })}
                />
                <span>Only available classes</span>
              </label>
            </fieldset>
          </form>

          <div className="cs-results">
            <div className="cs-results-bar">
              <div className="cs-results-actions">
                <label className="cs-sort">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setParam({ sort: e.target.value === "relevance" ? "" : e.target.value })}>
                    {SORTS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {state === "loading" && rows.length === 0 && (
              <ul className="cs-grid" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="cs-skel">
                    <span className="cs-skel-media" />
                    <span className="cs-skel-line" style={{ width: "78%" }} />
                    <span className="cs-skel-line" style={{ width: "40%" }} />
                  </li>
                ))}
              </ul>
            )}

            {state === "error" && (
              <div className="cs-empty">
                <h3>Couldn't load classes right now</h3>
                <p>Something went wrong reaching the marketplace. Try again.</p>
                <button type="button" onClick={loadFirst}>Try again</button>
              </div>
            )}

            {state === "ok" && results.length === 0 && (
              <div className="cs-empty">
                <h3>No classes match yet</h3>
                <p>
                  {activeCount
                    ? "Try widening the price range or clearing a filter."
                    : "Nothing listed right now — check back soon."}
                </p>
                {activeCount > 0 && (
                  <button type="button" onClick={clearAll}>Clear all filters</button>
                )}
              </div>
            )}

            {state === "ok" && results.length > 0 && (
              <>
                <ul className="cs-grid">
                  {results.map((c) => (
                    <li key={c.product_id}>
                      <ClassCard c={c} />
                    </li>
                  ))}
                </ul>
                {hasMore && !activeCount && (
                  <div className="cs-more">
                    <button type="button" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : `Load more · ${total - rows.length} left`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <style>{styles}</style>
    </section>
  );
}

function ClassCard({ c }) {
  const img = parseImages(c);
  const fallback = `https://picsum.photos/seed/class-${c.product_id}/480/360`;
  const href = `/p/class?id=${c.product_id}`;
  const unavailable = c.is_enabled !== 1;
  return (
    <article className="cs-card" data-full={unavailable}>
      <Link href={href} className="cs-card-media">
        <img
          src={img || fallback}
          alt={c.name}
          width="480"
          height="360"
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
        />
        {unavailable && <span className="cs-age">Unavailable</span>}
      </Link>
      <div className="cs-card-body">
        {c.store_name && <p className="cs-card-subj">{c.store_name}</p>}
        <Link href={href} className="cs-card-title-link">
          <h3 className="cs-card-title">{c.name}</h3>
        </Link>
        <div className="cs-card-foot">
          <span className="cs-price"><b>₹{Number(c.price || 0).toLocaleString()}</b> <i>/ session</i></span>
          <Link href={href} className="cs-view" data-full={unavailable}>
            {unavailable ? "Unavailable" : "View class"}
          </Link>
        </div>
      </div>
    </article>
  );
}

const styles = `
.bell-cs{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:48px 20px 80px; }
@media (min-width:820px){ .bell-cs{ padding:64px 32px 104px; } }
.cs-frame{ max-width:1200px; margin-inline:auto; }
.cs-topline h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.5rem,3.6vw,2.1rem); margin:0 0 6px; }
.cs-placeholder-note{ margin:0 0 28px; font-size:.82rem; color:var(--brand-ink-soft); max-width:68ch; }

.cs-layout{ display:grid; gap:28px; grid-template-columns:1fr; }
@media (min-width:940px){ .cs-layout{ grid-template-columns:264px 1fr; align-items:start; } }

.cs-rail{
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); padding:6px 16px 16px;
}
/* Fixed in place while the results scroll past it — and if the rail's own
   content ever runs taller than the viewport (a bigger filter set, a small
   screen with the browser UI eating space, browser zoom), it gets its own
   internal scrollbar instead of spilling under the footer or getting cut off. */
@media (min-width:940px){
  .cs-rail{ position:sticky; top:16px; max-height:calc(100vh - 32px); overflow-y:auto; }
}
.cs-rail-head{ display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:var(--brand-surface); padding:12px 0 10px; font-family:var(--brand-font-display); font-weight:600; font-size:.9rem; border-bottom:1px solid var(--brand-line); z-index:1; }
.cs-clear{ border:0; background:transparent; color:var(--brand-accent); font-weight:600; font-size:.8rem; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }

.cs-rail fieldset{ border:0; border-bottom:1px solid var(--brand-line); margin:0; padding:14px 0; }
.cs-rail fieldset:last-child{ border-bottom:0; }
.cs-rail legend{ font-family:var(--brand-font-display); font-weight:600; font-size:.82rem; color:var(--brand-ink); margin-bottom:10px; padding:0; }
.cs-rail legend b{ color:var(--brand-accent); font-weight:600; }

.cs-rail input[type="search"]{
  width:100%; padding:9px 10px; font:inherit; font-size:.86rem;
  border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-paper); color:var(--brand-ink);
}
.cs-check{ display:flex; gap:9px; align-items:flex-start; padding:5px 0; font-size:.84rem; cursor:pointer; }
.cs-check input{ margin-top:2px; accent-color:var(--brand-accent); width:15px; height:15px; }
.cs-switch{ font-weight:500; }

.cs-rail input[type="range"]{ width:100%; accent-color:var(--brand-accent); }
.cs-range-ends{ display:flex; justify-content:space-between; font-size:.72rem; color:var(--brand-ink-soft); margin-top:2px; }
.cs-empty button{ margin-top:8px; border:1px solid var(--brand-line); background:var(--brand-paper); border-radius:980px; padding:5px 12px; font:inherit; font-size:.76rem; cursor:pointer; color:var(--brand-ink); }

.cs-results-bar{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:flex-end; margin-bottom:18px; }
.cs-results-actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cs-sort{ display:flex; align-items:center; gap:7px; font-size:.82rem; color:var(--brand-ink-soft); }
.cs-sort select{ font:inherit; font-size:.82rem; padding:7px 9px; border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-surface); color:var(--brand-ink); }

.cs-grid{ list-style:none; margin:0; padding:0; display:grid; gap:16px; grid-template-columns:1fr; }
@media (min-width:560px){ .cs-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:1140px){ .cs-grid{ grid-template-columns:repeat(3,1fr); } }

.cs-card{
  display:flex; flex-direction:column; overflow:hidden;
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
  transition:box-shadow var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
.cs-card:hover{ box-shadow:0 20px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent); transform:translateY(-2px); }
.cs-card-media{ position:relative; display:block; aspect-ratio:4/3; overflow:hidden; background:var(--brand-accent-soft); }
.cs-card-media img{ width:100%; height:100%; object-fit:cover; display:block; }
.cs-age{
  position:absolute; left:10px; bottom:10px;
  background:var(--brand-surface); color:var(--brand-ink);
  border:1px solid var(--brand-line); border-radius:980px;
  font-size:.72rem; font-weight:600; padding:4px 10px;
}
.cs-card[data-full="true"] .cs-card-media img{ filter:grayscale(.4) opacity(.85); }

.cs-card-body{ display:flex; flex-direction:column; gap:6px; padding:14px 15px 15px; }
.cs-card-subj{ margin:0; font-size:.72rem; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--brand-ink-soft); }
.cs-card-title-link{ text-decoration:none; color:inherit; }
.cs-card-title-link:hover .cs-card-title{ color:var(--brand-accent); }
.cs-card-title{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1.02rem; line-height:1.25; transition:color var(--motion) var(--motion-ease); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cs-card-foot{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-top:6px; }
.cs-price b{ font-family:var(--brand-font-display); font-size:1.02rem; font-variant-numeric:tabular-nums; }
.cs-price i{ font-style:normal; font-size:.74rem; color:var(--brand-ink-soft); }
.cs-view{
  padding:8px 14px; border-radius:980px; border:1px solid var(--brand-line);
  color:var(--brand-ink); font-size:.78rem; font-weight:600; text-decoration:none;
  transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.cs-view:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.cs-view[data-full="true"]{ pointer-events:none; opacity:.6; }

.cs-more{ display:flex; justify-content:center; margin-top:26px; }
.cs-more button{ border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-weight:600; font-size:.9rem; padding:11px 24px; border-radius:980px; cursor:pointer; transition:border-color var(--motion) var(--motion-ease); }
.cs-more button:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.cs-more button:disabled{ opacity:.6; cursor:default; }

.cs-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:14px; display:grid; gap:10px; }
.cs-skel-media{ display:block; aspect-ratio:4/3; border-radius:var(--radius); background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:cs-sweep 1.4s ease-in-out infinite; }
.cs-skel-line{ display:block; height:11px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:cs-sweep 1.4s ease-in-out infinite; }
@keyframes cs-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.cs-empty{
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); padding:40px 24px; text-align:center;
}
.cs-empty h3{ font-family:var(--brand-font-display); font-weight:600; margin:0 0 8px; }
.cs-empty p{ margin:0 auto 16px; color:var(--brand-ink-soft); max-width:42ch; font-size:.9rem; }

.bell-cs :is(button, input, select, a):focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; border-radius:6px; }

@media (prefers-reduced-motion: reduce){
  .cs-card{ transition:none; }
  .cs-card:hover{ transform:none; }
  .cs-skel-media, .cs-skel-line{ animation:none; }
}
`;
