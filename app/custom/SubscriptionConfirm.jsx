'use client';
/**
 * SubscriptionConfirm — replaces the printed-receipt confirmation for a
 * SUBSCRIPTION specifically. `OrderReceipt` (the registered app's own
 * component) is a till-receipt metaphor built for a single purchase of
 * physical/one-off items — barcode, item lines, "Thank you — see you
 * again". A recurring class isn't a purchase that's over; it's a schedule
 * that's just started, so this shows the schedule instead of a receipt.
 *
 * Reads the rule BACK from the real backend (`recurring/getRuleDetails`)
 * rather than trusting only what the browser sent — same principle as
 * OrderReceipt re-fetching by job id: what's confirmed is what the store's
 * own record says, not our optimistic snapshot. Endpoint/response shape
 * verified live: yelo-server modules/recurring/controllers/
 * recurringController.js getRuleDetails (fields read below are exactly
 * what a real call returned for a real rule created by this storefront's
 * own subscribe flow).
 *
 * Self-contained (direct-to-backend call, no proxy) — same established
 * pattern as SubscribeScheduler.jsx/ClassCheckout.jsx.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.freelancer.jungleworks.me',
  dual_user_key: 0,
  language: 'en',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const STATUS = { 0: 'pending', 1: 'accepted', 2: 'rejected' };

export default function SubscriptionConfirm({ ruleId, storeId, vendorId, accessToken, storeName }) {
  const [rule, setRule] = useState(null);
  const [state, setState] = useState(ruleId ? 'loading' : 'error'); // loading | ok | error

  useEffect(() => {
    if (!ruleId || !vendorId || !accessToken) { setState('error'); return; }
    let cancelled = false;
    fetch(`${YELO_BASE}/recurring/getRuleDetails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
      body: JSON.stringify({ ...YELO_TENANT, user_id: storeId, vendor_id: vendorId, access_token: accessToken, rule_id: ruleId }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const r = json?.status === 200 ? json?.data?.result?.[0] : null;
        if (r) { setRule(r); setState('ok'); } else { setState('error'); }
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [ruleId, storeId, vendorId, accessToken]);

  const days = (rule?.day_array || []).slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ');
  const time = fmtTime(rule?.schedule_time);
  const className = rule?.products?.[0]?.product?.product_name || rule?.products?.[0]?.product?.name;
  const merchant = rule?.merchant_name || storeName;
  const status = STATUS[rule?.status] || 'pending';

  return (
    <div className="sc-wrap">
      <div className="sc-card">
        <div className="sc-mark" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
            <path d="M8.5 15l2.2 2.2L15.5 13" />
          </svg>
        </div>
        <p className="sc-eyebrow">Subscription {status === 'pending' ? 'submitted' : status === 'rejected' ? 'declined' : 'confirmed'}</p>
        <h1 className="sc-title">{className ? `You're set for ${className}` : "You're subscribed"}</h1>
        {status === 'pending' && (
          <p className="sc-note">{merchant || 'The teacher'} confirms new subscriptions before the first session — you'll hear back shortly.</p>
        )}
        {status === 'rejected' && (
          <p className="sc-note">This subscription wasn't accepted. Nothing has been charged for future sessions.</p>
        )}

        {state === 'loading' && (
          <div className="sc-skel" aria-busy="true">
            <span className="sc-skel-line" style={{ width: '70%' }} />
            <span className="sc-skel-line" style={{ width: '55%' }} />
            <span className="sc-skel-line" style={{ width: '40%' }} />
          </div>
        )}

        {state === 'ok' && rule && (
          <dl className="sc-facts">
            {merchant && <div><dt>Teacher</dt><dd>{merchant}</dd></div>}
            {days && <div><dt>Days</dt><dd>{days}</dd></div>}
            {time && <div><dt>Time</dt><dd>{time}</dd></div>}
            <div><dt>Starts</dt><dd>{fmtDate(rule.start_schedule) || '—'}</dd></div>
            <div>
              <dt>Ends</dt>
              <dd>{rule.schedule_type === 2 ? `After ${rule.occurrence_count} session${rule.occurrence_count === 1 ? '' : 's'}` : fmtDate(rule.end_schedule) || '—'}</dd>
            </div>
            <div><dt>Recurring id</dt><dd>#{rule.rule_id}</dd></div>
          </dl>
        )}

        {state === 'error' && (
          <p className="sc-note">Saved — we couldn't load the confirmed details just now, but your subscription id is <b>#{ruleId}</b>. It'll show up in My subscriptions.</p>
        )}

        <div className="sc-actions">
          <Link href={`/p/my-subscriptions${ruleId ? `?rule=${ruleId}` : ''}`} className="sc-cta">View my subscription</Link>
          <Link href="/stores" className="sc-ghost">Browse more classes</Link>
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
.sc-wrap{ display:flex; justify-content:center; padding:8px 4px 12px; }
.sc-card{
  width:100%; max-width:460px; background:var(--brand-surface); border:1px solid var(--brand-line);
  border-radius:var(--radius-lg); padding:32px 26px 28px; text-align:center;
  box-shadow:0 1px 3px color-mix(in srgb, var(--brand-ink) 6%, transparent);
  animation:sc-in .5s var(--motion-ease) both;
}
@keyframes sc-in{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }
.sc-mark{
  width:56px; height:56px; margin:0 auto 14px; border-radius:980px; display:grid; place-items:center;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.sc-eyebrow{ margin:0 0 4px; font-size:.74rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--brand-ink-soft); }
.sc-title{ margin:0 0 8px; font-family:var(--brand-font-display); font-weight:650; letter-spacing:-.01em; font-size:clamp(1.2rem,3vw,1.5rem); }
.sc-note{ margin:0 0 6px; font-size:.86rem; line-height:1.5; color:var(--brand-ink-soft); }

.sc-skel{ display:grid; gap:9px; margin:18px 0 4px; }
.sc-skel-line{ height:12px; border-radius:6px; margin:0 auto; background:linear-gradient(90deg, var(--brand-accent-soft) 25%, var(--brand-line) 50%, var(--brand-accent-soft) 75%); background-size:200% 100%; animation:sc-sweep 1.4s ease-in-out infinite; }
@keyframes sc-sweep{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

.sc-facts{ margin:18px 0 4px; display:grid; grid-template-columns:repeat(2,1fr); gap:14px; text-align:left; padding:16px; background:var(--brand-paper); border-radius:var(--radius); }
.sc-facts dt{ font-size:.68rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--brand-ink-soft); margin-bottom:2px; }
.sc-facts dd{ margin:0; font-weight:600; font-size:.88rem; }

.sc-actions{ display:grid; gap:9px; margin-top:20px; }
.sc-cta{
  display:block; padding:13px 18px; border-radius:var(--radius); background:var(--brand-accent); color:var(--brand-accent-ink);
  font-family:var(--brand-font-display); font-weight:650; font-size:.94rem; text-decoration:none;
  transition:filter var(--motion) var(--motion-ease);
}
.sc-cta:hover{ filter:brightness(1.06); }
.sc-ghost{ display:block; padding:10px 18px; color:var(--brand-ink-soft); font-size:.86rem; text-decoration:none; }
.sc-ghost:hover{ color:var(--brand-ink); text-decoration:underline; }

@media (prefers-reduced-motion: reduce){ .sc-card{ animation:none; } .sc-skel-line{ animation:none; } }
`;
