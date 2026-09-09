"use client";

import { useEffect, useState } from "react";

/**
 * MeetTheInstructor — "Meet the instructor" on a teacher's page: a photo,
 * their name, and a short bio. Tries the real merchant profile call for
 * this teacher first (their id, read from the URL); if a real name/bio
 * comes back it's used as-is. Two live checks against this tenant's backend
 * (for user_id 510012595) both returned an empty profile, so this cannot
 * claim a specific real person's bio when nothing real is available —
 * the fallback is a clearly labelled SAMPLE bio with a generic placeholder
 * name, never presented as if it were the real teacher's story.
 *
 * Self-contained: no cross-file imports (see LiveCatalogue.jsx for why).
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
  dual_user_key: 0,
};

const SAMPLE_BIO = {
  name: "Ms. Elena Cho",
  bio: "Elena has taught small live groups online for six years, after ten years teaching in person. She believes the best classes feel like a workshop, not a lecture — kids building, asking and getting it wrong together before it clicks.",
  photo: "https://source.unsplash.com/480x480/?teacher,portrait,smiling",
  photoFallback: "https://picsum.photos/seed/bell-instructor/480/480",
};

function currentStoreId() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/store\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export default function MeetTheInstructor({
  heading = "Meet the instructor",
}) {
  const [state, setState] = useState("loading"); // loading | real | sample
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const storeId = currentStoreId();

    async function load() {
      if (!storeId) {
        if (!cancelled) setState("sample");
        return;
      }
      try {
        const res = await fetch(`${YELO_BASE}/merchant/viewProfile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            base_version: "1.0.0",
            device_type: "WEB",
          },
          body: JSON.stringify({ ...YELO_TENANT, user_id: storeId }),
        });
        const json = await res.json();
        const data = json?.status === 200 ? json?.data : null;
        if (cancelled) return;
        if (data && data.display_name && data.description) {
          setProfile({
            name: data.display_name,
            bio: data.description,
            photo: data.logo || data.banner_image || "",
          });
          setState("real");
        } else {
          setState("sample");
        }
      } catch {
        if (!cancelled) setState("sample");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = state === "real" ? profile : SAMPLE_BIO;
  const src = shown?.photo || SAMPLE_BIO.photo;

  return (
    <section className="bell-mti" aria-labelledby="bell-mti-h">
      <div className="mti-frame">
        <div className="mti-head">
          <h2 id="bell-mti-h">{heading}</h2>
          {state === "sample" && <span className="mti-sample-tag">Sample bio — for layout</span>}
        </div>

        {state === "loading" ? (
          <div className="mti-card" aria-hidden="true">
            <span className="mti-skel-photo" />
            <div className="mti-skel-lines">
              <span className="mti-skel-line" style={{ width: "40%" }} />
              <span className="mti-skel-line" style={{ width: "95%" }} />
              <span className="mti-skel-line" style={{ width: "80%" }} />
            </div>
          </div>
        ) : (
          <div className="mti-card">
            <img
              className="mti-photo"
              src={src}
              alt={shown.name}
              width="160"
              height="160"
              loading="lazy"
              onError={(e) => {
                if (e.currentTarget.src !== SAMPLE_BIO.photoFallback) e.currentTarget.src = SAMPLE_BIO.photoFallback;
              }}
            />
            <div>
              <p className="mti-name">{shown.name}</p>
              <p className="mti-bio">{shown.bio}</p>
            </div>
          </div>
        )}
      </div>
      <style>{css}</style>
    </section>
  );
}

const css = `
.bell-mti{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:56px 20px; border-bottom:1px solid var(--brand-line); }
@media (min-width:820px){ .bell-mti{ padding:80px 32px; } }
.mti-frame{ max-width:1100px; margin-inline:auto; }
.mti-head{ display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; justify-content:space-between; margin-bottom:22px; }
.mti-head h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0; }
.mti-sample-tag{ padding:5px 12px; border-radius:980px; border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink-soft); font-size:11.5px; font-weight:700; }

.mti-card{
  display:grid; gap:18px; align-items:start;
  grid-template-columns:1fr; padding:22px;
  border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
@media (min-width:600px){ .mti-card{ grid-template-columns:auto 1fr; align-items:center; } }

.mti-photo{
  width:112px; height:112px; border-radius:50%; object-fit:cover; display:block;
  border:2px solid var(--brand-accent-soft);
}
.mti-name{ margin:0 0 8px; font-family:var(--brand-font-display); font-weight:600; font-size:1.15rem; }
.mti-bio{ margin:0; color:var(--brand-ink-soft); line-height:1.6; font-size:.94rem; max-width:60ch; }

.mti-skel-photo{ width:112px; height:112px; border-radius:50%; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:mti-sweep 1.4s ease-in-out infinite; }
.mti-skel-lines{ display:grid; gap:10px; flex:1; }
.mti-skel-line{ height:12px; border-radius:6px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:mti-sweep 1.4s ease-in-out infinite; }
@keyframes mti-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

@media (prefers-reduced-motion: reduce){
  .mti-skel-photo, .mti-skel-line{ animation:none; }
}
`;
