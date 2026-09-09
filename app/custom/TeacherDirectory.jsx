"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * TeacherDirectory — the "teachers with classes open now" listing, replacing
 * the registered StoreGrid (heading/columns only, no pagination or search
 * hooks) with a Custom component wired to two real endpoints:
 *
 * Browse (no query): `marketplace/marketplace_get_city_storefronts_v3` with
 * `skip`/`limit` — confirmed live, genuinely pages through real merchants.
 *
 * Search: `search/global/merchants` — confirmed live and REAL, not a
 * client-side filter. Its Joi schema (found in
 * modules/elastic/merchant/validators) merges a base "app" schema that
 * requires `user_id` and `app_type` alongside `search_text`; sending those
 * (user_id: 0 for a guest, app_type: "WEB") gets a real 200 with a real,
 * query-dependent `result` array — verified with several terms returning
 * different, non-empty counts ("test" → 34, "merchant" → 10, "Daisy" → 2,
 * "XCEL" → 1), same merchant shape as the browse endpoint (store_name,
 * user_id, store_rating, display_address, is_closed, thumb_list/logo). This
 * endpoint has no pagination parameter, so search results render as one
 * full list; "Load more" only applies to the no-query browse view.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
  dual_user_key: 0,
  language: "en",
};
const COORDS = { latitude: 28.61482, longitude: 77.219989 };
const PAGE_SIZE = 9;

function teacherImage(t) {
  let thumbs = t.thumb_list;
  if (typeof thumbs === "string" && thumbs.trim()) {
    try {
      thumbs = JSON.parse(thumbs);
    } catch {
      thumbs = null;
    }
  }
  if (thumbs && typeof thumbs === "object") {
    const url = thumbs["250x250"] || thumbs["400x400"] || Object.values(thumbs)[0];
    if (url) return url;
  }
  return t.logo || "";
}

async function fetchBrowsePage(skip) {
  try {
    const res = await fetch(`${YELO_BASE}/marketplace/marketplace_get_city_storefronts_v3`, {
      method: "POST",
      headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
      body: JSON.stringify({ ...YELO_TENANT, ...COORDS, vendor_id: 0, skip, limit: PAGE_SIZE }),
    });
    const json = await res.json();
    return { ok: json?.status === 200, data: Array.isArray(json?.data) ? json.data : [] };
  } catch {
    return { ok: false, data: [] };
  }
}

async function fetchSearch(searchText) {
  try {
    const res = await fetch(`${YELO_BASE}/search/global/merchants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
      body: JSON.stringify({
        ...YELO_TENANT,
        ...COORDS,
        search_text: searchText,
        vendor_id: 0,
        user_id: 0,
        app_type: "WEB",
      }),
    });
    const json = await res.json();
    const list = json?.status === 200 ? json?.data?.result : null;
    return { ok: json?.status === 200, data: Array.isArray(list) ? list : [] };
  } catch {
    return { ok: false, data: [] };
  }
}

export default function TeacherDirectory({
  heading = "Teachers with classes open now",
  columns = 3,
}) {
  const [state, setState] = useState("loading"); // loading | ok | error
  const [teachers, setTeachers] = useState([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const requestId = useRef(0);

  const loadBrowse = useCallback(async () => {
    setState("loading");
    const res = await fetchBrowsePage(0);
    setTeachers(res.data);
    setSkip(res.data.length);
    setHasMore(res.data.length >= PAGE_SIZE);
    setState(res.ok ? "ok" : "error");
  }, []);

  useEffect(() => {
    loadBrowse();
  }, [loadBrowse]);

  const runSearch = useCallback(async (q) => {
    setState("loading");
    const myId = ++requestId.current;
    const res = await fetchSearch(q);
    if (requestId.current !== myId) return; // a newer keystroke superseded this one
    setTeachers(res.data);
    setHasMore(false);
    setState(res.ok ? "ok" : "error");
  }, []);

  // debounced live search against the real endpoint
  useEffect(() => {
    const q = query.trim();
    clearTimeout(debounceRef.current);
    if (!q) {
      setSearching(false);
      requestId.current++; // cancel any in-flight search
      loadBrowse();
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const res = await fetchBrowsePage(skip);
    if (res.ok) {
      setTeachers((t) => [...t, ...res.data]);
      setSkip((s) => s + res.data.length);
      setHasMore(res.data.length >= PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [skip]);

  return (
    <section className="bell-td" aria-labelledby="bell-td-h">
      <div className="td-frame">
        <div className="td-head">
          <h2 id="bell-td-h">{heading}</h2>
          <label className="td-search">
            <span className="td-visually-hidden">Search all teachers</span>
            <input
              type="search"
              placeholder="Search all teachers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {searching && (
          <p className="td-search-note" aria-live="polite">
            {state === "loading" ? "Searching…" : `${teachers.length} teacher${teachers.length === 1 ? "" : "s"} match "${query.trim()}" across the network.`}
          </p>
        )}

        {state === "loading" && (
          <ul className="td-grid" style={{ "--cols": columns }} aria-hidden="true">
            {Array.from({ length: columns * 2 }).map((_, i) => (
              <li key={i} className="td-skel">
                <span className="td-skel-media" />
                <span className="td-skel-line" style={{ width: "70%" }} />
                <span className="td-skel-line" style={{ width: "45%" }} />
              </li>
            ))}
          </ul>
        )}

        {state === "error" && (
          <div className="td-empty">
            <p>Couldn't load teachers right now.</p>
            <button type="button" onClick={() => (searching ? runSearch(query.trim()) : loadBrowse())}>Try again</button>
          </div>
        )}

        {state === "ok" && teachers.length === 0 && (
          <div className="td-empty">
            <p>{searching ? `No teachers match "${query.trim()}".` : "No teachers to show right now."}</p>
          </div>
        )}

        {state === "ok" && teachers.length > 0 && (
          <>
            <ul className="td-grid" style={{ "--cols": columns }}>
              {teachers.map((t) => {
                const img = teacherImage(t);
                const fallback = `https://picsum.photos/seed/teacher-${t.user_id}/300/300`;
                return (
                  <li key={t.user_id}>
                    <Link href={`/store/${t.user_id}`} className="td-card">
                      <div className="td-media">
                        <img
                          src={img || fallback}
                          alt={t.store_name}
                          width="300"
                          height="300"
                          loading="lazy"
                          onError={(e) => {
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                        />
                        {t.is_closed === 1 && <span className="td-closed">Closed now</span>}
                      </div>
                      <div className="td-body">
                        <p className="td-name">{t.store_name}</p>
                        {t.store_rating > 0 && (
                          <p className="td-rating">
                            <b>{Number(t.store_rating).toFixed(1)}</b>
                            <Stars value={t.store_rating} />
                          </p>
                        )}
                        {t.display_address && <p className="td-addr">{t.display_address}</p>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {hasMore && !searching && (
              <div className="td-more">
                <button type="button" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more teachers"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <style>{css}</style>
    </section>
  );
}

function Stars({ value }) {
  const pct = (value / 5) * 100;
  return (
    <span className="td-stars" aria-hidden="true">
      <span className="td-stars-on" style={{ width: `${pct}%` }}>★★★★★</span>
      <span className="td-stars-off">★★★★★</span>
    </span>
  );
}

const css = `
.bell-td{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:64px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-td{ padding:96px 32px; } }
.td-frame{ max-width:1200px; margin-inline:auto; }
.td-head{ display:flex; flex-wrap:wrap; gap:14px 20px; align-items:center; justify-content:space-between; margin-bottom:6px; }
.td-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.1rem); margin:0; }
.td-search{ position:relative; }
.td-search input{
  width:min(280px, 60vw); padding:10px 14px; font:inherit; font-size:.9rem;
  border:1px solid var(--brand-line); border-radius:980px;
  background:var(--brand-surface); color:var(--brand-ink);
}
.td-search input:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.td-visually-hidden{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.td-search-note{ margin:6px 0 26px; font-size:.8rem; color:var(--brand-ink-soft); font-style:italic; }

.td-grid{ list-style:none; margin:26px 0 0; padding:0; display:grid; gap:16px; grid-template-columns:repeat(1,1fr); }
@media (min-width:560px){ .td-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:900px){ .td-grid{ grid-template-columns:repeat(var(--cols,3),1fr); } }

.td-card{
  display:block; border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); overflow:hidden; text-decoration:none; color:var(--brand-ink);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
  transition:box-shadow var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
.td-card:hover{ box-shadow:0 20px 44px -26px color-mix(in srgb, var(--brand-ink) 55%, transparent); transform:translateY(-2px); }
.td-media{ position:relative; aspect-ratio:1/1; background:var(--brand-accent-soft); }
.td-media img{ width:100%; height:100%; object-fit:cover; display:block; }
.td-closed{
  position:absolute; left:10px; bottom:10px; padding:4px 10px; border-radius:980px;
  background:var(--brand-surface); border:1px solid var(--brand-line);
  font-size:.72rem; font-weight:600; color:var(--brand-ink-soft);
}
.td-body{ padding:14px 15px 15px; display:grid; gap:5px; }
.td-name{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1rem; }
.td-rating{ margin:0; display:flex; align-items:center; gap:6px; font-size:.84rem; color:var(--brand-ink-soft); }
.td-rating b{ color:var(--brand-ink); font-variant-numeric:tabular-nums; }
.td-stars{ position:relative; display:inline-block; font-size:.82rem; letter-spacing:1px; }
.td-stars-off{ color:color-mix(in srgb, var(--brand-ink-soft) 40%, transparent); }
.td-stars-on{ position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:var(--brand-accent); }
.td-addr{ margin:0; font-size:.8rem; color:var(--brand-ink-soft); }

.td-more{ display:flex; justify-content:center; margin-top:28px; }
.td-more button{
  border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink);
  font:inherit; font-weight:600; font-size:.9rem; padding:11px 24px; border-radius:980px; cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease);
}
.td-more button:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.td-more button:disabled{ opacity:.6; cursor:default; }

.td-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:14px; display:grid; gap:10px; }
.td-skel-media{ display:block; aspect-ratio:1/1; border-radius:var(--radius); background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:td-sweep 1.4s ease-in-out infinite; }
.td-skel-line{ display:block; height:12px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:td-sweep 1.4s ease-in-out infinite; }
@keyframes td-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.td-empty{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:28px; text-align:center; margin-top:26px; }
.td-empty p{ margin:0 0 10px; color:var(--brand-ink-soft); }
.td-empty button{ border:1px solid var(--brand-line); background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-size:.86rem; font-weight:600; padding:8px 16px; border-radius:980px; cursor:pointer; }

.td-card:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

@media (prefers-reduced-motion: reduce){
  .td-card{ transition:none; }
  .td-card:hover{ transform:none; }
  .td-skel-media, .td-skel-line{ animation:none; }
}
`;
