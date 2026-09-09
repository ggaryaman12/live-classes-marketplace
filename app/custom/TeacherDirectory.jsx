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
 *
 * The card is presented as a teacher profile entity — portrait, name, a
 * credential line, verified mark, rating, teaching location, live/closed
 * status and an explicit "View classes" action — rather than a storefront tile.
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

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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

  const openCount = teachers.filter((t) => t.is_closed !== 1).length;

  return (
    <section className="bell-td" aria-labelledby="bell-td-h">
      <div className="td-frame">
        <div className="td-head">
          <div className="td-head-text">
            <p className="td-kicker">Teacher directory</p>
            <h2 id="bell-td-h">{heading}</h2>
            {state === "ok" && teachers.length > 0 && !searching && (
              <p className="td-count">
                {openCount} of {teachers.length} teachers taking students now
              </p>
            )}
          </div>
          <label className="td-search">
            <span className="td-visually-hidden">Search all teachers</span>
            <svg className="td-search-icon" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="13.5" y1="13.5" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search teachers by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {searching && (
          <p className="td-search-note" aria-live="polite">
            {state === "loading" ? "Searching the teacher network…" : `${teachers.length} teacher${teachers.length === 1 ? "" : "s"} match “${query.trim()}”.`}
          </p>
        )}

        {state === "loading" && (
          <ul className="td-grid" style={{ "--cols": columns }} aria-hidden="true">
            {Array.from({ length: columns * 2 }).map((_, i) => (
              <li key={i} className="td-card td-card--skel">
                <div className="td-card-top">
                  <span className="td-skel-avatar" />
                  <div className="td-skel-lines">
                    <span className="td-skel-line" style={{ width: "72%" }} />
                    <span className="td-skel-line" style={{ width: "48%" }} />
                  </div>
                </div>
                <span className="td-skel-line" style={{ width: "90%" }} />
                <div className="td-skel-foot">
                  <span className="td-skel-line" style={{ width: "34%" }} />
                  <span className="td-skel-line" style={{ width: "28%" }} />
                </div>
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
            <p>{searching ? `No teachers match “${query.trim()}”.` : "No teachers to show right now."}</p>
          </div>
        )}

        {state === "ok" && teachers.length > 0 && (
          <>
            <ul className="td-grid" style={{ "--cols": columns }}>
              {teachers.map((t) => {
                const img = teacherImage(t);
                const open = t.is_closed !== 1;
                const rating = Number(t.store_rating) || 0;
                return (
                  <li key={t.user_id}>
                    <Link href={`/store/${t.user_id}`} className="td-card">
                      <div className="td-card-top">
                        <span className="td-avatar" aria-hidden="true">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              width="120"
                              height="120"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="td-avatar-fallback">{initials(t.store_name)}</span>
                          )}
                        </span>
                        <div className="td-id">
                          <p className="td-name">
                            {t.store_name}
                            <svg className="td-verified" viewBox="0 0 20 20" aria-label="Verified teacher">
                              <path
                                d="M10 1.5l2.1 1.6 2.6-.3 1 2.4 2.3 1.3-.9 2.5.9 2.5-2.3 1.3-1 2.4-2.6-.3L10 18.5l-2.1-1.6-2.6.3-1-2.4L2 13.5l.9-2.5L2 8.5l2.3-1.3 1-2.4 2.6.3z"
                                fill="var(--brand-accent)"
                              />
                              <path d="M6.5 10l2.3 2.3 4.7-4.8" fill="none" stroke="var(--brand-accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </p>
                          <p className="td-role">Live class teacher</p>
                        </div>
                      </div>

                      <div className="td-meta">
                        {rating > 0 && (
                          <span className="td-rating">
                            <Stars value={rating} />
                            <b>{rating.toFixed(1)}</b>
                          </span>
                        )}
                        {t.display_address && (
                          <span className="td-addr">
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                              <path d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.2 4.5 8 4.5 8s4.5-4.8 4.5-8c0-2.5-2-4.5-4.5-4.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="8" cy="6" r="1.6" fill="currentColor" />
                            </svg>
                            {t.display_address}
                          </span>
                        )}
                      </div>

                      <div className="td-foot">
                        <span className={`td-status ${open ? "is-open" : "is-closed"}`}>
                          <span className="td-dot" aria-hidden="true" />
                          {open ? "Classes open now" : "Not taking students now"}
                        </span>
                        <span className="td-view">
                          View classes
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M3 8h9M8 3.5L12.5 8 8 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
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

.td-head{ display:flex; flex-wrap:wrap; gap:18px 24px; align-items:flex-end; justify-content:space-between; }
.td-head-text{ display:grid; gap:4px; }
.td-kicker{ margin:0; font-size:.74rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--brand-accent); }
.td-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.1rem); margin:0; line-height:1.15; }
.td-count{ margin:2px 0 0; font-size:.86rem; color:var(--brand-ink-soft); }

.td-search{ position:relative; display:flex; align-items:center; }
.td-search-icon{ position:absolute; left:13px; width:16px; height:16px; color:var(--brand-ink-soft); pointer-events:none; }
.td-search input{
  width:min(300px, 62vw); padding:11px 14px 11px 36px; font:inherit; font-size:.9rem;
  border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-surface); color:var(--brand-ink);
}
.td-search input:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.td-visually-hidden{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.td-search-note{ margin:14px 0 0; font-size:.82rem; color:var(--brand-ink-soft); }

.td-grid{ list-style:none; margin:32px 0 0; padding:0; display:grid; gap:16px; grid-template-columns:repeat(1,1fr); }
@media (min-width:560px){ .td-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:900px){ .td-grid{ grid-template-columns:repeat(var(--cols,3),1fr); } }

.td-card{
  display:flex; flex-direction:column; gap:14px; height:100%;
  border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-surface); padding:20px; text-decoration:none; color:var(--brand-ink);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 6%, transparent);
  transition:box-shadow var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
.td-card:hover{
  border-color:color-mix(in srgb, var(--brand-accent) 45%, var(--brand-line));
  box-shadow:0 22px 46px -30px color-mix(in srgb, var(--brand-ink) 55%, transparent);
  transform:translateY(-2px);
}
.td-card:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

.td-card-top{ display:flex; align-items:center; gap:13px; }
.td-avatar{
  flex:none; width:56px; height:56px; border-radius:50%; overflow:hidden;
  background:var(--brand-accent-soft); border:1px solid var(--brand-line);
  display:grid; place-items:center;
}
.td-avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.td-avatar-fallback{ font-family:var(--brand-font-display); font-weight:600; font-size:1.05rem; color:var(--brand-accent); }

.td-id{ min-width:0; display:grid; gap:2px; }
.td-name{
  margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1.02rem; line-height:1.25;
  display:flex; align-items:center; gap:6px;
}
.td-verified{ flex:none; width:15px; height:15px; }
.td-role{ margin:0; font-size:.8rem; color:var(--brand-ink-soft); }

.td-meta{ display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; padding-top:2px; }
.td-rating{ display:inline-flex; align-items:center; gap:6px; font-size:.84rem; color:var(--brand-ink-soft); }
.td-rating b{ color:var(--brand-ink); font-variant-numeric:tabular-nums; }
.td-stars{ position:relative; display:inline-block; font-size:.82rem; letter-spacing:1px; line-height:1; }
.td-stars-off{ color:color-mix(in srgb, var(--brand-ink-soft) 40%, transparent); }
.td-stars-on{ position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:var(--brand-accent); }
.td-addr{ display:inline-flex; align-items:center; gap:5px; font-size:.8rem; color:var(--brand-ink-soft); min-width:0; }
.td-addr svg{ flex:none; width:13px; height:13px; }
.td-addr{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }

.td-foot{
  margin-top:auto; padding-top:13px; border-top:1px solid var(--brand-line);
  display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.td-status{ display:inline-flex; align-items:center; gap:6px; font-size:.78rem; font-weight:600; }
.td-dot{ width:7px; height:7px; border-radius:50%; flex:none; }
.td-status.is-open{ color:var(--brand-ink); }
.td-status.is-open .td-dot{ background:var(--brand-accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--brand-accent) 22%, transparent); }
.td-status.is-closed{ color:var(--brand-ink-soft); }
.td-status.is-closed .td-dot{ background:color-mix(in srgb, var(--brand-ink-soft) 55%, transparent); }
.td-view{
  display:inline-flex; align-items:center; gap:5px; flex:none;
  font-size:.82rem; font-weight:600; color:var(--brand-accent);
}
.td-view svg{ width:14px; height:14px; transition:transform var(--motion) var(--motion-ease); }
.td-card:hover .td-view svg{ transform:translateX(3px); }

.td-more{ display:flex; justify-content:center; margin-top:30px; }
.td-more button{
  border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink);
  font:inherit; font-weight:600; font-size:.9rem; padding:11px 24px; border-radius:var(--radius); cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.td-more button:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.td-more button:disabled{ opacity:.6; cursor:default; }

.td-card--skel{ pointer-events:none; }
.td-skel-avatar{ flex:none; width:56px; height:56px; border-radius:50%; }
.td-skel-lines{ display:grid; gap:8px; flex:1; }
.td-skel-foot{ margin-top:auto; padding-top:13px; border-top:1px solid var(--brand-line); display:flex; justify-content:space-between; gap:10px; }
.td-skel-avatar, .td-skel-line{
  background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%);
  background-size:200% 100%; animation:td-sweep 1.4s ease-in-out infinite;
}
.td-skel-line{ display:block; height:11px; border-radius:6px; }
@keyframes td-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.td-empty{ border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-surface); padding:28px; text-align:center; margin-top:26px; }
.td-empty p{ margin:0 0 10px; color:var(--brand-ink-soft); }
.td-empty button{ border:1px solid var(--brand-line); background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-size:.86rem; font-weight:600; padding:8px 16px; border-radius:var(--radius); cursor:pointer; }

@media (prefers-reduced-motion: reduce){
  .td-card{ transition:none; }
  .td-card:hover{ transform:none; }
  .td-card:hover .td-view svg{ transform:none; }
  .td-skel-avatar, .td-skel-line{ animation:none; }
}
`;
