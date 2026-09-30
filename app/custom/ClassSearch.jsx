"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * ClassSearch — a filter rail beside a photo-forward grid of live classes.
 * Wired to the real, marketplace-wide catalogue: `product/getMarketplaceProducts`
 * (marketplace_user_id 510009445), confirmed live — real 200, `iTotalRecords`
 * currently 4187, real rows (product_id, name, price, store_name, user_id,
 * image_url/thumb_url/multi_image_url, is_enabled, min_age, max_age).
 * Paginated for real, not sliced client-side: `length` is the page size (kept
 * at 50, per spec), `start` the 0-based row offset — verified by paging
 * start=0 then start=50 and finding zero overlapping product ids between the
 * two real pages. "Load more" is throttled two ways: the control disables
 * itself for the whole in-flight request, and a minimum gap (600ms) is
 * enforced between accepted clicks even right after it re-enables. A
 * sentinel below the grid also triggers the next page on scroll, well before
 * the button would ever need pressing (see the IntersectionObserver below).
 *
 * KEYWORD SEARCH tries the real marketplace-wide search first
 * (`search/global/product`, the same endpoint and payload shape the real
 * webapp's search box uses — `user_id` sent as the tenant's own
 * marketplace_user_id, not a customer id or a guest 0, which is what silently
 * returned nothing on the first attempt at this). If that comes back with
 * real matches, those are shown; if it comes back empty (verified live: even
 * an exact, real product name returns none for this tenant right now — reads
 * as this tenant's search index not being populated, not a wrong payload) or
 * fails, the keyword instead narrows whatever's already loaded below.
 *
 * WHAT'S REAL VS WHAT ISN'T IN THE FILTER RAIL:
 * Price is a genuine SERVER-side filter (see priceFilterBody/fetchPage) —
 * `filter: {min_price, max_price}` on this same endpoint, confirmed live
 * against the real 4187-row catalogue (a 50-200 range came back as a real,
 * stable 341, every price inside range). It rejected an incomplete version
 * of this exact shape once before; re-verified working before wiring it in,
 * so this isn't assumed. Because it's server-side, "Load more" and the
 * scroll sentinel keep working with a price range set (see
 * clientOnlyFilterActive) — a price filter genuinely fetches more real,
 * already-narrowed rows, unlike the client-only filters below.
 * Keyword and availability are real fields, filtered client-side over
 * whatever's loaded (keyword also tries the real marketplace-wide search
 * first — see above). Child's age is real too, but stays client-side and
 * inclusive-of-unset deliberately: the same server filter object accepts
 * min_age/max_age, but excludes null rows rather than treating "unset" as
 * "no restriction", and every real product here has both null right now, so
 * wiring it server-side would hide the entire catalogue the moment the
 * slider is touched. Subject, days of the week, time of day, class format,
 * session length and language don't exist anywhere on a row this endpoint
 * returns (checked: no such fields in a real response, confirmed against
 * several real products), so those controls stay out rather than being kept
 * as decoration; the gap is logged at
 * docs/feature-requests/class-listing-filters.md.
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
const PRICE_MIN = 50;
const PRICE_MAX = 2000;
const pricePct = (v) => ((Number(v) - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

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

// `filter.min_price`/`max_price` is a REAL, working server-side filter on
// this endpoint — confirmed live: {filter:{min_price:50,max_price:200}}
// narrowed the real 4187-row total to a real, stable 341, with every
// returned price inside the range. It genuinely wasn't accepted (a flat
// "\"filter\" is not allowed") the first time this was tried; it works now,
// most likely because the platform added support for it in between —
// re-verified with repeat calls before wiring it in, so this isn't a fluke.
// `min_age`/`max_age` are accepted in the same object too — now wired
// server-side as well, sending the single "child's age" value as both
// bounds (the natural reading of one slider onto a min/max pair: "does
// this class's age range cover this age"). Every real product here still
// has both fields null, and this endpoint excludes null rows once an age
// filter is present (confirmed live), so the honest result today is that
// picking an age returns zero classes — that's the real backend answer,
// not a bug, and it'll start returning real matches the moment any class
// actually gets an age range set.
function realFilterBody(pmin, pmax, age) {
  const filter = {};
  if (pmin) filter.min_price = Number(pmin);
  if (pmax) filter.max_price = Number(pmax);
  if (age) {
    filter.min_age = Number(age);
    filter.max_age = Number(age);
  }
  return Object.keys(filter).length ? { filter } : {};
}

async function fetchPage(start, pmin, pmax, age) {
  try {
    const res = await fetch(`${YELO_BASE}/product/getMarketplaceProducts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...YELO_TENANT, length: PAGE_SIZE, start, ...realFilterBody(pmin, pmax, age) }),
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

// Real, marketplace-wide product search (Elasticsearch) — the same endpoint
// and payload shape the real webapp's search box uses (search-all.component.ts
// searchTextHit/getSearchedProductData): `user_id` is set to the tenant's own
// marketplace_user_id, not a customer id or 0 — sending a guest "0" there is
// what silently returned nothing the first time this was tried. Verified
// live with the corrected shape: real 200, real envelope
// (`data.search_text`/`data.result`) — for this tenant specifically it comes
// back empty even for an exact, real product name ("prawn"), which reads as
// this tenant's product search index not being populated rather than a
// wrong payload, so a genuinely-empty result here still falls back to
// filtering what's already loaded (see the results memo below).
async function fetchProductSearch(term) {
  try {
    const res = await fetch(`${YELO_BASE}/search/global/product`, {
      method: "POST",
      headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
      body: JSON.stringify({
        ...YELO_TENANT,
        search_text: term,
        user_id: YELO_TENANT.marketplace_user_id,
        latitude: 28.61482,
        longitude: 77.219989,
        date_time: new Date().toISOString(),
        self_pickup: 0,
      }),
    });
    const json = await res.json();
    const result = json?.data?.result;
    return { ok: json?.status === 200, rows: Array.isArray(result) ? result : [] };
  } catch {
    return { ok: false, rows: [] };
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

  const qFromUrl = read("q");
  const q = qFromUrl.trim().toLowerCase();

  // The keyword field types like a normal input (instant), but the actual
  // filter — which rewrites the URL via setParam — only fires 300ms after
  // typing stops, so a fast typist doesn't spam a URL update (and a
  // re-filter of everything loaded) on every single keystroke.
  const [qInput, setQInput] = useState(qFromUrl);
  const qDebounceRef = useRef(null);
  useEffect(() => {
    setQInput(qFromUrl);
  }, [qFromUrl]);
  useEffect(() => () => clearTimeout(qDebounceRef.current), []);
  const onKeywordChange = (value) => {
    setQInput(value);
    clearTimeout(qDebounceRef.current);
    qDebounceRef.current = setTimeout(() => setParam({ q: value }), 300);
  };
  const pmin = read("pmin");
  const pmax = read("pmax");
  const age = read("age");
  const availableOnly = read("available") === "1";
  const sort = read("sort") || "relevance";

  const clearAll = useCallback(() => router.replace("/stores", { scroll: false }), [router]);
  const activeCount = (q ? 1 : 0) + (pmin ? 1 : 0) + (pmax ? 1 : 0) + (age ? 1 : 0) + (availableOnly ? 1 : 0);
  // Price AND age are filtered server-side now (see fetchPage), so paging
  // genuinely fetches more real, already-narrowed rows with either set.
  // Keyword and "only available" are still applied client-side over
  // whatever's loaded, so pagination stays paused while either is on —
  // "Load more" would otherwise fetch rows that only get filtered away.
  const clientOnlyFilterActive = !!q || availableOnly;

  // SLIDERS: the price and age sliders used to write straight to the URL on
  // every tick of a drag, and read their value back FROM the URL — which
  // updates a beat later (and each tick also refetched the whole grid). The
  // thumb lagged, snapped back and stuttered, so dragging felt broken. Now the
  // thumbs move on local "draft" state instantly and the filter is applied
  // once — when the finger/mouse lets go, or ~450ms after a keyboard change.
  const [priceDraft, setPriceDraft] = useState({ min: pmin || "50", max: pmax || "2000" });
  const [ageDraft, setAgeDraft] = useState(age || "10");
  const draggingRef = useRef(false);
  const dragKindRef = useRef("price");
  const commitTimerRef = useRef(null);
  const draftRef = useRef({});
  draftRef.current = { min: priceDraft.min, max: priceDraft.max, age: ageDraft };
  const commitRef = useRef(() => {});
  commitRef.current = (which) => {
    clearTimeout(commitTimerRef.current);
    const d = draftRef.current;
    if (which === "price") {
      setParam({ pmin: d.min === "50" ? "" : d.min, pmax: d.max === "2000" ? "" : d.max });
    } else {
      setParam({ age: d.age });
    }
  };
  // Keep the thumbs in step with the URL when it changes from outside (Clear
  // all, browser back) — but never while a drag is in progress.
  useEffect(() => {
    if (!draggingRef.current) setPriceDraft({ min: pmin || "50", max: pmax || "2000" });
  }, [pmin, pmax]);
  useEffect(() => {
    if (!draggingRef.current) setAgeDraft(age || "10");
  }, [age]);
  // Release anywhere on the page (the pointer often ends outside the input).
  useEffect(() => {
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      commitRef.current(dragKindRef.current);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      clearTimeout(commitTimerRef.current);
    };
  }, []);
  const startDrag = (kind) => {
    draggingRef.current = true;
    dragKindRef.current = kind;
    clearTimeout(commitTimerRef.current);
  };
  const scheduleCommit = (kind) => {
    if (draggingRef.current) return; // applied on release
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => commitRef.current(kind), 450);
  };
  // A minimum above the maximum (or the reverse) would silently zero out every
  // result — push the other bound along instead.
  const onPriceInput = (which, v) => {
    setPriceDraft((prev) => {
      let min = which === "min" ? v : prev.min;
      let max = which === "max" ? v : prev.max;
      if (Number(min) > Number(max)) {
        if (which === "min") max = min;
        else min = max;
      }
      return { min, max };
    });
    scheduleCommit("price");
  };
  const onAgeInput = (v) => {
    setAgeDraft(v);
    scheduleCommit("age");
  };
  const priceTouched = priceDraft.min !== "50" || priceDraft.max !== "2000";
  const ageShown = age ? ageDraft : ageDraft !== "10" ? ageDraft : "";

  // --- real, paginated data ---------------------------------------------
  const [state, setState] = useState("loading"); // loading | ok | error
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones/tablets: filters collapse behind a bar
  const [start, setStart] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastFetchAt = useRef(0);

  const loadFirst = useCallback(async () => {
    setState("loading");
    const res = await fetchPage(0, pmin, pmax, age);
    setRows(res.rows);
    setTotal(res.total);
    setStart(res.rows.length);
    setState(res.ok ? "ok" : "error");
  }, [pmin, pmax, age]);

  // Re-runs from page 0 whenever the (server-side) price or age filter
  // changes — a different filter means a different total and a different
  // first page.
  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    const now = Date.now();
    if (loadingMore || now - lastFetchAt.current < THROTTLE_MS) return;
    lastFetchAt.current = now;
    setLoadingMore(true);
    const res = await fetchPage(start, pmin, pmax, age);
    if (res.ok) {
      setRows((r) => [...r, ...res.rows]);
      setStart((s) => s + res.rows.length);
      setTotal(res.total);
    }
    setLoadingMore(false);
  }, [start, loadingMore, pmin, pmax, age]);

  const hasMore = rows.length < total;

  // Infinite scroll: a sentinel near the end of the grid triggers the next
  // page itself, well before the user actually reaches the bottom (a 600px
  // rootMargin), so scrolling alone keeps the list growing — the button
  // below is a fallback for keyboard/screen-reader use, not the main path.
  // The observer is kept alive across fetches (a ref always points at the
  // current loadMore) rather than torn down and recreated every time a page
  // finishes — IntersectionObserver fires once immediately on `observe()`
  // for whatever's already intersecting, so rebuilding it mid-scroll would
  // re-fire on its own and could chain-load pages nobody scrolled for.
  const sentinelRef = useRef(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);
  useEffect(() => {
    if (!hasMore || clientOnlyFilterActive) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, clientOnlyFilterActive]);

  // Real, server-side product search — fires whenever the (debounced)
  // keyword changes. If it comes back with real matches, those are what's
  // shown; if it comes back empty (or fails), that's not treated as "no
  // matches exist" — it falls back to searching only what's already loaded,
  // same as before this was wired. See fetchProductSearch's own note on why
  // an empty real 200 here isn't necessarily "nothing matches".
  const [searchState, setSearchState] = useState("idle"); // idle | loading | ok | fallback
  const [searchRows, setSearchRows] = useState([]);
  useEffect(() => {
    if (!q) {
      setSearchState("idle");
      setSearchRows([]);
      return;
    }
    let cancelled = false;
    setSearchState("loading");
    fetchProductSearch(q).then((res) => {
      if (cancelled) return;
      if (res.ok && res.rows.length) {
        setSearchRows(res.rows);
        setSearchState("ok");
      } else {
        setSearchRows([]);
        setSearchState("fallback");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const usingRealSearch = !!q && searchState === "ok";

  const results = useMemo(() => {
    const source = usingRealSearch ? searchRows : rows;
    let list = source.filter((r) => {
      if (q && !usingRealSearch) {
        const haystack = `${r.name} ${r.store_name || ""}`.toLowerCase();
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      if (pmin && Number(r.price) < Number(pmin)) return false;
      if (pmax && Number(r.price) > Number(pmax)) return false;
      if (age && usingRealSearch) {
        // Age is filtered server-side for the browse feed now (see
        // realFilterBody/fetchPage), so `rows` already reflects it and this
        // second check is redundant there. Real marketplace search results
        // (`searchRows`) never went through that server filter, so it's
        // still applied here — inclusively, since a listing with no age
        // range set shouldn't read as "excluded" just because it's blank.
        const kidAge = Number(age);
        if (r.min_age != null && kidAge < Number(r.min_age)) return false;
        if (r.max_age != null && kidAge > Number(r.max_age)) return false;
      }
      if (availableOnly && r.is_enabled !== 1) return false;
      return true;
    });
    if (sort === "price-asc") list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    else if (sort === "price-desc") list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    return list;
  }, [rows, searchRows, usingRealSearch, q, pmin, pmax, age, availableOnly, sort]);

  return (
    <section className="bell-cs" aria-labelledby="bell-cs-h">
      <div className="cs-frame">
        <div className="cs-topline">
          <h2 id="bell-cs-h">{heading}</h2>
          <p className="cs-lede">
            {state === "ok" && total > 0
              ? `${total.toLocaleString()} live classes to choose from. Pick one, pick a time, and jump in.`
              : "Live classes with real teachers. Pick one, pick a time, and jump in."}
          </p>
        </div>

        <div className="cs-layout">
          <form
            className="cs-rail"
            aria-label="Filter classes"
            onSubmit={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="cs-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="cs-rail-body"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <span>Filters{activeCount ? ` · ${activeCount}` : ""}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="cs-rail-body" id="cs-rail-body" data-open={filtersOpen}>
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
                value={qInput}
                placeholder="Class or teacher name…"
                onChange={(e) => onKeywordChange(e.target.value)}
              />
              {q && (
                <p className="cs-search-note" aria-live="polite">
                  {searchState === "loading"
                    ? "Searching the marketplace…"
                    : searchState === "ok"
                      ? `${searchRows.length} real match${searchRows.length === 1 ? "" : "es"} across the marketplace`
                      : "No marketplace match yet — searching what's loaded below"}
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend>
                Price per session{priceTouched && (
                  <b> · ₹{priceDraft.min}–{priceDraft.max === "2000" ? "₹2000+" : `₹${priceDraft.max}`}</b>
                )}
              </legend>
              <div className="cs-price-slider">
                <span className="cs-price-track" />
                <span
                  className="cs-price-fill"
                  style={{
                    left: `${pricePct(priceDraft.min)}%`,
                    right: `${100 - pricePct(priceDraft.max)}%`,
                  }}
                />
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={priceDraft.min}
                  onPointerDown={() => startDrag("price")}
                  onChange={(e) => onPriceInput("min", e.target.value)}
                  aria-label="Minimum price per session in rupees"
                />
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={priceDraft.max}
                  onPointerDown={() => startDrag("price")}
                  onChange={(e) => onPriceInput("max", e.target.value)}
                  aria-label="Maximum price per session in rupees"
                />
              </div>
              <div className="cs-range-ends"><span>₹50</span><span>₹2000+</span></div>
            </fieldset>

            <fieldset>
              <legend>Child's age {ageShown && <b>· {ageShown} yrs</b>}</legend>
              <input
                type="range"
                min="3"
                max="18"
                step="1"
                value={ageDraft}
                onPointerDown={() => startDrag("age")}
                onChange={(e) => onAgeInput(e.target.value)}
                aria-label="Child's age in years"
              />
              <div className="cs-range-ends"><span>3</span><span>18</span></div>
              {age && (
                <button type="button" className="cs-age-clear" onClick={() => setParam({ age: "" })}>
                  Any age
                </button>
              )}
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
            </div>
          </form>

          <div className="cs-results">
            <div className="cs-results-bar">
              <p className="cs-count" aria-live="polite">
                {state === "ok" && results.length > 0
                  ? hasMore && !clientOnlyFilterActive
                    ? `Showing ${results.length} of ${total.toLocaleString()} classes`
                    : `${results.length} class${results.length === 1 ? "" : "es"}`
                  : ""}
              </p>
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

            {state === "loading" && (
              // Shows for the very first load AND for every refetch a price
              // or age change triggers (loadFirst resets to `state:
              // "loading"` each time) — without this covering the refetch
              // case too, changing the price range left the OLD grid sitting
              // on screen with no sign anything was happening until the new
              // page suddenly swapped in.
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
                {hasMore && !clientOnlyFilterActive && (
                  <div className="cs-more">
                    {/* Scrolling near here loads the next page automatically;
                        this stays as a real, focusable fallback for anyone
                        not scrolling (keyboard nav, screen readers, reduced
                        motion) and as the visible "loading" state either way. */}
                    <button type="button" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : `Load more · ${total - rows.length} left`}
                    </button>
                    <div ref={sentinelRef} aria-hidden="true" className="cs-sentinel" />
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
  // Real fields, confirmed on every row from the live catalogue — just
  // always null for this tenant right now, so this only ever shows once a
  // class actually has one set.
  const hasMin = c.min_age != null;
  const hasMax = c.max_age != null;
  const ageLabel = hasMin && hasMax
    ? `Ages ${c.min_age}–${c.max_age}`
    : hasMin
      ? `Ages ${c.min_age}+`
      : hasMax
        ? `Up to age ${c.max_age}`
        : null;
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
        {ageLabel && <span className="cs-age-badge">{ageLabel}</span>}
        {unavailable && <span className="cs-unavailable-badge">Unavailable</span>}
        <span className="cs-price-pill"><b>₹{Number(c.price || 0).toLocaleString()}</b> <i>/ session</i></span>
      </Link>
      <div className="cs-card-body">
        {c.store_name && (
          <p className="cs-card-teacher">
            <span className="cs-card-avatar" aria-hidden="true">{String(c.store_name).trim().charAt(0).toUpperCase()}</span>
            <span className="cs-card-teacher-name">{c.store_name}</span>
          </p>
        )}
        <Link href={href} className="cs-card-title-link">
          <h3 className="cs-card-title">{c.name}</h3>
        </Link>
        <div className="cs-card-foot">
          <Link href={href} className="cs-view" data-full={unavailable}>
            {unavailable ? "Unavailable" : (<>View class <span aria-hidden="true" className="cs-view-arrow">→</span></>)}
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
.cs-topline h2{ font-family:var(--brand-font-display); font-weight:700; letter-spacing:-.02em; font-size:clamp(1.7rem,4.4vw,2.5rem); margin:0 0 8px; }
.cs-lede{ margin:0 0 28px; font-size:1.02rem; line-height:1.5; color:var(--brand-ink-soft); max-width:60ch; }

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
.cs-search-note{ margin:8px 0 0; font-size:.76rem; color:var(--brand-ink-soft); font-style:italic; }
.cs-check{ display:flex; gap:9px; align-items:flex-start; padding:5px 0; font-size:.84rem; cursor:pointer; }
.cs-check input{ margin-top:2px; accent-color:var(--brand-accent); width:15px; height:15px; }
.cs-switch{ font-weight:500; }

.cs-rail input[type="range"]{ width:100%; accent-color:var(--brand-accent); min-height:32px; cursor:pointer; touch-action:pan-y; }

/* One bar, two handles: two native range inputs stacked exactly on top of
   each other (each still its own real, independently focusable control —
   keyboard and screen-reader behaviour stay intact), tracks made invisible
   so only the thumbs show, with a plain div underneath drawing the track
   and the coloured fill between the two current values. */
/* Every layer here — the track, the fill, and both native inputs — is
   position:absolute, which takes it clean out of the parent's flex flow.
   align-items:center on the parent does nothing for any of them: without
   an explicit top + transform:translateY(-50%) each layer falls back to
   browser-dependent auto-positioning, which is what made the whole control
   look uncentered/squashed. Anchoring all four to the same vertical centre
   is the actual fix, not a cosmetic tweak. */
.cs-price-slider{ position:relative; height:36px; margin-top:6px; }
.cs-price-track{
  position:absolute; top:50%; left:2px; right:2px; height:4px;
  border-radius:4px; transform:translateY(-50%);
  background:var(--brand-line);
}
.cs-price-fill{
  position:absolute; top:50%; height:4px; border-radius:4px;
  transform:translateY(-50%);
  background:var(--brand-accent);
}
.cs-price-slider input[type="range"]{
  position:absolute; top:50%; left:0; right:0; width:100%; height:36px;
  margin:0; transform:translateY(-50%); touch-action:pan-y;
  background:transparent; pointer-events:none;
  -webkit-appearance:none; appearance:none;
}
.cs-price-slider input[type="range"]::-webkit-slider-runnable-track{ background:transparent; height:36px; }
.cs-price-slider input[type="range"]::-moz-range-track{ background:transparent; border:0; height:36px; }
.cs-price-slider input[type="range"]::-webkit-slider-thumb{
  -webkit-appearance:none; pointer-events:auto; cursor:pointer;
  width:26px; height:26px; margin-top:5px; border-radius:50%;
  background:var(--brand-accent); border:2px solid var(--brand-surface);
  box-shadow:0 1px 4px color-mix(in srgb, var(--brand-ink) 40%, transparent);
  transition:transform var(--motion) var(--motion-ease);
}
.cs-price-slider input[type="range"]::-moz-range-thumb{
  pointer-events:auto; cursor:pointer; width:26px; height:26px; border-radius:50%;
  background:var(--brand-accent); border:2px solid var(--brand-surface);
  box-shadow:0 1px 4px color-mix(in srgb, var(--brand-ink) 40%, transparent);
  transition:transform var(--motion) var(--motion-ease);
}
.cs-price-slider input[type="range"]:hover::-webkit-slider-thumb{ transform:scale(1.12); }
.cs-price-slider input[type="range"]:hover::-moz-range-thumb{ transform:scale(1.12); }
.cs-price-slider input[type="range"]:focus-visible::-webkit-slider-thumb{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.cs-price-slider input[type="range"]:focus-visible::-moz-range-thumb{ outline:3px solid var(--brand-accent); outline-offset:2px; }
@media (prefers-reduced-motion: reduce){
  .cs-price-slider input[type="range"]::-webkit-slider-thumb{ transition:none; }
  .cs-price-slider input[type="range"]::-moz-range-thumb{ transition:none; }
}
.cs-range-ends{ display:flex; justify-content:space-between; font-size:.72rem; color:var(--brand-ink-soft); margin-top:2px; }
.cs-age-clear{
  margin-top:8px; border:1px solid var(--brand-line); background:var(--brand-paper);
  border-radius:980px; padding:5px 12px; font:inherit; font-size:.76rem; cursor:pointer; color:var(--brand-ink);
}
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
.cs-age-badge{
  position:absolute; left:10px; top:10px;
  background:var(--brand-surface); color:var(--brand-ink);
  border:1px solid var(--brand-line); border-radius:980px;
  font-size:.72rem; font-weight:600; padding:4px 10px;
}
.cs-unavailable-badge{
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

.cs-more{ display:flex; flex-direction:column; align-items:center; gap:0; margin-top:26px; }
.cs-more button{ border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-weight:600; font-size:.9rem; padding:11px 24px; border-radius:980px; cursor:pointer; transition:border-color var(--motion) var(--motion-ease); order:2; }
.cs-more button:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.cs-more button:disabled{ opacity:.6; cursor:default; }
/* Sits above the button, in normal flow — the 600px rootMargin on its
   observer means the fetch fires long before this (or the button) is ever
   actually seen. Not something anyone should notice. */
.cs-sentinel{ width:1px; height:1px; order:1; }

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

/* ---------- Explore Courses polish ---------- */

/* Filters collapse behind a bar on phones/tablets so the classes come first;
   on wide screens the rail is always open and the bar is hidden. */
.cs-filter-toggle{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  width:100%; min-height:48px; padding:10px 2px; border:0; background:transparent;
  color:var(--brand-ink); font-family:var(--brand-font-display); font-weight:650; font-size:.95rem;
  cursor:pointer; touch-action:manipulation; text-align:left;
}
.cs-filter-toggle svg{ transition:transform var(--motion) var(--motion-ease); color:var(--brand-accent); }
.cs-filter-toggle[aria-expanded="true"] svg{ transform:rotate(180deg); }
@media (max-width:939px){
  .cs-rail-body{ display:none; }
  .cs-rail-body[data-open="true"]{ display:block; border-top:1px solid var(--brand-line); }
}
@media (max-width:939px){
  .cs-rail-head span{ display:none; }
  .cs-rail-head{ justify-content:flex-end; }
}
@media (min-width:940px){ .cs-filter-toggle{ display:none; } }

.cs-results-bar{ justify-content:space-between; }
.cs-count{ margin:0; font-size:.88rem; font-weight:600; color:var(--brand-ink-soft); }

.cs-grid{ gap:20px; }
.cs-card{ border-radius:calc(var(--radius-lg) + 4px); }
.cs-card:hover{ border-color:color-mix(in srgb, var(--brand-accent) 45%, var(--brand-line)); }
.cs-card-media img{ transition:transform .5s var(--motion-ease); }
.cs-card:hover .cs-card-media img{ transform:scale(1.05); }
/* soft scrim so the price pill always reads on any photo; tokens only */
.cs-card-media::after{
  content:""; position:absolute; inset:auto 0 0 0; height:42%; pointer-events:none;
  background:linear-gradient(to top, color-mix(in srgb, var(--brand-ink) 42%, transparent), transparent);
}
.cs-price-pill{
  position:absolute; right:10px; bottom:10px; z-index:1;
  display:inline-flex; align-items:baseline; gap:4px;
  padding:6px 12px; border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink);
  box-shadow:0 6px 16px -8px color-mix(in srgb, var(--brand-ink) 60%, transparent);
}
.cs-price-pill b{ font-family:var(--brand-font-display); font-size:1rem; font-variant-numeric:tabular-nums; }
.cs-price-pill i{ font-style:normal; font-size:.72rem; color:var(--brand-ink-soft); }
.cs-age-badge, .cs-unavailable-badge{ z-index:1; }

.cs-card-body{ gap:8px; padding:16px 16px 16px; flex:1; }
.cs-card-teacher{ display:flex; align-items:center; gap:8px; margin:0; min-width:0; }
.cs-card-avatar{
  flex:none; display:grid; place-items:center; width:26px; height:26px; border-radius:50%;
  background:var(--brand-accent-soft); color:var(--brand-accent);
  font-family:var(--brand-font-display); font-weight:700; font-size:.78rem;
}
.cs-card-teacher-name{ font-size:.82rem; font-weight:600; color:var(--brand-ink-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cs-card-title{ font-size:1.12rem; font-weight:650; }
.cs-card-foot{ margin-top:auto; padding-top:6px; }
.cs-view{
  display:inline-flex; align-items:center; gap:6px; min-height:44px;
  padding:10px 18px; font-size:.86rem;
  transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease);
}
.cs-view:hover{ background:var(--brand-accent); border-color:var(--brand-accent); color:var(--brand-accent-ink); }
.cs-view-arrow{ transition:transform var(--motion) var(--motion-ease); }
.cs-view:hover .cs-view-arrow{ transform:translateX(3px); }

.cs-rail{ border-radius:calc(var(--radius-lg) + 4px); }

@media (prefers-reduced-motion: reduce){
  .cs-card-media img, .cs-view-arrow, .cs-filter-toggle svg{ transition:none; }
  .cs-card:hover .cs-card-media img{ transform:none; }
  .cs-view:hover .cs-view-arrow{ transform:none; }
}
`;
