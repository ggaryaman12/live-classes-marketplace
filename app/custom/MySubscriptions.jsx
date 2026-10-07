'use client';
/**
 * MySubscriptions — every recurring class this customer has, ACROSS EVERY
 * TEACHER, with a detail view for one. Real data, verified live against
 * this tenant, and this took a real, non-obvious correction to get right:
 *
 * `recurring/getRecurringRules` and `recurring/getRuleDetails` both take a
 * `user_id` param that Joi marks required — which reads as "scoped to one
 * store" — but the controller reads it into a local variable and then never
 * actually passes it into the query (yelo-server modules/recurring/
 * controllers/recurringController.js getRecurringRules:885-929 and
 * getRuleDetails:931-1004 both build their DB call from marketplace_user_id
 * + vendor_id/rule_id only, never `user_id`). Confirmed by calling it live
 * with an unrelated user_id and getting back rules from TWO DIFFERENT real
 * teachers in one response. So this is genuinely a cross-teacher "my
 * classes" list, not a per-store one — `user_id` is sent because the field
 * is required to validate, and its value doesn't change the result.
 *
 * The list call's own columns don't include a course name OR a teacher name
 * (verified live: only rule_id/status/amount/schedule/occurrence fields), so
 * each row gets one follow-up call to `recurring/getRuleDetails` — verified
 * live to return both `products[0].product.product_name` (the actual course,
 * e.g. "Maths (Age 5-10)") and `merchant_name` (the teacher) in a single
 * response, so one call per rule covers both instead of needing a separate
 * store lookup. This can't be deduped by store the way a name-only lookup
 * could, since two rules at the same teacher can be different courses.
 *
 * Self-contained, direct-to-backend calls — same established pattern as
 * SubscribeScheduler/ClassCheckout/SubscriptionConfirm.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '../lib/session';

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.devweb1.yelo.red',
  dual_user_key: 0,
  language: 'en',
};
const COORDS = { latitude: 28.61482, longitude: 77.219989 };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The card badge should read as course PROGRESS, not the raw subscription
// status: "In progress" while sessions remain, "Complete" once they're all
// done. A course is complete when a session-capped rule has no remaining
// occurrences, or a date-bounded rule's end date has passed. A declined
// rule keeps its own label.
function courseState(r) {
  const remaining = Number(r.remaining_occurrence_count);
  const total = Number(r.occurrence_count);
  const endTs = r.end_schedule ? new Date(r.end_schedule).getTime() : NaN;
  const done =
    (Number(r.schedule_type) === 2 && total > 0 && remaining === 0) ||
    (!Number.isNaN(endTs) && endTs < Date.now());
  if (done) return { label: 'Complete', cls: 'complete' };
  if (Number(r.status) === 2) return { label: 'Declined', cls: 'declined' };
  if (Number(r.is_paused) === 1) return { label: 'Paused', cls: 'paused' };
  return { label: 'In progress', cls: 'progress' };
}

// How far through the course this customer is: sessions done out of the total
// for a session-capped course, or the share of the date range that has passed
// for a date-bounded one. null = open-ended, nothing honest to draw.
function courseProgress(r) {
  const total = Number(r.occurrence_count);
  const remaining = Number(r.remaining_occurrence_count);
  if (Number(r.schedule_type) === 2 && total > 0 && !Number.isNaN(remaining)) {
    const done = Math.min(total, Math.max(0, total - remaining));
    return { pct: (done / total) * 100, label: `${done} of ${total} sessions done` };
  }
  const st = r.start_schedule ? new Date(r.start_schedule).getTime() : NaN;
  const en = r.end_schedule ? new Date(r.end_schedule).getTime() : NaN;
  if (!Number.isNaN(st) && !Number.isNaN(en) && en > st) {
    const pct = Math.min(100, Math.max(0, ((Date.now() - st) / (en - st)) * 100));
    return { pct, label: `${Math.round(pct)}% of the course` };
  }
  return null;
}

// The progress bar that stands in for the old "In progress" pill. The fill is
// revealed with clip-path (paint only, no layout) once mounted, so it grows in
// from empty; with reduced motion it just appears at its value.
function CourseProgress({ r, state }) {
  const prog = courseProgress(r);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!prog) return null;
  const pct = Math.round(prog.pct);
  return (
    <div className={`ms-prog ms-prog-${state}`}>
      <div
        className="ms-prog-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Course progress: ${prog.label}`}
      >
        <span
          className="ms-prog-fill"
          style={{ clipPath: `inset(0 ${shown ? 100 - prog.pct : 100}% 0 0 round 999px)` }}
        />
      </div>
      <p className="ms-prog-label">
        <b>{prog.label}</b>
        {state === 'paused' ? ' · Paused' : ''}
      </p>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
// ---- "home" helpers: turn a session row's date + time into a real moment ----
// Session rows carry `date` (YYYY-MM-DD) and `start_time`/`end_time` (HH:MM),
// the same wall-clock values the schedule below already shows as-is — read
// here as the visitor's own local time.
function toMoment(date, hhmm) {
  if (!date) return null;
  const [y, mo, d] = String(date).slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return null;
  let h = 0, m = 0;
  if (hhmm) {
    const parts = String(hhmm).split(':').map(Number);
    if (!Number.isNaN(parts[0])) h = parts[0];
    if (!Number.isNaN(parts[1])) m = parts[1];
  }
  return new Date(y, mo - 1, d, h, m).getTime();
}
function dayLabel(ms, now) {
  const d = new Date(ms);
  const start = (t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const diffDays = Math.round((start(ms) - start(now)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}
function untilText(startMs, endMs, hasTime, now) {
  if (!hasTime) {
    const diffDays = Math.round((new Date(startMs).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
    if (diffDays <= 0) return 'Today';
    return diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;
  }
  if (now >= startMs && now <= endMs) return 'Happening now';
  const mins = Math.max(1, Math.round((startMs - now) / 60000));
  if (mins < 60) return `Starts in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Starts in ${hrs}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  const days = Math.floor(hrs / 24);
  return `Starts in ${days} day${days > 1 ? 's' : ''}${hrs % 24 ? ` ${hrs % 24}h` : ''}`;
}
const yeloPost = (path, body) =>
  fetch(`${YELO_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({ status: 0 }));

// `recurring/updateRecurringRule` — real endpoint, real payload, verified
// against this exact tenant (rule 820: called with is_paused:1, then
// re-fetching the rule live confirmed `is_paused` really flipped to 1).
// Unlike getRuleDetails/getRecurringRules/recurring/list, THIS call's
// `user_id` is the real merchant/store id, not a required-but-unused
// placeholder — every row from either list already carries its own real
// store id as `user_id`, confirmed live to match the teacher it's with.
const setRulePaused = (ruleId, storeUserId, isPaused, session) =>
  yeloPost('recurring/updateRecurringRule', {
    rule_id: ruleId,
    is_paused: isPaused,
    marketplace_user_id: String(YELO_TENANT.marketplace_user_id),
    user_id: storeUserId,
    vendor_id: String(session.vendorId),
    access_token: session.token,
    app_type: 'WEB',
    domain_name: YELO_TENANT.domain_name,
    dual_user_key: 0,
    language: 'en',
  });

// `recurring/addVacationRule` — real endpoint, real payload given straight
// from a working curl against this tenant (rule 820, vacation_dates for
// 2026-09-18/19/20 — the exact three dates that now show "Skipped" on that
// rule's real schedule, confirmed live). One real difference from
// updateRecurringRule's shape worth keeping exact rather than "normalizing":
// `vendor_id` travels as a NUMBER here, not a string.
const addVacationDates = (ruleId, storeUserId, dates, session) =>
  yeloPost('recurring/addVacationRule', {
    rule_id: ruleId,
    marketplace_user_id: String(YELO_TENANT.marketplace_user_id),
    user_id: storeUserId,
    vacation_dates: dates,
    app_type: 'WEB',
    vendor_id: session.vendorId,
    access_token: session.token,
    domain_name: YELO_TENANT.domain_name,
    dual_user_key: 0,
    language: 'en',
  });

export default function MySubscriptions(props) {
  return (
    <Suspense fallback={null}>
      <MySubscriptionsInner {...props} />
    </Suspense>
  );
}

function MySubscriptionsInner({ heading = 'My enrolled courses' }) {
  const params = useSearchParams();
  const ruleId = Number(params.get('rule')) || null;
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setSessionReady(true);
    const onChange = () => setSession(getSession());
    window.addEventListener('yelo-session', onChange);
    return () => window.removeEventListener('yelo-session', onChange);
  }, []);

  if (!sessionReady) return null;

  if (!session?.vendorId || !session?.token) {
    return (
      <Frame heading={heading}>
        <EmptyCard
          title="Sign in to see your enrolled courses"
          body="Your classes and subscriptions are tied to your account — sign in from the header to view them."
        />
      </Frame>
    );
  }

  return (
    <Frame heading={heading}>
      {ruleId ? (
        <Detail ruleId={ruleId} session={session} />
      ) : (
        <ListView session={session} />
      )}
    </Frame>
  );
}

function Frame({ heading, children }) {
  return (
    <section className="ms" aria-labelledby="ms-h">
      <div className="ms-frame">
        <h1 id="ms-h">{heading}</h1>
        {children}
      </div>
      <style>{css}</style>
    </section>
  );
}

function EmptyCard({ title, body, cta }) {
  return (
    <div className="ms-empty">
      <p className="ms-empty-t">{title}</p>
      <p className="ms-empty-b">{body}</p>
      {cta && <Link href={cta.href} className="ms-cta">{cta.label}</Link>}
    </div>
  );
}

function ListView({ session }) {
  const [state, setState] = useState('loading'); // loading | ok | empty | error
  const [rules, setRules] = useState([]);
  const [details, setDetails] = useState({}); // rule_id -> { course, teacher }
  // The rule id is on every list row from the FIRST response and never
  // changes; the course + teacher name need a second round of calls (see
  // below) and arrive a beat later. Reserving their own skeleton lines from
  // the start — rather than showing the id as a placeholder heading and
  // swapping its text once resolved — avoids the flash/blink that came from
  // treating one value as a stand-in for another.
  const [detailsLoading, setDetailsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    yeloPost('recurring/getRecurringRules', {
      ...YELO_TENANT,
      // Required by the validator, but not actually used to filter the
      // query (see the file header note) — the marketplace's own id is as
      // good a placeholder as any real store id.
      user_id: YELO_TENANT.marketplace_user_id,
      vendor_id: session.vendorId,
      access_token: session.token,
      length: 25,
      start: 0,
    }).then(async (json) => {
      if (cancelled) return;
      if (json?.status === 200 && Array.isArray(json?.data?.result)) {
        const result = json.data.result;
        setRules(result);
        setState(result.length ? 'ok' : 'empty');

        // Resolve each rule's course + teacher name — the list columns
        // don't carry either. One call per rule (see file header note on
        // why this can't be deduped by store the way a name-only lookup
        // could).
        if (!result.length) { setDetailsLoading(false); return; }
        const resolved = await Promise.all(result.map((r) =>
          yeloPost('recurring/getRuleDetails', {
            ...YELO_TENANT,
            rule_id: r.rule_id,
            user_id: r.user_id,
            vendor_id: session.vendorId,
            access_token: session.token,
          }).then((j) => {
            const d = j?.status === 200 ? j?.data?.result?.[0] : null;
            const course = d?.products?.[0]?.product?.product_name || d?.products?.[0]?.product?.name || null;
            const teacher = d?.merchant_name || d?.store_name || null;
            return [r.rule_id, { course, teacher }];
          })
        ));
        if (!cancelled) { setDetails(Object.fromEntries(resolved)); setDetailsLoading(false); }
      } else {
        setState('error');
      }
    });
    return () => { cancelled = true; };
  }, [session]);

  // Every course's session schedule (same `recurring/list` call the course
  // detail page uses), so the top of this page can answer "what's my next live
  // class?" and the bottom can show sessions already done.
  const [sched, setSched] = useState({ loading: true, byRule: {}, failed: 0 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (state !== 'ok') return;
    let cancelled = false;
    setSched({ loading: true, byRule: {}, failed: 0 });
    const active = rules.filter((r) => Number(r.status) !== 2);
    Promise.all(
      active.map((r) =>
        yeloPost('recurring/list', {
          ...YELO_TENANT,
          user_id: YELO_TENANT.marketplace_user_id, // required, not used to filter — see file header
          vendor_id: session.vendorId,
          access_token: session.token,
          rule_id: r.rule_id,
          limit: 100,
          offset: 0,
        }).then((j) =>
          j?.status === 200 && j?.data
            ? [r.rule_id, { upcoming: Array.isArray(j.data.upcoming) ? j.data.upcoming : [], completed: Array.isArray(j.data.completed) ? j.data.completed : [] }]
            : [r.rule_id, null]
        )
      )
    ).then((pairs) => {
      if (cancelled) return;
      setSched({
        loading: false,
        byRule: Object.fromEntries(pairs.filter(([, v]) => v)),
        failed: pairs.filter(([, v]) => !v).length,
      });
    });
    return () => { cancelled = true; };
  }, [state, rules, session]);

  const { next, comingUp, past } = useMemo(() => {
    const byId = Object.fromEntries(rules.map((r) => [r.rule_id, r]));
    const upcomingAll = [];
    const pastAll = [];
    for (const [id, v] of Object.entries(sched.byRule)) {
      const r = byId[id];
      if (!r) continue;
      const cs = courseState(r);
      const info = details[id] || {};
      if (cs.cls === 'progress') {
        for (const x of v.upcoming) {
          if (x.is_skipped) continue;
          const startMs = toMoment(x.date, x.start_time);
          if (startMs == null) continue;
          const hasTime = !!x.start_time;
          const endMs = hasTime
            ? (toMoment(x.date, x.end_time) ?? startMs + 60 * 60000)
            : startMs + 86400000 - 60000;
          if (endMs < now) continue;
          upcomingAll.push({ r, x, startMs, endMs, hasTime, course: info.course, teacher: info.teacher });
        }
      }
      for (const x of v.completed) {
        if (x.is_skipped) continue;
        const startMs = toMoment(x.date, x.start_time);
        if (startMs == null) continue;
        pastAll.push({ r, x, startMs, course: info.course, teacher: info.teacher });
      }
    }
    upcomingAll.sort((a, b) => a.startMs - b.startMs);
    pastAll.sort((a, b) => b.startMs - a.startMs);
    return { next: upcomingAll[0] || null, comingUp: upcomingAll.slice(1, 4), past: pastAll.slice(0, 6) };
  }, [sched, rules, details, now]);

  const firstName = (session?.name || '').trim().split(/\s+/)[0] || '';

  if (state === 'loading') {
    return (
      <ul className="ms-grid" aria-hidden="true">
        {[0, 1].map((i) => (
          <li key={i} className="ms-skel">
            <span className="ms-skel-line" style={{ width: '50%' }} />
            <span className="ms-skel-line" style={{ width: '75%' }} />
            <span className="ms-skel-line" style={{ width: '40%' }} />
          </li>
        ))}
      </ul>
    );
  }
  if (state === 'error') {
    return <EmptyCard title="Couldn't load your enrolled courses" body="Something went wrong reaching the store. Try reloading the page." />;
  }
  if (state === 'empty') {
    return <EmptyCard title="Nothing here yet" body="Once you enroll in or subscribe to a class, it'll show up here." cta={{ href: '/stores', label: 'Browse teachers' }} />;
  }

  return (
    <>
      <p className="ms-hello">{firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'} Here's what's coming up.</p>

      {sched.loading ? (
        <div className="ms-next ms-next-skel" aria-hidden="true">
          <span className="ms-skel-line" style={{ width: '30%' }} />
          <span className="ms-skel-line" style={{ width: '65%', height: 22 }} />
          <span className="ms-skel-line" style={{ width: '45%' }} />
          <span className="ms-skel-line" style={{ width: '100%', height: 56, borderRadius: 999 }} />
        </div>
      ) : next ? (
        <NextClass n={next} now={now} detailsLoading={detailsLoading} />
      ) : (
        <div className="ms-next ms-next-none">
          <p className="ms-next-kicker">Next live class</p>
          <h2 className="ms-next-title">{sched.failed && !Object.keys(sched.byRule).length ? "We couldn't load your schedule" : 'No live class coming up'}</h2>
          <p className="ms-next-by">
            {sched.failed && !Object.keys(sched.byRule).length
              ? 'Try reloading the page in a moment.'
              : 'Find something new to learn and pick a time.'}
          </p>
          <Link href="/stores" className="ms-join ms-join-ghost">Explore courses</Link>
        </div>
      )}

      {comingUp.length > 0 && (
        <div className="ms-block">
          <h2 className="ms-h2">Coming up</h2>
          <ul className="ms-list">
            {comingUp.map((c) => (
              <li key={`${c.r.rule_id}-${c.x.date}-${c.x.session}`} className="ms-lrow">
                <span className="ms-lrow-when">
                  <b>{dayLabel(c.startMs, now)}</b>
                  <i>{c.hasTime ? fmtTime(c.x.start_time) : ''}</i>
                </span>
                <span className="ms-lrow-body">
                  <span className="ms-lrow-name">{c.course || 'Your class'}</span>
                  <span className="ms-lrow-meta">Session {c.x.session} of {c.x.total_sessions}{c.teacher ? ` · with ${c.teacher}` : ''}</span>
                </span>
                {c.x.meeting_link ? (
                  <a className="ms-lrow-join" href={c.x.meeting_link} target="_blank" rel="noreferrer">Join</a>
                ) : (
                  <Link className="ms-lrow-view" href={`?rule=${c.r.rule_id}`}>Details</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ms-block">
        <h2 className="ms-h2">All my courses</h2>
        <ul className="ms-grid">
          {rules.map((r) => (
            <SubscriptionCard
              key={r.rule_id}
              r={r}
              course={details[r.rule_id]?.course}
              teacher={details[r.rule_id]?.teacher}
              detailsLoading={detailsLoading}
            />
          ))}
        </ul>
      </div>

      {past.length > 0 && (
        <div className="ms-block">
          <h2 className="ms-h2">Past sessions</h2>
          <ul className="ms-list ms-list-past">
            {past.map((c) => (
              <li key={`${c.r.rule_id}-${c.x.date}-${c.x.session}`} className="ms-lrow">
                <span className="ms-lrow-done" aria-hidden="true">
                  <svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span className="ms-lrow-body">
                  <span className="ms-lrow-name">{c.course || 'Your class'}</span>
                  <span className="ms-lrow-meta">
                    Session {c.x.session} of {c.x.total_sessions} · {fmtDate(c.x.date) || c.x.date}
                    {c.x.start_time ? ` · ${fmtTime(c.x.start_time)}` : ''}
                  </span>
                </span>
                <Link className="ms-lrow-view" href={`?rule=${c.r.rule_id}`}>View course</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// The big "next live class" card: what it is, when, how long until it starts,
// and one large Join button. The link is the session's real `meeting_link`
// — if the teacher hasn't shared it yet the button says so instead of
// pretending (same rule the course schedule already follows).
function NextClass({ n, now, detailsLoading }) {
  const live = n.hasTime && now >= n.startMs && now <= n.endMs;
  const time = fmtTime(n.x.start_time);
  const end = fmtTime(n.x.end_time);
  return (
    <section className={`ms-next${live ? ' is-live' : ''}`} aria-label="Your next live class">
      <p className="ms-next-kicker">{live ? 'Live now' : 'Next live class'}</p>
      {detailsLoading ? (
        <>
          <span className="ms-name-skel" aria-hidden="true" style={{ width: '60%', height: 24 }} />
          <span className="ms-name-skel" aria-hidden="true" style={{ width: 120, height: 12, marginTop: 8 }} />
        </>
      ) : (
        <>
          <h2 className="ms-next-title">{n.course || 'Your live class'}</h2>
          <p className="ms-next-by">{n.teacher ? `with ${n.teacher} · ` : ''}Session {n.x.session} of {n.x.total_sessions}</p>
        </>
      )}
      <p className="ms-next-when">
        <strong>{dayLabel(n.startMs, now)}</strong>
        {time ? ` · ${end ? `${time} – ${end}` : time}` : ''}
        <span className="ms-next-count">{untilText(n.startMs, n.endMs, n.hasTime, now)}</span>
      </p>
      <div className="ms-next-actions">
        {n.x.meeting_link ? (
          <a className="ms-join" href={n.x.meeting_link} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h5A1.5 1.5 0 0 1 10 4.5V6l3-1.8v7.6L10 10v1.5A1.5 1.5 0 0 1 8.5 13h-5A1.5 1.5 0 0 1 2 11.5z" fill="currentColor" /></svg>
            {live ? 'Join now' : 'Join class'}
          </a>
        ) : (
          <span className="ms-join is-wait" aria-disabled="true">Link not shared yet</span>
        )}
        <Link href={`?rule=${n.r.rule_id}`} className="ms-next-view">View course</Link>
      </div>
      {!n.x.meeting_link && (
        <p className="ms-next-note">Your teacher shares the meeting link for each session. It will appear here as soon as it's ready.</p>
      )}
    </section>
  );
}

function SubscriptionCard({ r, course, teacher, detailsLoading }) {
  // Pause/resume lives on the detail page only now — this card is
  // read-only status, per instruction: show the real state, don't act on it
  // from here.
  const cs = courseState(r);

  return (
    <li className="ms-card">
      <div className="ms-card-top">
        <div className="ms-card-who">
          {detailsLoading ? (
            <>
              <span className="ms-name-skel" aria-hidden="true" />
              <span className="ms-name-skel" aria-hidden="true" style={{ width: 70, height: 11 }} />
            </>
          ) : (
            <>
              <span className="ms-card-name">{course || 'This course'}</span>
              <span className="ms-card-id">by {teacher || 'the teacher'}</span>
            </>
          )}
        </div>
        {/* A running course shows a progress bar (below) instead of an "In progress" pill. */}
        {cs.cls !== 'progress' && cs.cls !== 'paused' && <span className={`ms-badge ms-badge-${cs.cls}`}>{cs.label}</span>}
      </div>
      {cs.cls !== 'declined' && <CourseProgress r={r} state={cs.cls} />}
      {cs.cls === 'progress' && !courseProgress(r) && <span className="ms-badge ms-badge-progress" style={{ justifySelf: 'start' }}>Ongoing</span>}
      <dl className="ms-card-facts">
        <div><dt>Amount</dt><dd>₹{Number(r.amount || 0).toLocaleString()}</dd></div>
        <div><dt>Starts</dt><dd>{fmtDate(r.start_schedule) || '—'}</dd></div>
        <div>
          <dt>{r.schedule_type === 2 ? 'Sessions' : 'Ends'}</dt>
          <dd>{r.schedule_type === 2 ? `${r.remaining_occurrence_count}/${r.occurrence_count} left` : fmtDate(r.end_schedule) || '—'}</dd>
        </div>
      </dl>
      <Link href={`?rule=${r.rule_id}`} className="ms-view">View details →</Link>
    </li>
  );
}

function Detail({ ruleId, session }) {
  const [state, setState] = useState('loading'); // loading | ok | error
  const [rule, setRule] = useState(null);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState('');

  // Pulled out so a mutating action can re-confirm the real, current rule
  // from the server afterwards, instead of only trusting an optimistic local
  // patch — the fastest way to guarantee "Paused"/"In progress" never drifts
  // from the truth, whatever the actual mechanism behind a reported "skipping
  // a class flips it back to in-progress" would turn out to be. Nothing in
  // `recurring/addVacationRule`'s own real source touches `is_paused` at all
  // (only `recurring/updateRecurringRule` does), so this refetch is a
  // safety net rather than a fix for a located bug in that endpoint.
  async function fetchRule() {
    const json = await yeloPost('recurring/getRuleDetails', {
      ...YELO_TENANT,
      user_id: YELO_TENANT.marketplace_user_id, // required, not used to filter — see file header
      vendor_id: session.vendorId,
      access_token: session.token,
      rule_id: ruleId,
    });
    return json?.status === 200 ? json?.data?.result?.[0] : null;
  }

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchRule().then((r) => {
      if (cancelled) return;
      if (r) { setRule(r); setState('ok'); } else { setState('error'); }
    });
    return () => { cancelled = true; };
  }, [ruleId, session]);

  // Locked against skipSession too (see there) — one mutating call to this
  // rule at a time, so a fast double-tap across the two actions can't race.
  async function togglePause() {
    if (!rule || pausing || skippingDate) return;
    const nextPaused = Number(rule.is_paused) === 1 ? 0 : 1;
    setPausing(true);
    setPauseError('');
    const r = await setRulePaused(rule.rule_id, rule.user_id, nextPaused, session);
    if (r?.status === 200) {
      const fresh = await fetchRule();
      if (fresh) setRule(fresh);
      else setRule((prev) => (prev ? { ...prev, is_paused: nextPaused } : prev));
    } else {
      setPauseError(r?.message || `Couldn't ${nextPaused ? 'pause' : 'resume'} this course — please try again.`);
    }
    setPausing(false);
  }

  // The per-session schedule for this rule — split by the backend into
  // `upcoming` and `completed`. Verified live against this tenant:
  // `recurring/list` with `rule_id` returns { upcoming[], completed[],
  // upcoming_count, completed_count }, each row carrying date, start_time,
  // session / total_sessions, is_skipped and an optional meeting_link.
  // Same required-but-not-filtered `user_id` convention as the calls above.
  const [sesState, setSesState] = useState('loading'); // loading | ok | error
  const [sessions, setSessions] = useState({ upcoming: [], completed: [] });

  useEffect(() => {
    let cancelled = false;
    setSesState('loading');
    yeloPost('recurring/list', {
      ...YELO_TENANT,
      user_id: YELO_TENANT.marketplace_user_id,
      vendor_id: session.vendorId,
      access_token: session.token,
      rule_id: ruleId,
      limit: 100,
      offset: 0,
    }).then((json) => {
      if (cancelled) return;
      if (json?.status === 200 && json?.data) {
        setSessions({
          upcoming: Array.isArray(json.data.upcoming) ? json.data.upcoming : [],
          completed: Array.isArray(json.data.completed) ? json.data.completed : [],
        });
        setSesState('ok');
      } else {
        setSesState('error');
      }
    });
    return () => { cancelled = true; };
  }, [ruleId, session]);

  // Skip one upcoming session — real endpoint, real payload (see
  // addVacationDates above).
  //
  // THE REAL BUG, fully traced this time in yelo-server's own source
  // (recurringController.js addVacationRule:1006-1093) — `vacation_dates`
  // is NOT "add these dates to the skip list". It's a full REPLACE: the
  // handler loads every date CURRENTLY skipped for this rule, then for each
  // date in the array you just sent, removes it from that "currently
  // skipped" set if it's already there (so re-sending an already-skipped
  // date correctly leaves it alone) — but ANYTHING LEFT in that set once the
  // loop is done (i.e. every date that WAS skipped but wasn't in the array
  // you just sent) gets UN-SKIPPED. Sending only the one new date, like this
  // used to, told the backend "the complete set of skipped dates is just
  // this one" — which is exactly why skipping a new session un-skipped every
  // other one already skipped. The fix is to always send the FULL set: every
  // date already skipped (upcoming or completed) plus the new one, never
  // just the new one alone.
  const [skippingDate, setSkippingDate] = useState(null);
  const [skipError, setSkipError] = useState('');

  async function skipSession(date) {
    if (!rule || skippingDate || pausing) return;
    const already = sessions.upcoming.find((s) => s.date === date)?.is_skipped;
    if (already) return;
    const existingSkipped = [...sessions.upcoming, ...sessions.completed]
      .filter((s) => s.is_skipped)
      .map((s) => s.date);
    const fullSkipSet = [...new Set([...existingSkipped, date])];
    setSkippingDate(date);
    setSkipError('');
    const r = await addVacationDates(rule.rule_id, rule.user_id, fullSkipSet, session);
    if (r?.status === 200) {
      setSessions((prev) => ({
        ...prev,
        upcoming: prev.upcoming.map((s) => (s.date === date ? { ...s, is_skipped: 1 } : s)),
      }));
      // Confirmed live that this endpoint never touches is_paused, but
      // re-checking anyway costs one cheap read and removes all doubt —
      // "Paused"/"In progress" always reflects what the server actually has
      // right after any action that touches this rule.
      const fresh = await fetchRule();
      if (fresh) setRule(fresh);
    } else {
      setSkipError(r?.message || "Couldn't skip that session — please try again.");
    }
    setSkippingDate(null);
  }

  if (state === 'loading') {
    return (
      <div className="ms-detail" aria-busy="true">
        <span className="ms-skel-line" style={{ width: '40%' }} />
        <span className="ms-skel-line" style={{ width: '70%' }} />
        <span className="ms-skel-line" style={{ width: '55%' }} />
      </div>
    );
  }
  if (state === 'error' || !rule) {
    return <EmptyCard title="Couldn't find that course" body="It may have been removed, or the link is out of date." cta={{ href: '?', label: '← Back to my courses' }} />;
  }

  const days = (rule.day_array || []).slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ');
  const className = rule.products?.[0]?.product?.product_name || rule.products?.[0]?.product?.name;

  return (
    <div className="ms-detail">
      <Link href="?" className="ms-back">← All courses</Link>
      <div className="ms-detail-top">
        <h2>{className || 'Class subscription'}</h2>
        {(() => { const cs = courseState(rule); return cs.cls !== 'progress' && cs.cls !== 'paused' ? <span className={`ms-badge ms-badge-${cs.cls}`}>{cs.label}</span> : null; })()}
      </div>
      <p className="ms-detail-sub">with {rule.merchant_name || 'the teacher'} · Recurring #{rule.rule_id}</p>
      {(() => { const cs = courseState(rule); return cs.cls !== 'declined' ? <CourseProgress r={rule} state={cs.cls} /> : null; })()}

      <dl className="ms-detail-facts">
        {days && <div><dt>Days</dt><dd>{days}</dd></div>}
        {rule.schedule_time && <div><dt>Time</dt><dd>{fmtTime(rule.schedule_time)}</dd></div>}
        <div><dt>Starts</dt><dd>{fmtDate(rule.start_schedule) || '—'}</dd></div>
        <div>
          <dt>{rule.schedule_type === 2 ? 'Sessions' : 'Ends'}</dt>
          <dd>{rule.schedule_type === 2 ? `${rule.remaining_occurrence_count}/${rule.occurrence_count} remaining` : fmtDate(rule.end_schedule) || '—'}</dd>
        </div>
        <div><dt>Per session</dt><dd>₹{Number(rule.amount || 0).toLocaleString()}</dd></div>
        <div><dt>Total</dt><dd>₹{Number(rule.total_recurring_amount || 0).toLocaleString()}</dd></div>
        <div><dt>Payment</dt><dd>{rule.payment_type === 'CASH' ? 'Pay at the session' : rule.payment_type || '—'}</dd></div>
        <div><dt>Attendee</dt><dd>{rule.customer_username || '—'}</dd></div>
      </dl>

      {(() => {
        const cs = courseState(rule);
        // Pausing/resuming a finished or declined course means nothing real
        // — only offer it while the subscription is genuinely still active
        // (running or already paused).
        if (cs.cls !== 'progress' && cs.cls !== 'paused') return null;
        const isPaused = cs.cls === 'paused';
        return (
          <div className="ms-pause-row">
            <button
              type="button"
              className={`ms-pause-btn${isPaused ? ' is-resume' : ''}`}
              onClick={togglePause}
              disabled={pausing || !!skippingDate}
            >
              {pausing ? (isPaused ? 'Resuming…' : 'Pausing…') : isPaused ? 'Resume course' : 'Pause course'}
            </button>
            {isPaused && <p className="ms-pause-note">New sessions won't be scheduled while this course is paused.</p>}
            {pauseError && <p className="ms-pause-error" role="alert">{pauseError}</p>}
          </div>
        );
      })()}

      <SessionSchedule
        state={sesState}
        sessions={sessions}
        onSkip={skipSession}
        skippingDate={skippingDate}
        skipError={skipError}
        actionsLocked={pausing}
      />
    </div>
  );
}

function SessionSchedule({ state, sessions, onSkip, skippingDate, skipError, actionsLocked }) {
  const [tab, setTab] = useState('upcoming'); // upcoming | completed

  if (state === 'loading') {
    return (
      <div className="ms-sessions" aria-busy="true">
        <span className="ms-skel-line" style={{ width: '35%' }} />
        <span className="ms-skel-line" style={{ width: '80%' }} />
        <span className="ms-skel-line" style={{ width: '65%' }} />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="ms-sessions">
        <p className="ms-sessions-err">Couldn't load the class schedule for this course. Try reloading the page.</p>
      </div>
    );
  }

  const upcoming = sessions.upcoming || [];
  const completed = sessions.completed || [];
  const rows = tab === 'upcoming' ? upcoming : completed;
  const emptyText = tab === 'upcoming'
    ? 'No upcoming classes — every session in this course is done.'
    : "No completed classes yet — the course hasn't started.";

  return (
    <div className="ms-sessions">
      <h3 className="ms-sessions-h">Class schedule</h3>
      <div className="ms-tabs" role="tablist" aria-label="Class schedule">
        <button
          type="button"
          role="tab"
          id="ms-tab-upcoming"
          aria-selected={tab === 'upcoming'}
          aria-controls="ms-panel-sessions"
          className={`ms-tab${tab === 'upcoming' ? ' is-active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming <span className="ms-tab-count">{upcoming.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="ms-tab-completed"
          aria-selected={tab === 'completed'}
          aria-controls="ms-panel-sessions"
          className={`ms-tab${tab === 'completed' ? ' is-active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed <span className="ms-tab-count">{completed.length}</span>
        </button>
      </div>

      <div
        id="ms-panel-sessions"
        role="tabpanel"
        aria-labelledby={tab === 'upcoming' ? 'ms-tab-upcoming' : 'ms-tab-completed'}
        className="ms-tabpanel"
      >
        {tab === 'upcoming' && skipError && <p className="ms-skip-error" role="alert">{skipError}</p>}
        {rows.length === 0 ? (
          <p className="ms-sgroup-empty">{emptyText}</p>
        ) : (
          <ol className={`ms-slist ms-slist-${tab}`}>
            {rows.map((s, i) => (
              <SessionRow
                key={`${s.session}-${s.date}-${i}`}
                s={s}
                kind={tab}
                onSkip={onSkip}
                skipping={skippingDate === s.date}
                skipDisabled={actionsLocked || (!!skippingDate && skippingDate !== s.date)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SessionRow({ s, kind, onSkip, skipping, skipDisabled }) {
  const time = fmtTime(s.start_time);
  const end = fmtTime(s.end_time);
  const skipped = !!s.is_skipped;
  const isUpcoming = kind === 'upcoming';

  return (
    <li className={`ms-srow${skipped ? ' is-skipped' : ''}`}>
      <span className="ms-snum" aria-hidden="true">{s.session}<i>/{s.total_sessions}</i></span>
      <span className="ms-sbody">
        <span className="ms-sdate">Session {s.session} · {fmtDate(s.date) || s.date}</span>
        <span className="ms-smeta">
          {time ? (end ? `${time} – ${end}` : time) : 'Time to be confirmed'}
          {skipped ? ' · Skipped' : ''}
        </span>
      </span>

      {isUpcoming ? (
        <span className="ms-srow-actions">
          {skipped ? (
            <span className="ms-slink ms-slink-skipped">Skipped</span>
          ) : (
            <>
              {s.meeting_link ? (
                <a className="ms-slink ms-slink-join" href={s.meeting_link} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h5A1.5 1.5 0 0 1 10 4.5V6l3-1.8v7.6L10 10v1.5A1.5 1.5 0 0 1 8.5 13h-5A1.5 1.5 0 0 1 2 11.5z" fill="currentColor"/></svg>
                  Join class
                </a>
              ) : (
                <span className="ms-slink ms-slink-wait" title="The teacher hasn't shared the meeting link for this session yet.">
                  Link not shared yet
                </span>
              )}
              <button
                type="button"
                className="ms-skip-btn"
                onClick={() => onSkip?.(s.date)}
                disabled={skipping || skipDisabled}
              >
                {skipping ? 'Skipping…' : 'Skip'}
              </button>
            </>
          )}
        </span>
      ) : (
        <span className="ms-slink ms-slink-done" aria-label="Class completed">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Done
        </span>
      )}
    </li>
  );
}

const css = `
.ms{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:44px 20px 72px; min-height:60vh; }
@media (min-width:820px){ .ms{ padding:64px 32px 96px; } }
.ms-frame{ max-width:760px; margin-inline:auto; }
.ms-frame > h1{ font-family:var(--brand-font-display); font-weight:650; letter-spacing:-.01em; font-size:clamp(1.4rem,3.4vw,1.9rem); margin:0 0 24px; }

.ms-grid{ list-style:none; margin:0; padding:0; display:grid; gap:14px; grid-template-columns:1fr; }
@media (min-width:640px){ .ms-grid{ grid-template-columns:repeat(2,1fr); } }
.ms-card{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:18px; display:grid; gap:12px; }
.ms-card-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.ms-card-who{ display:grid; gap:3px; min-width:0; }
.ms-card-name{ font-weight:650; font-size:.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ms-card-id{ font-size:.72rem; color:var(--brand-ink-soft); }
.ms-name-skel{ display:block; width:110px; height:14px; border-radius:5px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:ms-sweep 1.4s ease-in-out infinite; }
.ms-card-facts{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.ms-card-facts dt{ font-size:.64rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--brand-ink-soft); margin-bottom:2px; }
.ms-card-facts dd{ margin:0; font-weight:600; font-size:.82rem; }
.ms-view{ justify-self:start; color:var(--brand-accent); font-weight:650; font-size:.86rem; text-decoration:none; }
.ms-view:hover{ text-decoration:underline; }
.ms-badge{ padding:3px 10px; border-radius:980px; font-size:.7rem; font-weight:700; letter-spacing:.02em; white-space:nowrap; }
.ms-badge-progress{ background:var(--brand-accent-soft); color:var(--brand-accent); }
.ms-badge-complete{ background:color-mix(in srgb, #2f9e5f 18%, transparent); color:#1c7a45; }
[data-theme="dark"] .ms-badge-complete{ color:#6fdb9c; }
.ms-badge-declined{ background:color-mix(in srgb, #c0392b 16%, transparent); color:#a4322a; }
[data-theme="dark"] .ms-badge-declined{ color:#ef8f86; }
.ms-badge-paused{ background:color-mix(in srgb, var(--brand-ink-soft) 18%, transparent); color:var(--brand-ink-soft); }

.ms-pause-row{ margin-top:16px; padding-top:16px; border-top:1px solid var(--brand-line); display:grid; gap:8px; justify-items:start; }
.ms-pause-btn{
  padding:10px 20px; border-radius:980px; border:1px solid var(--brand-line);
  background:var(--brand-paper); color:var(--brand-ink); font:inherit; font-weight:650; font-size:.86rem; cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease), background var(--motion) var(--motion-ease);
}
.ms-pause-btn:hover{ border-color:color-mix(in srgb, var(--brand-ink) 40%, var(--brand-line)); }
.ms-pause-btn.is-resume{ background:var(--brand-accent); color:var(--brand-accent-ink); border-color:var(--brand-accent); }
.ms-pause-btn.is-resume:hover{ filter:brightness(1.06); }
.ms-pause-btn:disabled{ opacity:.6; cursor:default; }
.ms-pause-btn:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.ms-pause-note{ margin:0; font-size:.8rem; color:var(--brand-ink-soft); }
.ms-pause-error{ margin:0; font-size:.82rem; color:#a4322a; }
[data-theme="dark"] .ms-pause-error{ color:#ef8f86; }

.ms-empty{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:32px; text-align:center; display:grid; gap:8px; justify-items:center; }
.ms-empty-t{ margin:0; font-weight:650; font-size:1rem; }
.ms-empty-b{ margin:0; color:var(--brand-ink-soft); font-size:.88rem; max-width:36ch; }
.ms-cta{ margin-top:6px; padding:10px 20px; border-radius:980px; background:var(--brand-accent); color:var(--brand-accent-ink); font-weight:650; font-size:.86rem; text-decoration:none; }

.ms-detail{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:24px; display:grid; gap:6px; }
.ms-back{ justify-self:start; color:var(--brand-ink-soft); font-size:.82rem; text-decoration:none; margin-bottom:10px; }
.ms-back:hover{ color:var(--brand-accent); }
.ms-detail-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.ms-detail-top h2{ margin:0; font-family:var(--brand-font-display); font-weight:650; font-size:1.2rem; }
.ms-detail-sub{ margin:0 0 16px; color:var(--brand-ink-soft); font-size:.86rem; }
.ms-detail-facts{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
@media (min-width:560px){ .ms-detail-facts{ grid-template-columns:repeat(4,1fr); } }
.ms-detail-facts dt{ font-size:.66rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--brand-ink-soft); margin-bottom:3px; }
.ms-detail-facts dd{ margin:0; font-weight:600; font-size:.88rem; }

.ms-skel-line{ display:block; height:13px; border-radius:6px; margin-bottom:10px; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:ms-sweep 1.4s ease-in-out infinite; }
@keyframes ms-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }
.ms-skel{ border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface); padding:18px; display:grid; }

@media (prefers-reduced-motion: reduce){ .ms-skel-line, .ms-name-skel{ animation:none; } }

.ms-sessions{ margin-top:22px; padding-top:20px; border-top:1px solid var(--brand-line); display:grid; gap:14px; }
.ms-sessions-err{ margin:0; color:var(--brand-ink-soft); font-size:.86rem; }
.ms-sessions-h{ margin:0; font-family:var(--brand-font-display); font-weight:650; font-size:1rem; }

.ms-tabs{ display:inline-flex; gap:4px; padding:4px; border:1px solid var(--brand-line); border-radius:980px; background:var(--brand-paper); align-self:start; }
.ms-tab{ appearance:none; border:0; cursor:pointer; display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:980px; background:transparent; color:var(--brand-ink-soft); font-family:var(--brand-font-body); font-weight:650; font-size:.82rem; transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease); }
.ms-tab:hover{ color:var(--brand-ink); }
.ms-tab.is-active{ background:var(--brand-surface); color:var(--brand-ink); box-shadow:0 1px 3px color-mix(in srgb, var(--brand-ink) 14%, transparent); }
.ms-tab.is-active:focus-visible, .ms-tab:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.ms-tab-count{ min-width:20px; height:18px; padding:0 5px; display:inline-grid; place-items:center; border-radius:980px; font-size:.68rem; font-weight:700; background:var(--brand-accent-soft); color:var(--brand-accent); }
.ms-tab.is-active .ms-tab-count{ background:var(--brand-accent); color:var(--brand-accent-ink); }

.ms-tabpanel{ margin-top:2px; }
.ms-sgroup-empty{ margin:0; padding:16px 12px; color:var(--brand-ink-soft); font-size:.84rem; border:1px dashed var(--brand-line); border-radius:var(--radius); }

.ms-slist{ list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.ms-srow{ display:flex; align-items:center; gap:12px; padding:11px 12px; border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-paper); }
.ms-srow.is-skipped{ opacity:.55; }
.ms-snum{ flex:none; width:38px; height:38px; border-radius:50%; display:grid; place-items:center; background:var(--brand-accent-soft); color:var(--brand-accent); font-weight:700; font-size:.86rem; line-height:1; }
.ms-snum i{ font-style:normal; font-size:.62rem; opacity:.7; }
.ms-slist-completed .ms-snum{ background:color-mix(in srgb, var(--brand-ink-soft) 14%, transparent); color:var(--brand-ink-soft); }
.ms-sbody{ display:grid; gap:2px; min-width:0; flex:1; }
.ms-sdate{ font-weight:600; font-size:.86rem; }
.ms-smeta{ font-size:.76rem; color:var(--brand-ink-soft); }

.ms-slink{ flex:none; display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:980px; font-weight:650; font-size:.78rem; text-decoration:none; white-space:nowrap; }
.ms-slink svg{ width:14px; height:14px; }
.ms-slink-join{ background:var(--brand-accent); color:var(--brand-accent-ink); }
.ms-slink-join:hover{ filter:brightness(1.06); }
.ms-slink-join:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.ms-slink-wait{ background:transparent; border:1px dashed var(--brand-line); color:var(--brand-ink-soft); cursor:default; }
.ms-slink-skipped{ background:transparent; border:1px solid var(--brand-line); color:var(--brand-ink-soft); }
.ms-slink-done{ background:transparent; color:var(--brand-ink-soft); padding-inline:6px; }

.ms-srow-actions{ flex:none; display:flex; align-items:center; gap:8px; }
.ms-skip-btn{
  flex:none; padding:7px 13px; border-radius:980px; border:1px solid var(--brand-line);
  background:transparent; color:var(--brand-ink-soft); font:inherit; font-weight:650; font-size:.78rem; cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.ms-skip-btn:hover{ border-color:color-mix(in srgb, var(--brand-ink) 40%, var(--brand-line)); color:var(--brand-ink); }
.ms-skip-btn:disabled{ opacity:.6; cursor:default; }
.ms-skip-btn:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.ms-skip-error{ margin:0 0 4px; font-size:.82rem; color:#a4322a; }
[data-theme="dark"] .ms-skip-error{ color:#ef8f86; }

@media (max-width:520px){
  .ms-srow{ flex-wrap:wrap; }
  .ms-sbody{ flex-basis:calc(100% - 50px); }
  .ms-srow-actions{ margin-left:50px; }
}
@media (prefers-reduced-motion: reduce){ .ms-tab{ transition:none; } }

/* ---------- student "home": next class, coming up, past sessions ---------- */
.ms-hello{ margin:-10px 0 20px; color:var(--brand-ink-soft); font-size:1rem; }
.ms-block{ margin-top:34px; }
.ms-h2{ font-family:var(--brand-font-display); font-weight:700; letter-spacing:-.01em; font-size:1.2rem; margin:0 0 14px; }

.ms-next{
  position:relative; overflow:hidden; display:grid; gap:8px;
  padding:24px 22px 24px; border-radius:calc(var(--radius-lg) + 6px);
  border:1px solid color-mix(in srgb, var(--brand-accent) 28%, var(--brand-line));
  background:
    radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--brand-accent) 16%, var(--brand-accent-soft)), var(--brand-accent-soft) 72%);
  box-shadow:0 22px 48px -30px color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
@media (min-width:640px){ .ms-next{ padding:30px 32px; } }
.ms-next-kicker{
  margin:0; font-size:.72rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
  color:var(--brand-accent);
}
.ms-next.is-live .ms-next-kicker::before{
  content:""; display:inline-block; width:8px; height:8px; margin-right:8px; border-radius:50%;
  background:var(--brand-accent); vertical-align:middle;
}
.ms-next-title{
  margin:2px 0 0; font-family:var(--brand-font-display); font-weight:700; letter-spacing:-.02em;
  line-height:1.1; font-size:clamp(1.5rem, 5.4vw, 2.2rem); text-wrap:balance;
}
.ms-next-by{ margin:0; color:var(--brand-ink-soft); font-size:.95rem; }
.ms-next-when{ margin:8px 0 0; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:1.02rem; }
.ms-next-count{
  display:inline-block; padding:5px 12px; border-radius:980px; font-size:.82rem; font-weight:700;
  background:var(--brand-surface); color:var(--brand-ink); border:1px solid var(--brand-line);
}
.ms-next-actions{ display:flex; flex-wrap:wrap; align-items:center; gap:12px 18px; margin-top:14px; }
.ms-join{
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  min-height:56px; padding:0 34px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:700; font-size:1.08rem; text-decoration:none;
  box-shadow:0 14px 28px -14px color-mix(in srgb, var(--brand-accent) 70%, transparent);
  transition:filter var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
  touch-action:manipulation;
}
.ms-join svg{ width:20px; height:20px; }
.ms-join:hover{ filter:brightness(1.07); }
.ms-join:active{ transform:translateY(1px); }
.ms-join.is-wait{
  background:var(--brand-surface); color:var(--brand-ink-soft); box-shadow:none; cursor:default;
  border:1px dashed var(--brand-line); font-size:.98rem; font-weight:650;
}
.ms-join.is-wait:hover{ filter:none; }
.ms-join-ghost{ background:var(--brand-surface); color:var(--brand-accent); border:1px solid var(--brand-accent); box-shadow:none; justify-self:start; margin-top:8px; }
@media (max-width:560px){ .ms-next-actions .ms-join{ width:100%; } }
.ms-next-view{ color:var(--brand-accent); font-weight:650; font-size:.92rem; text-decoration:none; }
.ms-next-view:hover{ text-decoration:underline; }
.ms-next-note{ margin:4px 0 0; font-size:.82rem; color:var(--brand-ink-soft); max-width:52ch; }
.ms-next-skel{ gap:14px; }
.ms-next-none{ background:var(--brand-surface); border-color:var(--brand-line); box-shadow:none; }

.ms-list{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.ms-lrow{
  display:flex; align-items:center; gap:14px; padding:14px 16px;
  border:1px solid var(--brand-line); border-radius:var(--radius-lg); background:var(--brand-surface);
}
.ms-lrow-when{ flex:none; display:grid; min-width:84px; }
.ms-lrow-when b{ font-family:var(--brand-font-display); font-size:.92rem; }
.ms-lrow-when i{ font-style:normal; font-size:.8rem; color:var(--brand-ink-soft); }
.ms-lrow-body{ flex:1; min-width:0; display:grid; gap:2px; }
.ms-lrow-name{ font-weight:650; font-size:.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ms-lrow-meta{ font-size:.78rem; color:var(--brand-ink-soft); }
.ms-lrow-join{
  flex:none; display:inline-flex; align-items:center; min-height:40px; padding:0 18px; border-radius:980px;
  background:var(--brand-accent); color:var(--brand-accent-ink); font-weight:700; font-size:.86rem; text-decoration:none;
}
.ms-lrow-join:hover{ filter:brightness(1.07); }
.ms-lrow-view{ flex:none; color:var(--brand-accent); font-weight:650; font-size:.84rem; text-decoration:none; white-space:nowrap; }
.ms-lrow-view:hover{ text-decoration:underline; }
.ms-lrow-done{
  flex:none; display:grid; place-items:center; width:30px; height:30px; border-radius:50%;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.ms-lrow-done svg{ width:14px; height:14px; }
.ms-list-past .ms-lrow{ background:transparent; }
@media (max-width:520px){
  .ms-lrow{ flex-wrap:wrap; }
  .ms-lrow-when{ min-width:0; grid-auto-flow:column; gap:8px; align-items:baseline; }
  .ms-lrow-body{ flex-basis:100%; order:3; }
}
:where(.ms) .ms-join:focus-visible, :where(.ms) .ms-lrow-join:focus-visible, :where(.ms) .ms-lrow-view:focus-visible, :where(.ms) .ms-next-view:focus-visible{
  outline:3px solid var(--brand-accent); outline-offset:3px; border-radius:980px;
}
@media (prefers-reduced-motion: reduce){ .ms-join{ transition:none; } }

/* ---------- course progress bar (replaces the "In progress" pill) ---------- */
.ms-prog{ display:grid; gap:6px; }
.ms-prog-track{
  position:relative; height:10px; border-radius:999px; overflow:hidden;
  background:var(--brand-accent-soft); border:1px solid color-mix(in srgb, var(--brand-accent) 22%, var(--brand-line));
}
.ms-prog-fill{
  position:absolute; inset:0; border-radius:999px;
  background:var(--brand-accent);
  transition:clip-path .9s var(--motion-ease);
}
.ms-prog-paused .ms-prog-fill{ background:var(--brand-ink-soft); }
.ms-prog-label{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); }
.ms-prog-label b{ font-weight:650; color:var(--brand-ink); }
.ms-detail .ms-prog{ margin:4px 0 18px; max-width:420px; }
@media (prefers-reduced-motion: reduce){ .ms-prog-fill{ transition:none; } }
`;
