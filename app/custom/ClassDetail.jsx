"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * ClassDetail — the class page. Reads a real product id from the URL
 * (?id=<product_id>) and fetches it live via `product/view` — confirmed
 * working against this tenant's backend (status 200, real name/price/store
 * for a real product). When a real class loads, its name, price, teacher
 * (with a link to their real store page) and description render for real;
 * fields the backend genuinely doesn't have for a class listing (age range,
 * group size, rating, learning goals, homework/assessment content) are not
 * invented — they're simply not shown, or say so plainly.
 *
 * There is still no per-class SESSION model on Yelo (no date/time/seat feed
 * tied to a listing — see docs/feature-requests/upcoming-live-classes.md),
 * so the "Available times" section is always clearly-labelled sample data,
 * whether the class itself is real or not. With no id, or if the real fetch
 * fails, the whole page falls back to one labelled sample class.
 */

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap";

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
  dual_user_key: 0,
};

const SAMPLE_CLASS = {
  isSample: true,
  title: "Full Curriculum: Junior Robotics — Build, Code, Play",
  teacher: "Mr. Daniel Park",
  teacherId: null,
  subject: "Coding & Tech",
  rating: 4.8,
  reviews: 52,
  age: [8, 12],
  group: "3–8 learners per class",
  price: 450,
  img: "https://source.unsplash.com/1600x900/?robotics,kids,coding",
  imgFallback: "https://picsum.photos/seed/bell-class-detail/1600/900",
  desc:
    "Over twelve weeks your child designs, builds and codes small robots from a real parts kit, working alongside a small live group. Every session is hands-on: something gets built or debugged by the end of the hour, not just watched.",
  goals: [
    "Read a wiring diagram and build a simple circuit safely",
    "Write and debug short block-based programs that control motors and sensors",
    "Explain how a sensor turns the real world into data a program can use",
    "Present a finished build and describe how it works, out loud, to the group",
  ],
};

const EXPECT = [
  {
    icon: "📓",
    title: "Homework",
    body: "Some weeks include a short build or coding task, usually under 30 minutes. A final project lets your child choose what they build to show what they've learned.",
    note: "Estimated 30–45 min outside class per week",
  },
  {
    icon: "✅",
    title: "Assessment",
    body: "Checked in through the activities themselves — no tests. The teacher shares a short written note on progress partway through the course.",
  },
  {
    icon: "🏆",
    title: "Grading",
    body: "No grades. Your child gets a rubric-based note from the teacher at the end covering what they built and what to try next.",
  },
];

const ADDITIONAL = [
  { k: "Parental guidance", v: "Kids handle a screwdriver and small parts. Adult supervision is recommended for the youngest end of the age range." },
  { k: "Supply list", v: "A parts kit is required — a supply list is emailed after enrollment, with a budget option under ₹800." },
  { k: "External resources", v: "The teacher shares a companion slide deck and a parts-sourcing guide with every enrolled family." },
  { k: "Sources", v: "Curriculum adapted from open robotics-education materials, credited in the first session." },
];

const SESSIONS = [
  {
    id: "sess-1",
    days: ["Tue", "Thu"],
    startDate: "2026-09-08",
    time: "16:00",
    len: 45,
    weeks: 12,
    seatsTotal: 8,
    seatsFilled: 6,
  },
  {
    id: "sess-2",
    days: ["Mon", "Wed", "Fri"],
    startDate: "2026-09-14",
    time: "17:30",
    len: 45,
    weeks: 8,
    seatsTotal: 8,
    seatsFilled: 2,
  },
];

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const TABS = ["Description", "Learning goals", "Class details", "Reviews"];

function generateMeetings(session) {
  const start = new Date(`${session.startDate}T00:00:00`);
  const wanted = session.days.map((d) => DAY_INDEX[d]);
  const total = session.weeks * session.days.length;
  const dates = [];
  const cursor = new Date(start);
  let guard = 0;
  while (dates.length < total && guard < 400) {
    guard++;
    if (wanted.includes(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtTime(hhmm, len) {
  const [h, m] = hhmm.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + len * 60000);
  const f = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${f(start)} – ${f(end)}`;
}

function mapRealProduct(p) {
  const desc = (p.description && p.description.trim()) || (p.long_description && p.long_description.trim()) || "";
  const name = p.name || "Untitled class";
  const term = encodeURIComponent(`${name}, class`);
  return {
    isSample: false,
    title: name,
    teacher: p.store_name || "This teacher",
    teacherId: p.user_id || null,
    price: Number(p.price) || 0,
    desc,
    img: p.image_url || `https://source.unsplash.com/1600x900/?${term}`,
    imgFallback: `https://picsum.photos/seed/product-${p.product_id}/1600/900`,
    rating: p.product_rating > 0 ? p.product_rating : null,
    reviews: p.total_review_count > 0 ? p.total_review_count : null,
    productId: p.product_id,
    recurring: p.is_recurring_enabled === 1,
  };
}

export default function ClassDetail(props) {
  return (
    <Suspense fallback={<section className="bell-cd" aria-busy="true" />}>
      <ClassDetailInner {...props} />
    </Suspense>
  );
}

function ClassDetailInner({
  backLabel = "← All classes",
  browseHref = "/stores",
}) {
  const params = useSearchParams();
  const id = params.get("id");

  const [tab, setTab] = useState(TABS[0]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [tz, setTz] = useState("your local time");
  const [cls, setCls] = useState(id ? null : SAMPLE_CLASS);

  useEffect(() => {
    if (!document.querySelector("link[data-bell-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONT_LINK;
      l.setAttribute("data-bell-fonts", "");
      document.head.appendChild(l);
    }
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time");
    } catch {
      /* keep default */
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setCls(SAMPLE_CLASS);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${YELO_BASE}/product/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
          body: JSON.stringify({ ...YELO_TENANT, product_id: Number(id), language: "en" }),
        });
        const json = await res.json();
        if (cancelled) return;
        const p = json?.status === 200 ? (Array.isArray(json.data) ? json.data[0] : json.data) : null;
        if (p && p.is_enabled === 1 && p.is_deleted !== 1) {
          setCls(mapRealProduct(p));
        } else {
          setCls(SAMPLE_CLASS);
        }
      } catch {
        if (!cancelled) setCls(SAMPLE_CLASS);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const meetingsBySession = useMemo(() => {
    const map = {};
    for (const s of SESSIONS) map[s.id] = generateMeetings(s);
    return map;
  }, []);

  if (!cls) {
    return (
      <section className="bell-cd" aria-busy="true">
        <div className="cd-frame">
          <div className="cd-cover cd-cover-loading" />
        </div>
        <style>{css}</style>
      </section>
    );
  }

  const enrollHref = cls.productId
    ? (sessId) => `/checkout?product=${cls.productId}&session=${sessId}`
    : (sessId) => `/checkout?class=${encodeURIComponent(cls.title)}&session=${sessId}`;

  return (
    <section className="bell-cd" aria-label={cls.title}>
      <div className="cd-frame">
        <Link href={browseHref} className="cd-back">{backLabel}</Link>

        <div className="cd-cover">
          <img
            src={cls.img}
            alt={`${cls.title} — cover photo`}
            width="1600"
            height="900"
            onError={(e) => {
              if (e.currentTarget.src !== cls.imgFallback) e.currentTarget.src = cls.imgFallback;
            }}
          />
          {cls.isSample && <span className="cd-sample-tag">Sample class — for layout</span>}
        </div>

        <div className="cd-layout">
          <div className="cd-main">
            {cls.isSample && <p className="cd-subject">{cls.subject}</p>}
            <h1 className="cd-title">{cls.title}</h1>

            <div className="cd-meta">
              {cls.teacherId ? (
                <Link href={`/store/${cls.teacherId}`} className="cd-teacher cd-teacher-link">
                  <span className="cd-avatar" aria-hidden="true">
                    {cls.teacher.split(" ").map((w) => w[0]).slice(-2).join("")}
                  </span>
                  {cls.teacher}
                </Link>
              ) : (
                <span className="cd-teacher">
                  <span className="cd-avatar" aria-hidden="true">
                    {cls.teacher.split(" ").map((w) => w[0]).slice(-2).join("")}
                  </span>
                  {cls.teacher}
                </span>
              )}
              {cls.rating != null && (
                <span className="cd-rating">
                  <b>{cls.rating.toFixed(1)}</b>
                  <Stars value={cls.rating} />
                  {cls.reviews != null && <span>({cls.reviews} reviews)</span>}
                </span>
              )}
              {cls.isSample && (
                <>
                  <span className="cd-chip">Ages {cls.age[0]}–{cls.age[1]}</span>
                  <span className="cd-chip">{cls.group}</span>
                </>
              )}
              {cls.recurring && <span className="cd-sub-badge">↻ Subscription available</span>}
            </div>

            <div className="cd-tabs" role="tablist" aria-label="Class information">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className="cd-tab"
                  data-on={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="cd-tabpanel" role="tabpanel">
              {tab === "Description" && (
                <p className={cls.desc ? "cd-desc" : "cd-placeholder"}>
                  {cls.desc || "No description added for this class yet."}
                </p>
              )}
              {tab === "Learning goals" && (
                cls.isSample ? (
                  <ul className="cd-goals">
                    {cls.goals.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                ) : (
                  <p className="cd-placeholder">This teacher hasn't listed specific learning goals for this class yet.</p>
                )
              )}
              {tab === "Class details" && (
                cls.isSample ? (
                  <ul className="cd-goals">
                    <li>{cls.group}, ages {cls.age[0]}–{cls.age[1]}</li>
                    <li>Live video meetings, {SESSIONS[0].len} minutes each</li>
                    <li>New sessions start most weeks — see Available times below</li>
                  </ul>
                ) : (
                  <ul className="cd-goals">
                    <li>Taught by {cls.teacher}</li>
                    <li>₹{cls.price.toLocaleString()} per session</li>
                    <li>See Available times below for sample scheduling — real session times are on their way</li>
                  </ul>
                )
              )}
              {tab === "Reviews" && (
                <p className="cd-placeholder">
                  Review writing is arriving in a later pass — only parents with a
                  completed first meeting will be able to leave one, one per
                  enrollment.
                </p>
              )}
            </div>

            {cls.isSample && (
              <>
                <div className="cd-expect">
                  {EXPECT.map((e) => (
                    <div key={e.title} className="cd-expect-card">
                      <span className="cd-expect-icon" aria-hidden="true">{e.icon}</span>
                      <h3>{e.title}</h3>
                      <p>{e.body}</p>
                      {e.note && <p className="cd-expect-note">{e.note}</p>}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="cd-additional-toggle"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((v) => !v)}
                >
                  <span>
                    <b>Additional details</b>
                    <i>{ADDITIONAL.map((a) => a.k).join(" · ")}</i>
                  </span>
                  <span className="cd-chevron" data-open={detailsOpen} aria-hidden="true">⌄</span>
                </button>
                {detailsOpen && (
                  <dl className="cd-additional-body">
                    {ADDITIONAL.map((a) => (
                      <div key={a.k}>
                        <dt>{a.k}</dt>
                        <dd>{a.v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}

            <div className="cd-times" id="available-times">
              <div className="cd-times-head">
                <h2>Available times <span>({SESSIONS.length} available)</span></h2>
                <span className="cd-tz-chip">🌐 {tz}</span>
              </div>
              <p className="cd-times-note">Sample sessions — real per-class scheduling is on its way.</p>

              <ul className="cd-sessions">
                {SESSIONS.map((s) => {
                  const meetings = meetingsBySession[s.id] || [];
                  const seatsLeft = s.seatsTotal - s.seatsFilled;
                  const full = seatsLeft <= 0;
                  const low = !full && seatsLeft <= 2;
                  const open = !!expanded[s.id];
                  const first = meetings[0];
                  const last = meetings[meetings.length - 1];
                  return (
                    <li key={s.id} className="cd-session">
                      <div className="cd-session-when">
                        <p className="cd-session-days">{s.days.join(", ")}</p>
                        <p className="cd-session-time">
                          {first ? fmtDate(first) : ""}, {fmtTime(s.time, s.len)}
                        </p>
                      </div>
                      <div className="cd-session-status">
                        <p><span aria-hidden="true">⏳</span> Started {first ? fmtDate(first) : "—"}</p>
                        <p>Ends {last ? fmtDate(last) : "—"}</p>
                        <button
                          type="button"
                          className="cd-show-more"
                          onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                          aria-expanded={open}
                        >
                          {open ? "Hide" : "Show"} remaining {Math.max(0, meetings.length - 1)} meetings
                        </button>
                        {open && (
                          <ul className="cd-meeting-list">
                            {meetings.slice(1).map((m, i) => (
                              <li key={i}>{m.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="cd-session-seats">
                        <p>{s.seatsFilled} seat{s.seatsFilled === 1 ? "" : "s"} filled</p>
                        {low && <p className="cd-seats-low">Only {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left!</p>}
                        {full && <p className="cd-seats-low">Full — join the waitlist</p>}
                      </div>
                      <Link
                        href={enrollHref(s.id)}
                        className="cd-join"
                        data-full={full}
                      >
                        {full ? "Join waitlist" : "Enroll — Week 1"}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="cd-request">
                <p>Don't see a time that works?</p>
                <button type="button" disabled aria-disabled="true" title="Direct requests aren't available yet">
                  Request another time — soon
                </button>
              </div>
            </div>
          </div>

          <aside className="cd-side" aria-label="Enroll in this class">
            <div className="cd-side-card">
              <p className="cd-side-kind">Live group class</p>
              <p className="cd-side-price">
                <b>₹{cls.price.toLocaleString()}</b> <i>per session</i>
              </p>
              {cls.isSample ? (
                <>
                  <p className="cd-side-total">₹{(cls.price * SESSIONS[0].weeks).toLocaleString()} for {SESSIONS[0].weeks} sessions</p>
                  <ul className="cd-side-facts">
                    <li>📅 {SESSIONS[0].days.length}x per week, {SESSIONS[0].weeks} weeks</li>
                    <li>⏱ {SESSIONS[0].len} min live video meetings</li>
                    <li>🎓 Ages {cls.age[0]}–{cls.age[1]}</li>
                    <li>👥 {cls.group}</li>
                  </ul>
                </>
              ) : (
                <p className="cd-side-total">Taught by {cls.teacher}</p>
              )}
              {cls.productId ? (
                <Link className="cd-side-primary" href={`/checkout?product=${cls.productId}`}>
                  Enroll now
                </Link>
              ) : (
                <a className="cd-side-cta" href="#available-times">See all available times</a>
              )}
            </div>
          </aside>
        </div>
      </div>

      <div className="cd-mobilebar">
        <div>
          <b>₹{cls.price.toLocaleString()}</b> <span>/ session</span>
        </div>
        {cls.productId ? (
          <Link href={`/checkout?product=${cls.productId}`}>Enroll now</Link>
        ) : (
          <a href="#available-times">See times</a>
        )}
      </div>

      <style>{css}</style>
    </section>
  );
}

function Stars({ value }) {
  const pct = (value / 5) * 100;
  return (
    <span className="cd-stars" aria-hidden="true">
      <span className="cd-stars-on" style={{ width: `${pct}%` }}>★★★★★</span>
      <span className="cd-stars-off">★★★★★</span>
    </span>
  );
}

const css = `
.bell-cd{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding-bottom:88px; }
.cd-frame{ max-width:1180px; margin-inline:auto; padding:24px 20px 0; }
@media (min-width:820px){ .cd-frame{ padding:32px 32px 0; } }

.cd-back{ display:inline-block; margin-bottom:16px; color:var(--brand-ink-soft); font-size:.86rem; font-weight:600; text-decoration:none; }
.cd-back:hover{ color:var(--brand-accent); }

.cd-cover{ position:relative; border-radius:var(--radius-lg); overflow:hidden; background:var(--brand-accent-soft); margin-bottom:28px; }
.cd-cover img{ width:100%; aspect-ratio:16/6; max-height:220px; object-fit:cover; display:block; }
.cd-cover-loading{ aspect-ratio:16/6; max-height:220px; }
@media (min-width:820px){ .cd-cover img, .cd-cover-loading{ aspect-ratio:21/5; max-height:260px; } }
.cd-sample-tag{
  position:absolute; left:14px; bottom:14px;
  background:var(--brand-surface); border:1px solid var(--brand-line);
  color:var(--brand-ink-soft); font-size:11.5px; font-weight:700;
  padding:5px 11px; border-radius:980px;
}

.cd-layout{ display:grid; gap:32px; grid-template-columns:1fr; align-items:start; }
@media (min-width:900px){ .cd-layout{ grid-template-columns:1fr 300px; } }

.cd-subject{ margin:0 0 6px; font-size:.76rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--brand-ink-soft); }
.cd-title{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.015em; font-size:clamp(1.6rem,4vw,2.3rem); margin:0 0 16px; }

.cd-meta{ display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; margin-bottom:26px; font-size:.88rem; }
.cd-teacher{ display:flex; align-items:center; gap:8px; font-weight:600; color:var(--brand-ink); text-decoration:none; }
.cd-teacher-link:hover{ color:var(--brand-accent); }
.cd-avatar{ width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-size:.68rem; font-weight:700; background:var(--brand-accent-soft); color:var(--brand-accent); }
[data-theme="dark"] .cd-avatar{ color:var(--brand-ink); }
.cd-rating{ display:flex; align-items:center; gap:6px; color:var(--brand-ink-soft); }
.cd-rating b{ color:var(--brand-ink); font-variant-numeric:tabular-nums; }
.cd-stars{ position:relative; display:inline-block; font-size:.85rem; letter-spacing:1px; }
.cd-stars-off{ color:color-mix(in srgb, var(--brand-ink-soft) 40%, transparent); }
.cd-stars-on{ position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:var(--brand-accent); }
.cd-chip{ padding:5px 11px; border-radius:980px; border:1px solid var(--brand-line); background:var(--brand-surface); font-weight:600; font-size:.8rem; color:var(--brand-ink-soft); }
.cd-sub-badge{ padding:5px 11px; border-radius:980px; background:var(--brand-accent-soft); color:var(--brand-accent); font-weight:600; font-size:.8rem; }
[data-theme="dark"] .cd-sub-badge{ color:var(--brand-ink); }

.cd-tabs{ display:flex; gap:4px; flex-wrap:wrap; border-bottom:1px solid var(--brand-line); margin-bottom:20px; }
.cd-tab{
  border:0; background:transparent; padding:10px 4px; margin-right:16px;
  font:inherit; font-weight:600; font-size:.9rem; color:var(--brand-ink-soft);
  border-bottom:2px solid transparent; cursor:pointer;
  transition:color var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease);
}
.cd-tab[data-on="true"]{ color:var(--brand-accent); border-bottom-color:var(--brand-accent); }
.cd-tabpanel{ margin-bottom:32px; }
.cd-desc, .cd-placeholder{ margin:0; color:var(--brand-ink-soft); line-height:1.65; font-size:.96rem; max-width:64ch; }
.cd-placeholder{ font-style:italic; }
.cd-goals{ margin:0; padding-left:20px; display:grid; gap:8px; color:var(--brand-ink-soft); font-size:.94rem; line-height:1.5; }

.cd-expect{ display:grid; gap:14px; grid-template-columns:1fr; margin-bottom:24px; }
@media (min-width:640px){ .cd-expect{ grid-template-columns:repeat(2,1fr); } }
@media (min-width:900px){ .cd-expect{ grid-template-columns:1fr; } }
.cd-expect-card{ border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-surface); padding:18px; }
.cd-expect-icon{ font-size:20px; display:inline-block; margin-bottom:8px; }
.cd-expect-card h3{ font-family:var(--brand-font-display); font-weight:600; font-size:1rem; margin:0 0 6px; }
.cd-expect-card p{ margin:0; color:var(--brand-ink-soft); font-size:.88rem; line-height:1.5; }
.cd-expect-note{ margin-top:6px !important; font-style:italic; font-size:.8rem !important; }

.cd-additional-toggle{
  width:100%; display:flex; justify-content:space-between; align-items:center; gap:12px;
  border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-surface);
  padding:16px; cursor:pointer; text-align:left; margin-bottom:0;
}
.cd-additional-toggle b{ display:block; font-family:var(--brand-font-display); font-weight:600; font-size:.98rem; margin-bottom:3px; }
.cd-additional-toggle i{ font-style:normal; color:var(--brand-ink-soft); font-size:.82rem; }
.cd-chevron{ font-size:18px; color:var(--brand-ink-soft); transition:transform var(--motion) var(--motion-ease); }
.cd-chevron[data-open="true"]{ transform:rotate(180deg); }
.cd-additional-body{
  margin:0 0 24px; padding:16px; border:1px solid var(--brand-line); border-top:0;
  border-radius:0 0 var(--radius) var(--radius); background:var(--brand-surface);
  display:grid; gap:14px;
}
.cd-additional-body dt{ font-family:var(--brand-font-display); font-weight:600; font-size:.86rem; margin-bottom:3px; }
.cd-additional-body dd{ margin:0; color:var(--brand-ink-soft); font-size:.86rem; line-height:1.5; }

.cd-times-head{ display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; justify-content:space-between; margin:36px 0 6px; }
.cd-times-head h2{ font-family:var(--brand-font-display); font-weight:600; font-size:1.3rem; margin:0; }
.cd-times-head h2 span{ font-weight:500; color:var(--brand-ink-soft); font-size:.9rem; }
.cd-tz-chip{ padding:6px 12px; border-radius:980px; border:1px solid var(--brand-line); background:var(--brand-surface); font-size:.78rem; font-weight:600; color:var(--brand-ink-soft); }
.cd-times-note{ margin:0 0 18px; font-size:.8rem; color:var(--brand-ink-soft); font-style:italic; }

.cd-sessions{ list-style:none; margin:0; padding:0; display:grid; gap:0; border-top:1px solid var(--brand-line); }
.cd-session{
  display:grid; gap:10px 16px; padding:18px 0; border-bottom:1px solid var(--brand-line);
  grid-template-columns:1fr; align-items:start;
}
@media (min-width:700px){ .cd-session{ grid-template-columns:1.1fr 1.3fr .9fr auto; align-items:center; } }
.cd-session-days{ margin:0 0 2px; font-family:var(--brand-font-display); font-weight:600; font-size:1rem; }
.cd-session-time{ margin:0; color:var(--brand-ink-soft); font-size:.88rem; }
.cd-session-status p{ margin:0 0 2px; font-size:.84rem; color:var(--brand-ink-soft); }
.cd-show-more{ border:0; background:transparent; color:var(--brand-accent); font:inherit; font-size:.82rem; font-weight:600; cursor:pointer; padding:2px 0; text-decoration:underline; text-underline-offset:2px; }
.cd-meeting-list{ list-style:none; margin:8px 0 0; padding:8px; max-height:140px; overflow:auto; background:var(--brand-paper); border:1px solid var(--brand-line); border-radius:8px; font-size:.78rem; color:var(--brand-ink-soft); display:grid; gap:3px; }
.cd-session-seats p{ margin:0 0 2px; font-size:.84rem; color:var(--brand-ink-soft); }
.cd-seats-low{ color:var(--brand-accent) !important; font-weight:600; }
.cd-join{
  display:inline-flex; align-items:center; justify-content:center; white-space:nowrap;
  padding:11px 18px; border-radius:var(--radius);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; font-size:.9rem; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.cd-join:hover{ filter:brightness(1.06); }
.cd-join[data-full="true"]{ background:var(--brand-ink-soft); }

.cd-request{ display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; margin-top:20px; }
.cd-request p{ margin:0; font-weight:600; font-size:.9rem; }
.cd-request button{
  border:1px dashed var(--brand-line); background:var(--brand-surface); color:var(--brand-ink-soft);
  font:inherit; font-size:.82rem; font-weight:600; padding:9px 15px; border-radius:980px; cursor:not-allowed;
}

.cd-side{ display:none; }
@media (min-width:900px){
  .cd-side{ display:block; position:sticky; top:16px; }
}
.cd-side-card{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:22px; box-shadow:0 18px 44px -30px color-mix(in srgb, var(--brand-ink) 50%, transparent); }
.cd-side-kind{ margin:0 0 12px; font-size:.78rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--brand-accent); background:var(--brand-accent-soft); display:inline-block; padding:4px 10px; border-radius:980px; }
.cd-side-price{ margin:0 0 2px; }
.cd-side-price b{ font-family:var(--brand-font-display); font-size:1.7rem; font-weight:600; }
.cd-side-price i{ font-style:normal; color:var(--brand-ink-soft); font-size:.84rem; }
.cd-side-total{ margin:0 0 16px; color:var(--brand-ink-soft); font-size:.82rem; }
.cd-side-facts{ list-style:none; margin:0 0 18px; padding:14px 0 0; border-top:1px solid var(--brand-line); display:grid; gap:10px; font-size:.86rem; }
.cd-side-primary{
  display:block; text-align:center; padding:13px; border-radius:var(--radius); margin-bottom:10px;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; font-size:.92rem; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.cd-side-primary:hover{ filter:brightness(1.06); }
.cd-side-cta{
  display:block; text-align:center; padding:13px; border-radius:var(--radius);
  background:var(--brand-accent-soft); color:var(--brand-accent);
  font-family:var(--brand-font-display); font-weight:600; font-size:.9rem; text-decoration:none;
}
[data-theme="dark"] .cd-side-cta{ color:var(--brand-ink); }
.cd-side-cta:hover{ filter:brightness(1.03); }

.cd-mobilebar{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  position:fixed; left:0; right:0; bottom:0; z-index:20;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:var(--brand-surface); border-top:1px solid var(--brand-line);
  box-shadow:0 -12px 30px -20px color-mix(in srgb, var(--brand-ink) 45%, transparent);
}
@media (min-width:900px){ .cd-mobilebar{ display:none; } }
.cd-mobilebar b{ font-family:var(--brand-font-display); font-size:1.1rem; }
.cd-mobilebar span{ color:var(--brand-ink-soft); font-size:.8rem; }
.cd-mobilebar a{
  padding:11px 20px; border-radius:var(--radius);
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:600; text-decoration:none; font-size:.9rem;
}
@media (max-width:899px){ .bell-cd{ padding-bottom:96px; } }

.bell-cd :is(a,button):focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
`;
