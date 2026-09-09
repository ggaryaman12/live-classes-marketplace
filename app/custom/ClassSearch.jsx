"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * ClassSearch — the heart of Bell. A filter rail beside a photo-forward grid
 * of live classes. Every filter and the sort order live in the URL query, so
 * a parent can copy the link and send it to a partner. All controls are
 * native form elements: keyboard-navigable, with visible focus rings.
 *
 * The classes here are clearly-labelled PLACEHOLDERS. Real listings appear
 * automatically once teachers publish classes in the Yelo dashboard — no
 * rebuild — and only then do the cards link through to enrollment.
 */

const SUBJECTS = [
  ["maths", "Maths"],
  ["science", "Science"],
  ["coding", "Coding & Tech"],
  ["english", "Reading & Writing"],
  ["languages", "World Languages"],
  ["art", "Art & Design"],
  ["music", "Music & Drama"],
  ["life-skills", "Life Skills"],
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODS = [
  ["morning", "Morning", "before 12pm"],
  ["afternoon", "Afternoon", "12–5pm"],
  ["evening", "Evening", "after 5pm"],
];
const FORMATS = [
  ["one-time", "One-time class"],
  ["multi-week", "Multi-week course"],
  ["ongoing", "Ongoing (join anytime)"],
];
const LENGTHS = [30, 45, 60, 90];
const LANGS = ["English", "Spanish", "French", "Hindi", "Mandarin"];
const SORTS = [
  ["relevance", "Relevance"],
  ["soonest", "Soonest start"],
  ["price", "Price: low to high"],
  ["rating", "Highest rated"],
];

const CLASSES = [
  { id: "c1", t: "Chess Club: Think Three Moves Ahead", s: "life-skills", teach: "CM Adisa Okafor", a: [7, 11], r: 4.9, rv: 38, p: 380, f: "ongoing", len: 45, lang: "English", day: "Sat", h: 10, seats: 3, img: "chess,kids" },
  { id: "c2", t: "Build Your First Game in Scratch", s: "coding", teach: "Mr. Daniel Park", a: [8, 12], r: 4.8, rv: 52, p: 450, f: "multi-week", len: 60, lang: "English", day: "Tue", h: 16, seats: 1, img: "coding,child,computer" },
  { id: "c3", t: "Kitchen Chemistry: Reactions You Can Eat", s: "science", teach: "Dr. Priya Fenn", a: [9, 13], r: 4.7, rv: 44, p: 520, f: "one-time", len: 90, lang: "English", day: "Wed", h: 15, seats: 0, img: "science,experiment,kids" },
  { id: "c4", t: "Spanish Through Games and Songs", s: "languages", teach: "Sra. Lucía Díaz", a: [5, 8], r: 4.9, rv: 61, p: 360, f: "ongoing", len: 30, lang: "Spanish", day: "Mon", h: 10, seats: 6, img: "language,learning,children" },
  { id: "c5", t: "Draw Your Own Comic Book", s: "art", teach: "Ms. Amara Bello", a: [8, 12], r: 4.8, rv: 47, p: 480, f: "multi-week", len: 60, lang: "English", day: "Thu", h: 17, seats: 4, img: "drawing,comic,kid" },
  { id: "c6", t: "Mental Maths Sprints", s: "maths", teach: "Ms. Neha Rao", a: [7, 9], r: 4.6, rv: 33, p: 300, f: "ongoing", len: 30, lang: "English", day: "Tue", h: 9, seats: 5, img: "maths,child,study" },
  { id: "c7", t: "Creative Writing Workshop: Worlds & Characters", s: "english", teach: "Ms. Sarah Levy", a: [11, 14], r: 4.9, rv: 58, p: 500, f: "multi-week", len: 60, lang: "English", day: "Fri", h: 11, seats: 6, img: "writing,notebook,child" },
  { id: "c8", t: "Intro to Python: Turtles and Loops", s: "coding", teach: "Mr. Tobi Ade", a: [10, 13], r: 4.7, rv: 29, p: 460, f: "multi-week", len: 60, lang: "English", day: "Wed", h: 16, seats: 2, img: "python,code,laptop" },
  { id: "c9", t: "Watercolour for Beginners", s: "art", teach: "Ms. Iris Wong", a: [6, 10], r: 4.8, rv: 40, p: 340, f: "one-time", len: 45, lang: "English", day: "Sun", h: 14, seats: 8, img: "watercolour,painting,child" },
  { id: "c10", t: "Debate Club: Make Your Case", s: "life-skills", teach: "Mr. James Cole", a: [12, 16], r: 4.7, rv: 26, p: 420, f: "ongoing", len: 60, lang: "English", day: "Thu", h: 18, seats: 3, img: "debate,students,speaking" },
  { id: "c11", t: "Volcanoes, Earthquakes & Our Restless Planet", s: "science", teach: "Mr. Leo Marsh", a: [8, 11], r: 4.6, rv: 31, p: 400, f: "one-time", len: 60, lang: "English", day: "Sat", h: 11, seats: 5, img: "volcano,geology,science" },
  { id: "c12", t: "French Story Time for Little Ears", s: "languages", teach: "Mme. Claire Petit", a: [4, 7], r: 4.9, rv: 49, p: 320, f: "ongoing", len: 30, lang: "French", day: "Mon", h: 9, seats: 4, img: "storytime,books,child" },
  { id: "c13", t: "Times Tables That Finally Stick", s: "maths", teach: "Ms. Grace Kim", a: [7, 10], r: 4.8, rv: 55, p: 300, f: "multi-week", len: 45, lang: "English", day: "Tue", h: 17, seats: 0, img: "multiplication,maths,learning" },
  { id: "c14", t: "Songwriting: Write Your First Song", s: "music", teach: "Mr. Otis Bram", a: [10, 14], r: 4.7, rv: 22, p: 470, f: "multi-week", len: 60, lang: "English", day: "Fri", h: 16, seats: 3, img: "songwriting,guitar,teen" },
  { id: "c15", t: "Nature Journaling: Look Closer", s: "science", teach: "Ms. Hana Wong", a: [6, 10], r: 4.9, rv: 37, p: 340, f: "ongoing", len: 45, lang: "English", day: "Sun", h: 10, seats: 8, img: "nature,journal,child" },
  { id: "c16", t: "Hindi for Heritage Kids", s: "languages", teach: "Ms. Kavya Nair", a: [7, 12], r: 4.8, rv: 34, p: 360, f: "ongoing", len: 45, lang: "Hindi", day: "Wed", h: 17, seats: 5, img: "hindi,language,children" },
  { id: "c17", t: "Improv Games: Yes, And!", s: "music", teach: "Mr. Ravi Shah", a: [9, 13], r: 4.7, rv: 28, p: 400, f: "one-time", len: 60, lang: "English", day: "Sat", h: 15, seats: 6, img: "improv,drama,kids" },
  { id: "c18", t: "Roblox Studio: Design a Playable World", s: "coding", teach: "Mr. Eli Furman", a: [9, 13], r: 4.6, rv: 63, p: 490, f: "multi-week", len: 60, lang: "English", day: "Thu", h: 16, seats: 2, img: "game,design,computer" },
  { id: "c19", t: "Mandarin Basics with Flashcards & Play", s: "languages", teach: "Ms. Mei Lin", a: [6, 9], r: 4.8, rv: 41, p: 380, f: "ongoing", len: 30, lang: "Mandarin", day: "Mon", h: 16, seats: 4, img: "mandarin,learning,child" },
  { id: "c20", t: "Money Smarts: Spend, Save, Give", s: "life-skills", teach: "Mr. Sam Idris", a: [10, 14], r: 4.7, rv: 24, p: 360, f: "one-time", len: 45, lang: "English", day: "Fri", h: 17, seats: 7, img: "money,learning,teen" },
];

function useTimezone() {
  // resolved after mount to avoid a server/client hydration mismatch
  const [tz, setTz] = useState("your local time");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time");
    } catch {
      /* keep default */
    }
  }, []);
  return tz;
}

function todOf(h) {
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
function fmtHour(h) {
  const am = h < 12;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${am ? "AM" : "PM"}`;
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
  const tz = useTimezone();

  const read = useCallback(
    (k, d = "") => params.get(k) ?? d,
    [params]
  );
  const readList = useCallback(
    (k) => {
      const v = params.get(k);
      return v ? v.split(",").filter(Boolean) : [];
    },
    [params]
  );

  const q = read("q").trim().toLowerCase();
  const subject = read("subject");
  const age = read("age");
  const days = readList("days");
  const tod = readList("tod");
  const format = read("format");
  const len = read("len");
  const lang = read("lang");
  const pmax = read("pmax");
  const rating = read("rating");
  const seatsOnly = read("seats") === "1";
  const sort = read("sort") || "relevance";

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

  const toggleList = useCallback(
    (key, value) => {
      const cur = readList(key);
      const nextArr = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      setParam({ [key]: nextArr.join(",") });
    },
    [readList, setParam]
  );

  const clearAll = useCallback(() => router.replace("/stores", { scroll: false }), [router]);

  const results = useMemo(() => {
    let list = CLASSES.filter((c) => {
      if (q) {
        const subjLabel = SUBJECTS.find(([v]) => v === c.s)?.[1] || "";
        const fmtLabel = FORMATS.find(([v]) => v === c.f)?.[1] || "";
        const haystack = `${c.t} ${c.teach} ${subjLabel} ${c.lang} ${fmtLabel}`.toLowerCase();
        // every typed word must appear somewhere in the class, so "coding python"
        // matches, but the words don't have to be adjacent or in title order
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      if (subject && c.s !== subject) return false;
      if (age && !(Number(age) >= c.a[0] && Number(age) <= c.a[1])) return false;
      if (days.length && !days.includes(c.day)) return false;
      if (tod.length && !tod.includes(todOf(c.h))) return false;
      if (format && c.f !== format) return false;
      if (len && c.len !== Number(len)) return false;
      if (lang && c.lang !== lang) return false;
      if (pmax && c.p > Number(pmax)) return false;
      if (rating && c.r < Number(rating)) return false;
      if (seatsOnly && c.seats === 0) return false;
      return true;
    });
    const order = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    if (sort === "price") list = [...list].sort((a, b) => a.p - b.p);
    else if (sort === "rating") list = [...list].sort((a, b) => b.r - a.r);
    else if (sort === "soonest") list = [...list].sort((a, b) => order[a.day] - order[b.day] || a.h - b.h);
    return list;
  }, [q, subject, age, days, tod, format, len, lang, pmax, rating, seatsOnly, sort]);

  const [copied, setCopied] = useState(false);
  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, []);

  const activeCount =
    (q ? 1 : 0) + (subject ? 1 : 0) + (age ? 1 : 0) + days.length + tod.length +
    (format ? 1 : 0) + (len ? 1 : 0) + (lang ? 1 : 0) + (pmax ? 1 : 0) + (rating ? 1 : 0) + (seatsOnly ? 1 : 0);

  return (
    <section className="bell-cs" aria-labelledby="bell-cs-h">
      <div className="cs-frame">
        <div className="cs-topline">
          <h2 id="bell-cs-h">{heading}</h2>
          <p className="cs-placeholder-note">
            Sample listings for layout — real classes appear here once teachers
            publish, and only then do they open for enrollment.
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
                placeholder="Topic, teacher…"
                onChange={(e) => setParam({ q: e.target.value })}
              />
            </fieldset>

            <fieldset>
              <legend>Subject</legend>
              <div className="cs-chips">
                <button type="button" data-on={!subject} onClick={() => setParam({ subject: "" })}>
                  All
                </button>
                {SUBJECTS.map(([v, l]) => (
                  <button key={v} type="button" data-on={subject === v} onClick={() => setParam({ subject: subject === v ? "" : v })}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Child’s age {age && <b>· {age} yrs</b>}</legend>
              <input
                type="range"
                min="3"
                max="18"
                step="1"
                value={age || "10"}
                onChange={(e) => setParam({ age: e.target.value })}
                aria-label="Child's age in years"
              />
              <div className="cs-range-ends"><span>3</span><span>18</span></div>
              {age && (
                <button type="button" className="cs-mini" onClick={() => setParam({ age: "" })}>
                  Any age
                </button>
              )}
            </fieldset>

            <fieldset>
              <legend>Days of the week</legend>
              <div className="cs-chips">
                {DAYS.map((d) => (
                  <button key={d} type="button" data-on={days.includes(d)} onClick={() => toggleList("days", d)}>
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Time of day <span className="cs-tz">({tz})</span></legend>
              {TODS.map(([v, l, hint]) => (
                <label key={v} className="cs-check">
                  <input type="checkbox" checked={tod.includes(v)} onChange={() => toggleList("tod", v)} />
                  <span>{l} <i>{hint}</i></span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Class format</legend>
              <label className="cs-check">
                <input type="radio" name="format" checked={!format} onChange={() => setParam({ format: "" })} />
                <span>Any format</span>
              </label>
              {FORMATS.map(([v, l]) => (
                <label key={v} className="cs-check">
                  <input type="radio" name="format" checked={format === v} onChange={() => setParam({ format: v })} />
                  <span>{l}</span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Session length</legend>
              <div className="cs-chips">
                <button type="button" data-on={!len} onClick={() => setParam({ len: "" })}>Any</button>
                {LENGTHS.map((n) => (
                  <button key={n} type="button" data-on={len === String(n)} onClick={() => setParam({ len: len === String(n) ? "" : n })}>
                    {n} min
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Language</legend>
              <select value={lang} onChange={(e) => setParam({ lang: e.target.value })}>
                <option value="">Any language</option>
                {LANGS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </fieldset>

            <fieldset>
              <legend>Max price per session {pmax && <b>· ₹{pmax}</b>}</legend>
              <input
                type="range"
                min="200"
                max="800"
                step="20"
                value={pmax || "800"}
                onChange={(e) => setParam({ pmax: e.target.value === "800" ? "" : e.target.value })}
                aria-label="Maximum price per session in rupees"
              />
              <div className="cs-range-ends"><span>₹200</span><span>₹800+</span></div>
            </fieldset>

            <fieldset>
              <legend>Minimum rating</legend>
              <div className="cs-chips">
                {["", "4", "4.5", "4.8"].map((v) => (
                  <button key={v || "any"} type="button" data-on={rating === v} onClick={() => setParam({ rating: v })}>
                    {v ? `${v}★+` : "Any"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <label className="cs-check cs-switch">
                <input type="checkbox" checked={seatsOnly} onChange={(e) => setParam({ seats: e.target.checked ? "1" : "" })} />
                <span>Only classes with open seats</span>
              </label>
            </fieldset>
          </form>

          <div className="cs-results">
            <div className="cs-results-bar">
              <p aria-live="polite">
                <b>{results.length}</b> {results.length === 1 ? "class" : "classes"}
                {activeCount ? " match your filters" : ""}
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
                <button type="button" className="cs-share" onClick={share}>
                  {copied ? "Link copied" : "Copy this search"}
                </button>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="cs-empty">
                <h3>No classes match yet</h3>
                <p>
                  Try widening the age range or clearing a day. New sessions are
                  added every week — save this search link and check back.
                </p>
                <button type="button" onClick={clearAll}>Clear all filters</button>
              </div>
            ) : (
              <ul className="cs-grid">
                {results.map((c) => (
                  <li key={c.id}>
                    <ClassCard c={c} tz={tz} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <style>{styles}</style>
    </section>
  );
}

function ClassCard({ c, tz }) {
  const subjLabel = SUBJECTS.find(([v]) => v === c.s)?.[1] || "Class";
  const initials = c.teach.replace(/^(CM|Dr\.|Mr\.|Ms\.|Mme\.|Sra\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("");
  const full = c.seats === 0;
  const src = `https://source.unsplash.com/480x360/?${encodeURIComponent(c.img)}`;
  const fallback = `https://picsum.photos/seed/${c.id}/480/360`;
  return (
    <article className="cs-card" data-full={full}>
      <div className="cs-card-media">
        <img
          src={src}
          alt={`${subjLabel} class: ${c.t}`}
          width="480"
          height="360"
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
        />
        <span className="cs-age">Ages {c.a[0]}–{c.a[1]}</span>
      </div>
      <div className="cs-card-body">
        <p className="cs-card-subj">{subjLabel} · {FORMATS.find(([v]) => v === c.f)?.[1]}</p>
        <h3 className="cs-card-title">{c.t}</h3>
        <p className="cs-card-rating">
          <b>{c.r.toFixed(1)}</b>
          <Stars value={c.r} />
          <span>({c.rv})</span>
        </p>
        <p className="cs-card-teacher">
          <span className="cs-avatar" aria-hidden="true">{initials}</span>
          {c.teach}
        </p>
        <p className="cs-card-next">
          Next: {c.day} · {fmtHour(c.h)} <span>{tz}</span> · {c.len} min
        </p>
        <div className="cs-card-foot">
          <span className="cs-price"><b>₹{c.p}</b> <i>/ session</i></span>
          <span className="cs-seats" data-full={full}>
            {full ? "Full — waitlist" : `${c.seats} seat${c.seats === 1 ? "" : "s"} left`}
          </span>
        </div>
        <button type="button" className="cs-view" disabled aria-disabled="true">
          Opens when teachers publish
        </button>
      </div>
    </article>
  );
}

function Stars({ value }) {
  const pct = (value / 5) * 100;
  return (
    <span className="cs-stars" aria-hidden="true">
      <span className="cs-stars-on" style={{ width: `${pct}%` }}>★★★★★</span>
      <span className="cs-stars-off">★★★★★</span>
    </span>
  );
}

const styles = `
.bell-cs{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:48px 20px 80px; }
@media (min-width:820px){ .bell-cs{ padding:64px 32px 104px; } }
.cs-frame{ max-width:1200px; margin-inline:auto; }
.cs-topline h2{ font-family:var(--brand-font-display); font-weight:600; letter-spacing:-.01em; font-size:clamp(1.5rem,3.6vw,2.1rem); margin:0 0 6px; }
.cs-placeholder-note{ margin:0 0 28px; font-size:.82rem; color:var(--brand-ink-soft); font-style:italic; max-width:60ch; }

.cs-layout{ display:grid; gap:28px; grid-template-columns:1fr; }
@media (min-width:940px){ .cs-layout{ grid-template-columns:264px 1fr; align-items:start; } }

.cs-rail{
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); padding:6px 16px 16px;
}
@media (min-width:940px){ .cs-rail{ position:sticky; top:16px; max-height:calc(100vh - 32px); overflow:auto; } }
.cs-rail-head{ display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:var(--brand-surface); padding:12px 0 10px; font-family:var(--brand-font-display); font-weight:600; font-size:.9rem; border-bottom:1px solid var(--brand-line); z-index:1; }
.cs-clear{ border:0; background:transparent; color:var(--brand-accent); font-weight:600; font-size:.8rem; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }

.cs-rail fieldset{ border:0; border-bottom:1px solid var(--brand-line); margin:0; padding:14px 0; }
.cs-rail fieldset:last-child{ border-bottom:0; }
.cs-rail legend{ font-family:var(--brand-font-display); font-weight:600; font-size:.82rem; color:var(--brand-ink); margin-bottom:10px; padding:0; }
.cs-rail legend b{ color:var(--brand-accent); font-weight:600; }
.cs-tz{ color:var(--brand-ink-soft); font-weight:400; font-size:.72rem; }

.cs-rail input[type="search"], .cs-rail select{
  width:100%; padding:9px 10px; font:inherit; font-size:.86rem;
  border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-paper); color:var(--brand-ink);
}
.cs-chips{ display:flex; flex-wrap:wrap; gap:6px; }
.cs-chips button{
  border:1px solid var(--brand-line); border-radius:980px;
  background:var(--brand-paper); color:var(--brand-ink-soft);
  font:inherit; font-size:.78rem; font-weight:500;
  padding:6px 11px; cursor:pointer;
  transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease);
}
.cs-chips button[data-on="true"]{ background:var(--brand-accent); color:var(--brand-accent-ink); border-color:var(--brand-accent); }

.cs-check{ display:flex; gap:9px; align-items:flex-start; padding:5px 0; font-size:.84rem; cursor:pointer; }
.cs-check input{ margin-top:2px; accent-color:var(--brand-accent); width:15px; height:15px; }
.cs-check i{ display:block; color:var(--brand-ink-soft); font-style:normal; font-size:.74rem; }
.cs-switch{ font-weight:500; }

.cs-rail input[type="range"]{ width:100%; accent-color:var(--brand-accent); }
.cs-range-ends{ display:flex; justify-content:space-between; font-size:.72rem; color:var(--brand-ink-soft); margin-top:2px; }
.cs-mini, .cs-empty button{ margin-top:8px; border:1px solid var(--brand-line); background:var(--brand-paper); border-radius:980px; padding:5px 12px; font:inherit; font-size:.76rem; cursor:pointer; color:var(--brand-ink); }

.cs-results-bar{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:18px; }
.cs-results-bar p{ margin:0; font-size:.92rem; }
.cs-results-bar p b{ font-family:var(--brand-font-display); }
.cs-results-actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cs-sort{ display:flex; align-items:center; gap:7px; font-size:.82rem; color:var(--brand-ink-soft); }
.cs-sort select{ font:inherit; font-size:.82rem; padding:7px 9px; border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-surface); color:var(--brand-ink); }
.cs-share{
  border:1px solid var(--brand-accent); background:var(--brand-accent-soft); color:var(--brand-accent);
  font:inherit; font-size:.82rem; font-weight:600; padding:8px 14px; border-radius:var(--radius); cursor:pointer;
}
[data-theme="dark"] .cs-share{ color:var(--brand-ink); }

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
.cs-card-media{ position:relative; aspect-ratio:4/3; background:var(--brand-accent-soft); }
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
.cs-card-title{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1.02rem; line-height:1.25; }
.cs-card-rating{ margin:0; display:flex; align-items:center; gap:6px; font-size:.8rem; color:var(--brand-ink-soft); }
.cs-card-rating b{ color:var(--brand-ink); font-variant-numeric:tabular-nums; }
.cs-stars{ position:relative; display:inline-block; font-size:.8rem; line-height:1; letter-spacing:1px; }
.cs-stars-off{ color:color-mix(in srgb, var(--brand-ink-soft) 40%, transparent); }
.cs-stars-on{ position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:var(--brand-accent); }
.cs-card-teacher{ margin:0; display:flex; align-items:center; gap:8px; font-size:.84rem; }
.cs-avatar{
  width:24px; height:24px; border-radius:50%; flex:0 0 auto;
  display:grid; place-items:center; font-size:.66rem; font-weight:700;
  background:var(--brand-accent-soft); color:var(--brand-accent);
  border:1px solid color-mix(in srgb, var(--brand-accent) 30%, var(--brand-line));
}
[data-theme="dark"] .cs-avatar{ color:var(--brand-ink); }
.cs-card-next{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); }
.cs-card-next span{ font-weight:600; }
.cs-card-foot{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-top:2px; }
.cs-price b{ font-family:var(--brand-font-display); font-size:1.02rem; font-variant-numeric:tabular-nums; }
.cs-price i{ font-style:normal; font-size:.74rem; color:var(--brand-ink-soft); }
.cs-seats{ font-size:.76rem; font-weight:600; color:var(--brand-ink-soft); }
.cs-seats[data-full="true"]{ color:var(--brand-accent); }
.cs-view{
  margin-top:10px; width:100%; padding:9px; border-radius:var(--radius);
  border:1px dashed var(--brand-line); background:var(--brand-paper);
  color:var(--brand-ink-soft); font:inherit; font-size:.78rem; font-weight:600;
  cursor:not-allowed;
}

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
}
`;
