"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * LiveCatalogue — this teacher's real classes, fetched straight from the
 * backend (`get_products_for_category`) instead of the registered Catalogue
 * node, whose data-binding was verified NOT to be surfacing real stock for
 * at least one merchant (user_id 510012595 — confirmed via direct API call:
 * status 200, 4 enabled products) even though the product is genuinely
 * there. This component calls the same real endpoint directly and renders
 * whatever comes back — real classes if there are any, an honest empty
 * state if there truly are none, never a fabricated placeholder.
 *
 * The store id is read from the URL (`/store/<id>`), matching how this page
 * is routed elsewhere in the tree.
 *
 * Self-contained on purpose: components in this workspace are built from
 * `tenant-demo/app/custom/<Name>.jsx` individually, so a relative import to
 * a sibling `lib/` folder in this workspace does not resolve there. No
 * cross-file imports beyond `react` and `next/*`.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
  dual_user_key: 0,
  language: "en",
};

async function getProductsForCategory({ userId, page = 1, offset = 0, limit = 25 }) {
  try {
    const res = await fetch(`${YELO_BASE}/get_products_for_category`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        base_version: "1.0.0",
        device_type: "WEB",
      },
      body: JSON.stringify({
        ...YELO_TENANT,
        user_id: userId,
        page_no: page,
        offset,
        limit,
      }),
    });
    const json = await res.json();
    return { ok: json?.status === 200, data: json?.data };
  } catch (err) {
    return { ok: false, data: null };
  }
}

function currentStoreId() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/store\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function formatPrice(p) {
  const layoutPrice = p?.layout_data?.lines?.[2]?.data;
  if (typeof layoutPrice === "string" && layoutPrice.trim()) return layoutPrice;
  const n = Number(p?.price ?? 0);
  return `₹${n.toLocaleString()}`;
}

export default function LiveCatalogue({
  heading = "Classes with this teacher",
  userId = null,
}) {
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const storeId = userId || currentStoreId();

    async function load() {
      if (!storeId) {
        if (!cancelled) setState("error");
        return;
      }
      setState("loading");
      const res = await getProductsForCategory({ userId: storeId });
      if (cancelled) return;
      if (!res.ok) {
        setState("error");
        return;
      }
      const live = (Array.isArray(res.data) ? res.data : []).filter(
        (p) => p.is_enabled === 1 && p.is_deleted !== 1
      );
      setProducts(live);
      setState(live.length ? "ok" : "empty");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className="bell-lc" aria-labelledby="bell-lc-h">
      <div className="lc-frame">
        <h2 id="bell-lc-h">{heading}</h2>

        {state === "loading" && (
          <ul className="lc-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="lc-skel">
                <span className="lc-skel-media" />
                <span className="lc-skel-line" style={{ width: "70%" }} />
                <span className="lc-skel-line" style={{ width: "35%" }} />
              </li>
            ))}
          </ul>
        )}

        {state === "error" && (
          <div className="lc-empty">
            <p>Couldn't load this teacher's classes right now.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}

        {state === "empty" && (
          <div className="lc-empty">
            <p>No classes listed yet — check back soon.</p>
          </div>
        )}

        {state === "ok" && (
          <ul className="lc-grid">
            {products.map((p) => {
              const term = encodeURIComponent(`${p.name}, kids class`);
              const src = p.image_url || `https://source.unsplash.com/480x360/?${term}`;
              const fallback = `https://picsum.photos/seed/product-${p.product_id}/480/360`;
              const detailHref = `/p/class?id=${p.product_id}`;
              return (
                <li key={p.product_id} className="lc-card">
                  <Link href={detailHref} className="lc-media">
                    <img
                      src={src}
                      alt={p.name}
                      width="480"
                      height="360"
                      loading="lazy"
                      onError={(e) => {
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                      }}
                    />
                  </Link>
                  <div className="lc-body">
                    <Link href={detailHref} className="lc-title-link">
                      <h3 className="lc-title">{p.name}</h3>
                    </Link>
                    {p.is_recurring_enabled === 1 && (
                      <span className="lc-sub-badge">↻ Subscription available</span>
                    )}
                    {p.description && <p className="lc-desc">{p.description}</p>}
                    <div className="lc-foot">
                      <span className="lc-price">{formatPrice(p)}</span>
                      <Link href={detailHref} className="lc-cta">
                        View class
                      </Link>
                    </div>
                  </div>
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

const css = `
.bell-lc{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-lc{ padding:80px 32px; } }
.lc-frame{ max-width:1100px; margin-inline:auto; }
.lc-frame > h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0 0 22px; }

.lc-grid{ list-style:none; margin:0; padding:0; display:grid; gap:16px; grid-template-columns:1fr; }
@media (min-width:560px){ .lc-grid{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:900px){ .lc-grid{ grid-template-columns:repeat(3,1fr); } }

.lc-card{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); overflow:hidden; box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent); }
.lc-media{ display:block; aspect-ratio:4/3; background:var(--brand-accent-soft); }
.lc-media img{ width:100%; height:100%; object-fit:cover; display:block; }
.lc-body{ padding:14px 15px 15px; display:grid; gap:6px; }
.lc-title-link{ text-decoration:none; color:inherit; }
.lc-title-link:hover .lc-title{ color:var(--brand-accent); }
.lc-title{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1rem; transition:color var(--motion) var(--motion-ease); }
.lc-sub-badge{
  justify-self:start; display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:980px;
  background:var(--brand-accent-soft); color:var(--brand-accent);
  font-size:.72rem; font-weight:600;
}
[data-theme="dark"] .lc-sub-badge{ color:var(--brand-ink); }
.lc-desc{ margin:0; color:var(--brand-ink-soft); font-size:.86rem; line-height:1.45; }
.lc-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:4px; }
.lc-price{ font-weight:600; font-variant-numeric:tabular-nums; }
.lc-cta{
  padding:8px 16px; border-radius:var(--radius); background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; font-size:.86rem; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.lc-cta:hover{ filter:brightness(1.06); }

.lc-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:14px; display:grid; gap:10px; overflow:hidden; }
.lc-skel-media{ display:block; aspect-ratio:4/3; border-radius:var(--radius); background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:lc-sweep 1.4s ease-in-out infinite; }
.lc-skel-line{ display:block; height:12px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:lc-sweep 1.4s ease-in-out infinite; }
@keyframes lc-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.lc-empty{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:28px; text-align:center; }
.lc-empty p{ margin:0 0 10px; color:var(--brand-ink-soft); }
.lc-empty button{ border:1px solid var(--brand-line); background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-size:.86rem; font-weight:600; padding:8px 16px; border-radius:980px; cursor:pointer; }

.lc-cta:focus-visible, .lc-empty button:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }

@media (prefers-reduced-motion: reduce){
  .lc-skel-media, .lc-skel-line{ animation:none; }
}
`;
