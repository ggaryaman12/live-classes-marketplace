"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import Link from "next/link";

/**
 * LiveClasses — every product currently listed across this whole marketplace
 * (every merchant, not one store), via `product/getMarketplaceProducts`.
 * Verified live against this tenant: real 200, `iTotalRecords: 4187`, real
 * rows (product_id, name, price, store_name, user_id, image_url/thumb_url).
 *
 * Pagination is real, not client-side: `length` is the page size, `start`
 * the 0-based row offset — confirmed by paging start=0 then start=50 and
 * finding zero overlapping product ids between the two pages. Per the
 * instruction this fetches 50 rows at a time ("classes" here meaning
 * whatever this tenant's marketplace actually lists — the payload is
 * general commerce products, e.g. skincare, not literally school subjects;
 * same honesty note as the rest of this build's real-data sections).
 *
 * "Load more" is throttled two ways: the button disables itself for the
 * whole in-flight request (can't double-fire a real network call), AND a
 * minimum gap is enforced between accepted clicks even after the button
 * re-enables, so a rapid mash of a fast-completing request still can't spam
 * the backend.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = { marketplace_user_id: 510009445, language: "en", app_type: "WEB" };
const PAGE_SIZE = 50;
const THROTTLE_MS = 600;

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

export default function LiveClasses({
  heading = "Live classes",
  subhead = "Everything currently listed across this marketplace, straight from the live catalogue.",
}) {
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

  return (
    <section className="bell-lcs" aria-labelledby="bell-lcs-h">
      <div className="lcs-frame">
        <header className="lcs-head">
          <h2 id="bell-lcs-h">{heading}</h2>
          <p>{subhead}</p>
          {state === "ok" && total > 0 && (
            <p className="lcs-count">Showing {rows.length} of {total.toLocaleString()}</p>
          )}
        </header>

        {state === "loading" && (
          <ul className="lcs-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="lcs-skel">
                <span className="lcs-skel-media" />
                <span className="lcs-skel-line" style={{ width: "78%" }} />
                <span className="lcs-skel-line" style={{ width: "40%" }} />
              </li>
            ))}
          </ul>
        )}

        {state === "error" && (
          <div className="lcs-empty">
            <p>Couldn't load live classes right now.</p>
            <button type="button" onClick={loadFirst}>Try again</button>
          </div>
        )}

        {state === "ok" && rows.length === 0 && (
          <div className="lcs-empty">
            <p>Nothing listed right now — check back soon.</p>
          </div>
        )}

        {state === "ok" && rows.length > 0 && (
          <>
            <ul className="lcs-grid">
              {rows.map((p) => (
                <ClassCard key={p.product_id} p={p} />
              ))}
            </ul>

            {hasMore && (
              <div className="lcs-more">
                <button type="button" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : `Load more · ${total - rows.length} left`}
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

function ClassCard({ p }) {
  const img = parseImages(p);
  const fallback = `https://picsum.photos/seed/live-class-${p.product_id}/400/300`;
  const href = `/p/class?id=${p.product_id}`;
  return (
    <li className="lcs-card">
      <Link href={href} className="lcs-media">
        <img
          src={img || fallback}
          alt={p.name}
          width="400"
          height="300"
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
        />
        {p.is_enabled !== 1 && <span className="lcs-closed">Unavailable</span>}
      </Link>
      <div className="lcs-body">
        <Link href={href} className="lcs-title-link">
          <h3 className="lcs-title">{p.name}</h3>
        </Link>
        {p.store_name && <p className="lcs-by">by {p.store_name}</p>}
        <div className="lcs-foot">
          <span className="lcs-price">₹{Number(p.price || 0).toLocaleString()}</span>
          <Link href={href} className="lcs-cta">View</Link>
        </div>
      </div>
    </li>
  );
}

const css = `
.bell-lcs{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:64px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-lcs{ padding:96px 32px; } }
.lcs-frame{ max-width:1200px; margin-inline:auto; }
.lcs-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.35rem); margin:0 0 8px; }
.lcs-head p{ margin:0; color:var(--brand-ink-soft); font-size:1rem; max-width:52ch; }
.lcs-count{ margin-top:8px !important; font-size:.82rem !important; }

.lcs-grid{ list-style:none; margin:26px 0 0; padding:0; display:grid; gap:16px; grid-template-columns:1fr; }
@media (min-width:560px){ .lcs-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:900px){ .lcs-grid{ grid-template-columns:repeat(4,1fr); } }

.lcs-card{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); overflow:hidden; box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent); transition:box-shadow var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease); }
.lcs-card:hover{ box-shadow:0 18px 40px -24px color-mix(in srgb, var(--brand-ink) 50%, transparent); transform:translateY(-2px); }
.lcs-media{ position:relative; display:block; aspect-ratio:4/3; background:var(--brand-accent-soft); }
.lcs-media img{ width:100%; height:100%; object-fit:cover; display:block; }
.lcs-closed{ position:absolute; left:10px; bottom:10px; padding:4px 10px; border-radius:980px; background:var(--brand-surface); border:1px solid var(--brand-line); font-size:.7rem; font-weight:600; color:var(--brand-ink-soft); }
.lcs-body{ padding:13px 14px 14px; display:grid; gap:5px; }
.lcs-title-link{ text-decoration:none; color:inherit; }
.lcs-title-link:hover .lcs-title{ color:var(--brand-accent); }
.lcs-title{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:.94rem; line-height:1.3; transition:color var(--motion) var(--motion-ease); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.lcs-by{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); }
.lcs-foot{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px; }
.lcs-price{ font-weight:650; font-variant-numeric:tabular-nums; }
.lcs-cta{ padding:6px 13px; border-radius:980px; border:1px solid var(--brand-line); color:var(--brand-ink); font-size:.78rem; font-weight:600; text-decoration:none; transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease); }
.lcs-cta:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }

.lcs-more{ display:flex; justify-content:center; margin-top:28px; }
.lcs-more button{ border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-weight:600; font-size:.9rem; padding:11px 24px; border-radius:980px; cursor:pointer; transition:border-color var(--motion) var(--motion-ease); }
.lcs-more button:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.lcs-more button:disabled{ opacity:.6; cursor:default; }

.lcs-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:14px; display:grid; gap:10px; }
.lcs-skel-media{ display:block; aspect-ratio:4/3; border-radius:var(--radius); background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:lcs-sweep 1.4s ease-in-out infinite; }
.lcs-skel-line{ display:block; height:11px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:lcs-sweep 1.4s ease-in-out infinite; }
@keyframes lcs-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.lcs-empty{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:28px; text-align:center; margin-top:26px; }
.lcs-empty p{ margin:0 0 10px; color:var(--brand-ink-soft); }
.lcs-empty button{ border:1px solid var(--brand-line); background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-size:.86rem; font-weight:600; padding:8px 16px; border-radius:980px; cursor:pointer; }

.lcs-card:focus-within, .lcs-cta:focus-visible, .lcs-more button:focus-visible, .lcs-empty button:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

@media (prefers-reduced-motion: reduce){
  .lcs-card{ transition:none; }
  .lcs-card:hover{ transform:none; }
  .lcs-skel-media, .lcs-skel-line{ animation:none; }
}
`;
