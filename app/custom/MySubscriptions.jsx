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
 * The list call's own columns don't include a teacher name (verified: only
 * rule_id/status/amount/schedule/occurrence fields), so each unique store
 * id in the results is resolved to a name with one follow-up call to
 * `marketplace_get_city_storefronts_single_v2` (the real single-store
 * lookup this storefront's own store page already uses), deduped so a
 * customer with N rules at the same two teachers only costs 2 calls, not N.
 * The detail call already includes `merchant_name`, so no extra lookup
 * there.
 *
 * Self-contained, direct-to-backend calls — same established pattern as
 * SubscribeScheduler/ClassCheckout/SubscriptionConfirm.
 */
import { Suspense, useEffect, useState } from 'react';
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
  const [names, setNames] = useState({}); // store user_id -> store_name
  // The rule id is on every list row from the FIRST response and never
  // changes; the teacher name needs a second round of calls (see below) and
  // arrives a beat later. Showing the id AS the heading, then swapping the
  // whole heading's text for the name the moment it resolves, is what read
  // as a flash/blink — "Recurring #805" replaced by "QA X" mid-render. Fixed
  // by never using one as a stand-in for the other: the id is its own
  // always-visible line from the start, and the name has its own reserved
  // line that shows a skeleton (not blank) until resolved, so nothing already
  // on screen ever gets swapped for something else.
  const [namesLoading, setNamesLoading] = useState(true);

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

        // Resolve each distinct teacher's name — the list columns don't
        // carry it. Deduped so repeat teachers cost one call each, not one
        // per rule.
        const ids = [...new Set(result.map((r) => r.user_id).filter(Boolean))];
        if (!ids.length) { setNamesLoading(false); return; }
        const resolved = await Promise.all(ids.map((id) =>
          yeloPost('marketplace_get_city_storefronts_single_v2', { ...YELO_TENANT, ...COORDS, user_id: id, vendor_id: 0, source: 0 })
            .then((j) => [id, (Array.isArray(j.data) ? j.data[0] : j.data)?.store_name || null])
        ));
        if (!cancelled) { setNames(Object.fromEntries(resolved)); setNamesLoading(false); }
      } else {
        setState('error');
      }
    });
    return () => { cancelled = true; };
  }, [session]);

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
    <ul className="ms-grid">
      {rules.map((r) => (
        <SubscriptionCard
          key={r.rule_id}
          r={r}
          name={names[r.user_id]}
          namesLoading={namesLoading}
        />
      ))}
    </ul>
  );
}

function SubscriptionCard({ r, name, namesLoading }) {
  // Pause/resume lives on the detail page only now — this card is
  // read-only status, per instruction: show the real state, don't act on it
  // from here.
  const cs = courseState(r);

  return (
    <li className="ms-card">
      <div className="ms-card-top">
        <div className="ms-card-who">
          {namesLoading ? (
            <span className="ms-name-skel" aria-hidden="true" />
          ) : (
            <span className="ms-card-name">{name || 'This teacher'}</span>
          )}
          <span className="ms-card-id">Recurring #{r.rule_id}</span>
        </div>
        <span className={`ms-badge ms-badge-${cs.cls}`}>{cs.label}</span>
      </div>
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

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    yeloPost('recurring/getRuleDetails', {
      ...YELO_TENANT,
      user_id: YELO_TENANT.marketplace_user_id, // required, not used to filter — see file header
      vendor_id: session.vendorId,
      access_token: session.token,
      rule_id: ruleId,
    }).then((json) => {
      if (cancelled) return;
      const r = json?.status === 200 ? json?.data?.result?.[0] : null;
      if (r) { setRule(r); setState('ok'); } else { setState('error'); }
    });
    return () => { cancelled = true; };
  }, [ruleId, session]);

  async function togglePause() {
    if (!rule || pausing) return;
    const nextPaused = Number(rule.is_paused) === 1 ? 0 : 1;
    setPausing(true);
    setPauseError('');
    const r = await setRulePaused(rule.rule_id, rule.user_id, nextPaused, session);
    setPausing(false);
    if (r?.status === 200) {
      setRule((prev) => (prev ? { ...prev, is_paused: nextPaused } : prev));
    } else {
      setPauseError(r?.message || `Couldn't ${nextPaused ? 'pause' : 'resume'} this course — please try again.`);
    }
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
        {(() => { const cs = courseState(rule); return <span className={`ms-badge ms-badge-${cs.cls}`}>{cs.label}</span>; })()}
      </div>
      <p className="ms-detail-sub">with {rule.merchant_name || 'the teacher'} · Recurring #{rule.rule_id}</p>

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
              disabled={pausing}
            >
              {pausing ? (isPaused ? 'Resuming…' : 'Pausing…') : isPaused ? 'Resume course' : 'Pause course'}
            </button>
            {isPaused && <p className="ms-pause-note">New sessions won't be scheduled while this course is paused.</p>}
            {pauseError && <p className="ms-pause-error" role="alert">{pauseError}</p>}
          </div>
        );
      })()}

      <SessionSchedule state={sesState} sessions={sessions} />
    </div>
  );
}

function SessionSchedule({ state, sessions }) {
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
        {rows.length === 0 ? (
          <p className="ms-sgroup-empty">{emptyText}</p>
        ) : (
          <ol className={`ms-slist ms-slist-${tab}`}>
            {rows.map((s, i) => (
              <SessionRow key={`${s.session}-${s.date}-${i}`} s={s} kind={tab} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SessionRow({ s, kind }) {
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
        skipped ? (
          <span className="ms-slink ms-slink-skipped">Skipped</span>
        ) : s.meeting_link ? (
          <a className="ms-slink ms-slink-join" href={s.meeting_link} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h5A1.5 1.5 0 0 1 10 4.5V6l3-1.8v7.6L10 10v1.5A1.5 1.5 0 0 1 8.5 13h-5A1.5 1.5 0 0 1 2 11.5z" fill="currentColor"/></svg>
            Join class
          </a>
        ) : (
          <span className="ms-slink ms-slink-wait" title="The teacher hasn't shared the meeting link for this session yet.">
            Link not shared yet
          </span>
        )
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

@media (max-width:520px){
  .ms-srow{ flex-wrap:wrap; }
  .ms-sbody{ flex-basis:calc(100% - 50px); }
  .ms-slink{ margin-left:50px; }
}
@media (prefers-reduced-motion: reduce){ .ms-tab{ transition:none; } }
`;
