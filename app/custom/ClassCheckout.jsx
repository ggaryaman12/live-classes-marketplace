'use client';
/**
 * ClassCheckout — checkout for a marketplace of LIVE ONLINE classes, not
 * physical goods. The registered `CheckoutPanel` (app/components/CheckoutPanel.jsx)
 * is built for delivery/self-pickup commerce: it always shows a "Deliver to
 * me / I'll pick it up" toggle and a typed delivery address, neither of which
 * mean anything for a class a child joins over video. Rebuilt here so a parent
 * never sees a "delivery address" field for a video call.
 *
 * The real backend still requires an address string and a lat/lng on every
 * order (`job_pickup_address`, `job_pickup_latitude/longitude` are mandatory
 * on `create_task_via_vendor_v2` — see docs/YELO_API_REFERENCE.md §4, and
 * `app/lib/order.js` REQUIRED_ORDER_FIELDS). Rather than asking a parent to
 * type an address for something that isn't delivered anywhere, this sends a
 * fixed "online, no delivery" placeholder + a default lat/lng behind the
 * scenes, and always books as self-pickup (self_pickup:1) so no delivery
 * charge is computed. That default is invisible to the parent — the UI only
 * asks for who's attending and how they'll pay.
 *
 * Wired to the same real, same-origin routes the registered panel uses:
 * `/api/bill` -> app/lib/api.js getBill (`get_bill_breakdown`)
 * `/api/order` -> app/lib/api.js placeOrder (`create_task_via_vendor_v2`)
 * `/api/wallet` -> app/lib/api.js getWallet
 * Session via `../lib/session`, cart via `../lib/cart` — the same real,
 * already-verified contracts the rest of this storefront uses. Self-contained
 * otherwise, per this workspace's no-cross-import rule, except for the
 * confirmed-real siblings `../lib/*` and `../components/{BillLines,OrderReceipt}`
 * (both plain, presentational, and already used by the registered panel).
 *
 * SUBSCRIPTION ORDERS DON'T GO THROUGH `create_task_via_vendor_v2`.
 * Traced from the real client (yelo-marketplace-webapp
 * payment.component.ts:5786-5804 `createTask()`): when `orderType ===
 * 'subscription'` AND the chosen payment method is one that doesn't need an
 * online gateway redirect (CASH, PAY_LATER, or WALLET — the only three this
 * storefront ever offers), it calls `createRecurrenceTask()` instead of the
 * normal create-task flow. That posts to `recurring/saveRecurringTask`
 * (payment.service.ts:467-475), not `create_task_via_vendor_v2` — a
 * DIFFERENT endpoint, confirmed against the real Joi schema at
 * yelo-server/modules/recurring/validators/recurringValidator.js:190-220
 * and handler at .../recurring/controllers/recurringController.js:1258. Its
 * body is the day/time recurrence fields (`day_array`, `schedule_time`,
 * `start_schedule`, `end_schedule`/`occurrence_count`, `cycle_type`) PLUS a
 * `request_body` field — the exact same JSON.stringify'd payload
 * `create_task_via_vendor_v2` would have taken (built here with the same
 * `buildOrderBody()` used for a one-time order) — which the backend uses as
 * the template for each individual class session it schedules. Response
 * carries `data.rule_id`, not `data.job_id` (recurringController.js:1452).
 *
 * `cycle_type` is a real day-count multiplier, not an ordinal — 15 for
 * Fortnight, 30 for Monthly (yelo-server recurringConstants.js CYCLE_TYPE),
 * matching the fix already made in SubscribeScheduler.jsx.
 *
 * No same-origin proxy exists for this endpoint (unlike /api/bill,
 * /api/order, /api/wallet), so it's called directly against the real
 * backend — the same already-verified-working pattern SubscribeScheduler.jsx
 * uses for getRecurringSlots/get_bill_breakdown; this backend allows it from
 * the browser, no proxy needed.
 */
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '../lib/cart';
import { getSession, setSession as saveSession } from '../lib/session';
import { PAYMENT, buildOrderBody } from '../lib/order';
import { apiPath } from '../lib/apiPath';
import BillLines from '../components/BillLines';
import OrderReceipt from '../components/OrderReceipt';
import SubscriptionConfirm from './SubscriptionConfirm';

// Meaningless for an online class, but the backend requires SOME lat/lng on
// every order — see the note above. Never shown to the parent.
const ONLINE_PLACEHOLDER = {
  text: 'Online class — no delivery, joins by video link',
  lat: 28.61482,
  lng: 77.219989,
};

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.freelancer.jungleworks.me',
  dual_user_key: 0,
  language: 'en',
};
const RECURRING_PAYMENT_METHODS = [PAYMENT.CASH, PAYMENT.WALLET, PAYMENT.PAYLATER];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtClock(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '—';
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const post = (url, body) =>
  fetch(apiPath(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false, unreachable: true }));

const yeloPost = (path, body) =>
  fetch(`${YELO_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ status: 0, unreachable: true }));

export default function ClassCheckout(props) {
  return (
    <Suspense fallback={null}>
      <ClassCheckoutInner {...props} />
    </Suspense>
  );
}

// useSearchParams() (needed to detect a subscription checkout, per the note
// above) requires a Suspense boundary in the app router — same pattern
// SubscribeScheduler.jsx and RecurringSummary.jsx already use.
function ClassCheckoutInner({
  title = 'Confirm enrollment',
  paymentLabel = 'How you’ll pay',
  summaryLabel = 'Your enrollment',
  ctaLabel = 'Confirm & enroll',
  allowCash = true,
  allowWallet = false,
}) {
  const cart = useCart();
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSessionState] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [bill, setBill] = useState(null);
  const [billing, setBilling] = useState(false);
  const [billFailed, setBillFailed] = useState(false);
  const [wallet, setWallet] = useState({ balance: 0, enabled: false });
  const [pay, setPay] = useState(PAYMENT.CASH);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [error, setError] = useState('');
  const [badFields, setBadFields] = useState([]);
  const [currencyId, setCurrencyId] = useState(undefined);

  // Same recap params RecurringSummary.jsx reads off the URL, set by
  // SubscribeScheduler.jsx's proceed() when the parent chose "Subscribe".
  const isSubscription = params.get('recurring') === '1';
  const frequency = params.get('frequency');
  const cycleType = frequency === 'monthly' ? 30 : frequency === 'fortnight' ? 15 : undefined;
  const dayArray = (params.get('days') || '').split(',').filter(Boolean).map(Number);
  const scheduleTime = params.get('time') || '';
  const startSchedule = params.get('start') || '';
  const recurringEndMode = params.get('endMode');
  const recurringEndDate = params.get('endDate') || '';
  const recurringOccurrences = params.get('occurrences') || '';
  const usesRecurringApi = isSubscription && RECURRING_PAYMENT_METHODS.includes(pay);

  useEffect(() => {
    const s = getSession();
    setSessionState(s);
    if (s) setContact({ name: s.name || '', phone: s.phone || '', email: s.email || '' });
    setSessionReady(true);
  }, []);

  // currency_id isn't in the recurring endpoint's own required fields, but it
  // rides inside `request_body` the same way it does on a one-time order — the
  // normal /api/order route gets it server-side from getAppConfig(); this
  // direct-to-backend path fetches it itself the same way SubscribeScheduler
  // and other components already call the tenant config endpoint.
  useEffect(() => {
    if (!isSubscription) return;
    let cancelled = false;
    yeloPost('marketplace_fetch_app_configuration', YELO_TENANT).then((j) => {
      if (!cancelled && j?.status === 200 && j?.data?.currency_id) setCurrencyId(j.data.currency_id);
    });
    return () => { cancelled = true; };
  }, [isSubscription]);

  // THE CART'S qty × price IS THE WRONG NUMBER FOR A SUBSCRIPTION.
  //
  // cart.items[].qty is "how many of this line are in the cart" — for a
  // subscription that's always 1 (see the fix in SubscribeScheduler.jsx's
  // proceed()), never the session count. Showing "1× P1 ₹100" would just be a
  // smaller version of the same wrong idea: a subscription's real price is
  // sessions × per-session amount, and that number lives in the recurrence
  // schedule (day_array/start/end), not in the cart line at all. So this
  // fetches the same recurring-aware `get_bill_breakdown` SubscribeScheduler
  // already uses for its own live preview — same direct-to-backend call, no
  // proxy — and the summary below renders THIS instead of the cart items
  // whenever it's a subscription.
  const [recurringBill, setRecurringBill] = useState(null); // { perSession, occurrences, total }
  const [recurringBillState, setRecurringBillState] = useState('idle'); // idle | loading | real | estimate
  const dayArrayKey = dayArray.join(',');
  useEffect(() => {
    if (!isSubscription || !cart.items.length || !dayArrayKey || !scheduleTime) {
      setRecurringBillState('idle');
      return;
    }
    let cancelled = false;
    setRecurringBillState('loading');
    const item = cart.items[0];
    yeloPost('get_bill_breakdown', {
      ...YELO_TENANT,
      latitude: ONLINE_PLACEHOLDER.lat,
      longitude: ONLINE_PLACEHOLDER.lng,
      vendor_id: session?.vendorId || 0,
      access_token: session?.token,
      user_id: cart.storeId,
      amount: item.price,
      products: JSON.stringify([{ product_id: item.id, quantity: 1, unit_price: item.price }]),
      self_pickup: 1,
      is_app_product_tax_enabled: 1,
      promo_id: 0,
      tip_type: -1,
      day_array: dayArray,
      start_schedule: startSchedule,
      schedule_time: scheduleTime,
      is_recurring_enabled: true,
      ...(cycleType ? { cycle_type: cycleType } : {}),
      ...(recurringEndMode === 'date' ? { end_schedule: recurringEndDate } : { occurrence_count: recurringOccurrences }),
    }).then((json) => {
      if (cancelled) return;
      if (json?.status === 200 && json?.data) {
        const b = json.data;
        setRecurringBill({
          perSession: b.NET_PAYABLE_AMOUNT ?? item.price,
          occurrences: b.OCCURRENCE_COUNT ?? null,
          total: b.TOTAL_RECURRING_AMOUNT ?? b.NET_PAYABLE_AMOUNT ?? null,
        });
        setRecurringBillState('real');
      } else {
        setRecurringBill(null);
        setRecurringBillState('estimate');
      }
    });
    return () => { cancelled = true; };
  }, [isSubscription, cart.items, cart.storeId, dayArrayKey, startSchedule, scheduleTime, cycleType, recurringEndMode, recurringEndDate, recurringOccurrences, session]);

  // deliveryType 2 = self-pickup on the shared bill/order contract, which is
  // what zeroes the delivery charge — the closest real fit for "nothing is
  // shipped" since the backend has no third mode for a service booking.
  const refreshBill = useCallback(async () => {
    if (!cart.items.length || !sessionReady) return;
    setBilling(true);
    const b = await post('/api/bill', {
      storeId: cart.storeId,
      items: cart.items,
      latitude: ONLINE_PLACEHOLDER.lat,
      longitude: ONLINE_PLACEHOLDER.lng,
      session,
      deliveryType: 2,
    });
    setBilling(false);
    if (b?.unreachable) { setBillFailed(true); return; }
    setBillFailed(false);
    setBill(b);
  }, [cart.items, cart.storeId, session, sessionReady]);

  useEffect(() => { refreshBill(); }, [refreshBill]);

  useEffect(() => {
    if (session && allowWallet) post('/api/wallet', { session }).then((w) => w && setWallet(w));
  }, [session, allowWallet]);

  // A subscription's real total is sessions × per-session, not the cart's
  // single-line subtotal — see the note above. Falls back to the one-time
  // bill while the recurring one is still loading, so the button never shows
  // a number nobody confirmed as final.
  const total = isSubscription && recurringBill ? recurringBill.total : (bill?.total ?? cart.subtotal);
  const walletShort = wallet.enabled && wallet.balance < total;
  const currency = bill?.currency || '₹';

  useEffect(() => {
    if (pay === PAYMENT.WALLET && (walletShort || !wallet.enabled) && allowCash) {
      setPay(PAYMENT.CASH);
    }
  }, [walletShort, wallet.enabled, pay, allowCash]);

  const money = useMemo(
    () => (n) => `${currency}${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`,
    [currency],
  );

  async function place() {
    setError('');
    setBadFields([]);

    if (!contact.name.trim()) {
      setBadFields(['name']);
      return setError('Add the parent or student’s name for the booking.');
    }
    if (pay === PAYMENT.WALLET && wallet.balance < total) {
      return setError('Wallet balance is short of the total. Choose another payment method.');
    }

    const merged = { ...(session || {}), ...contact };
    if (typeof window !== 'undefined' && session) saveSession(merged);

    if (usesRecurringApi) {
      // recurring/saveRecurringTask requires a real signed-in customer
      // (access_token + vendor_id are Joi .required()) — there's no guest
      // path for a subscription, unlike a one-time cash order.
      if (!merged.vendorId || !merged.token) {
        return setError('Sign in to start a subscription — recurring classes need a real account.');
      }
      if (!dayArray.length || !scheduleTime) {
        return setError('Pick a day and time on the class page before subscribing.');
      }

      setPlacing(true);
      const requestBody = buildOrderBody({
        storeId: cart.storeId,
        items: cart.items,
        address: ONLINE_PLACEHOLDER,
        session: merged,
        paymentType: pay,
        bill,
        deliveryType: 2,
        config: { currencyId },
        envelope: YELO_TENANT,
      });
      const r = await yeloPost('recurring/saveRecurringTask', {
        ...YELO_TENANT,
        user_id: cart.storeId,
        vendor_id: merged.vendorId,
        access_token: merged.token,
        day_array: dayArray,
        schedule_time: scheduleTime,
        start_schedule: startSchedule,
        ...(recurringEndMode === 'date'
          ? { end_schedule: recurringEndDate }
          : { occurrence_count: recurringOccurrences }),
        ...(cycleType ? { cycle_type: cycleType } : {}),
        request_body: JSON.stringify(requestBody),
      });
      setPlacing(false);

      if (r?.status === 200) {
        setPlaced({
          orderId: r.data?.rule_id || null,
          storeId: cart.storeId,
          storeName: cart.storeName,
          vendorId: merged.vendorId,
          accessToken: merged.token,
          items: cart.items.map((it) => ({ ...it })),
          bill,
          isSubscription: true,
        });
        cart.clear();
        return;
      }
      setError(r?.message || 'The subscription did not go through. Nothing has been charged — please try again.');
      return;
    }

    setPlacing(true);
    const r = await post('/api/order', {
      storeId: cart.storeId,
      items: cart.items,
      address: ONLINE_PLACEHOLDER,
      session: merged,
      paymentType: pay,
      bill,
      deliveryType: 2,
    });
    setPlacing(false);

    if (r.ok) {
      setPlaced({
        ...r,
        storeName: cart.storeName,
        items: cart.items.map((it) => ({ ...it })),
        bill,
      });
      cart.clear();
      return;
    }

    if (Array.isArray(r.missing)) {
      setBadFields(r.missing.map((f) => (
        f === 'job_pickup_name' ? 'name'
          : f === 'job_pickup_phone' ? 'phone'
            : f === 'job_pickup_email' ? 'email' : f
      )));
    }
    setError(r.message || 'The booking did not go through. Nothing has been charged — please try again.');
  }

  if (placed?.isSubscription) {
    // A printed till receipt is the wrong metaphor for a schedule that's
    // just starting, not a purchase that's over — see SubscriptionConfirm.jsx.
    // It also pulls the just-created rule back from the real backend rather
    // than only trusting the browser's own snapshot, and hands off straight
    // into the recurring tasks list/detail this subscription now lives in.
    return (
      <SubscriptionConfirm
        ruleId={placed.orderId}
        storeId={placed.storeId}
        vendorId={placed.vendorId}
        accessToken={placed.accessToken}
        storeName={placed.storeName}
      />
    );
  }

  if (placed) {
    return (
      <div className="ck-done">
        <h1>Enrolled</h1>
        <p className="ck-done-sub ck-done-lead">
          You’ll get the class link and reminders by {contact.email && contact.phone ? 'email and text' : contact.email ? 'email' : 'text'} before it starts.
        </p>
        <OrderReceipt
          storeName={placed.storeName}
          orderId={placed.orderId}
          items={placed.items}
          bill={placed.bill}
          currency={currency}
          payLabel={pay === PAYMENT.CASH ? 'Pay at the session' : 'Paid'}
          session={session}
        />
        <button className="ck-place ck-done-btn" onClick={() => router.push('/stores')}>Back to teachers</button>
      </div>
    );
  }

  if (cart.ready && cart.count === 0) {
    return (
      <div className="ck-empty">
        <h1>Your cart is empty</h1>
        <p className="ck-done-sub">Add a class from a teacher’s page to enroll.</p>
        <button className="ck-place ck-done-btn" onClick={() => router.push('/stores')}>Browse teachers</button>
      </div>
    );
  }

  const bad = (f) => (badFields.includes(f) ? ' ck-bad' : '');

  return (
    <div className="ck">
      <h1 className="ck-title">{title}</h1>
      <div className="ck-grid">
        <div className="ck-left">
          <section className="ck-card ck-online-note">
            <div className="ck-card-h">This is a live online class</div>
            <p className="ck-online-copy">
              No delivery or pickup — your child joins from any device with a
              link we’ll send you. Just tell us who’s attending.
            </p>
          </section>

          <section className="ck-card">
            <div className="ck-card-h">Who’s attending</div>
            <input className={`ck-in${bad('name')}`} value={contact.name} placeholder="Parent or student name"
              aria-label="Name" onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <div className="ck-two">
              <input className={`ck-in${bad('phone')}`} value={contact.phone} placeholder="Phone"
                inputMode="tel" aria-label="Phone"
                onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <input className={`ck-in${bad('email')}`} value={contact.email} placeholder="Email"
                inputMode="email" aria-label="Email"
                onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </div>
          </section>

          <section className="ck-card">
            <div className="ck-card-h">{paymentLabel}</div>
            {allowCash && (
              <label className={`ck-pay ${pay === PAYMENT.CASH ? 'on' : ''}`}>
                <input type="radio" name="pay" checked={pay === PAYMENT.CASH}
                  onChange={() => setPay(PAYMENT.CASH)} />
                <span className="ck-pay-i" aria-hidden="true">💵</span>
                <span className="ck-pay-b"><b>Pay at the session</b><small>Settle with the teacher directly</small></span>
              </label>
            )}
            {allowWallet && (
              <label className={`ck-pay ${pay === PAYMENT.WALLET ? 'on' : ''} ${!wallet.enabled || walletShort ? 'off' : ''}`}>
                <input type="radio" name="pay" disabled={!wallet.enabled || walletShort}
                  checked={pay === PAYMENT.WALLET} onChange={() => setPay(PAYMENT.WALLET)} />
                <span className="ck-pay-i" aria-hidden="true">👛</span>
                <span className="ck-pay-b">
                  <b>Wallet</b>
                  <small>
                    {!wallet.enabled ? 'Sign in to use your wallet'
                      : walletShort ? `Balance ${money(wallet.balance)} — short of the total`
                        : `Balance ${money(wallet.balance)}`}
                  </small>
                </span>
              </label>
            )}
          </section>
        </div>

        <div className="ck-right">
          <section className="ck-card ck-summary">
            <div className="ck-card-h">{cart.storeName || summaryLabel}</div>

            {isSubscription ? (
              <>
                <div className="ck-items">
                  {cart.items.slice(0, 1).map((it) => (
                    <div className="ck-item" key={it.id}>
                      <span className="ck-item-n">{it.name}</span>
                      <span className="ck-item-p">
                        {recurringBill?.occurrences ? `${recurringBill.occurrences} sessions` : 'Subscription'}
                      </span>
                    </div>
                  ))}
                </div>
                {(dayArray.length > 0 || scheduleTime) && (
                  <dl className="ck-sched">
                    {dayArray.length > 0 && (
                      <div><dt>Days</dt><dd>{dayArray.map((d) => DAY_NAMES[d]).join(', ')}</dd></div>
                    )}
                    {scheduleTime && (
                      <div><dt>Time</dt><dd>{fmtClock(scheduleTime)}</dd></div>
                    )}
                    {startSchedule && (
                      <div><dt>Starts</dt><dd>{startSchedule}</dd></div>
                    )}
                    <div>
                      <dt>Ends</dt>
                      <dd>
                        {recurringEndMode === 'date'
                          ? (recurringEndDate || '—')
                          : `After ${recurringOccurrences || recurringBill?.occurrences || '—'} sessions`}
                      </dd>
                    </div>
                  </dl>
                )}
                <BillLines
                  bill={recurringBill ? {
                    currency,
                    lines: [{
                      key: 'per-session',
                      label: `${money(recurringBill.perSession)} × ${recurringBill.occurrences ?? '—'} sessions`,
                      value: recurringBill.total,
                      kind: 'subtotal',
                    }],
                    total: recurringBill.total,
                    estimated: recurringBillState === 'estimate',
                  } : null}
                  totalLabel="To pay"
                  loading={recurringBillState === 'loading'}
                />
              </>
            ) : (
              <>
                <div className="ck-items">
                  {cart.items.map((it) => (
                    <div className="ck-item" key={it.id}>
                      <span className="ck-item-q">{it.qty}×</span>
                      <span className="ck-item-n">{it.name}</span>
                      <span className="ck-item-p">{money(it.price * it.qty)}</span>
                    </div>
                  ))}
                </div>
                {billFailed ? (
                  <div className="ck-error" role="alert">
                    We couldn’t load the final price.{' '}
                    <button className="ck-retry" onClick={refreshBill}>Try again</button>
                  </div>
                ) : (
                  <BillLines bill={bill} totalLabel="To pay" loading={billing} />
                )}
              </>
            )}

            {error && <div className="ck-error" role="alert">{error}</div>}

            <button
              className="ck-place"
              data-busy={placing ? '1' : undefined}
              disabled={placing || billing || !bill || billFailed || (isSubscription && recurringBillState === 'loading')}
              onClick={place}
            >
              {placing ? (usesRecurringApi ? 'Subscribing…' : 'Enrolling…')
                : billing || (isSubscription && recurringBillState === 'loading') ? 'Updating total…'
                : `${ctaLabel} · ${money(total)}`}
            </button>
            <div className="ck-secure">🔒 {session ? `Signed in as ${session.name || 'you'}` : 'Guest checkout'}</div>
          </section>
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
/* This checkout now stands on its own — the page around it dropped the big
   banner and the duplicate bill section — so give it a little more room and a
   cleaner rhythm than the shared defaults. */
.ck{ max-width:1080px; }
.ck-title{ margin-bottom:24px; }
.ck-grid{ gap:24px; }
@media (min-width:881px){ .ck-grid{ grid-template-columns:1fr 380px; } }
.ck-left{ gap:14px; }
.ck-card{ padding:20px; }
.ck-card-h{ margin-bottom:14px; }

.ck-online-note{ background:var(--brand-accent-soft); border-color:color-mix(in srgb, var(--brand-accent) 24%, var(--brand-line)); }
.ck-online-copy{ margin:6px 0 0; color:var(--brand-ink-soft); font-size:.88rem; line-height:1.5; }

.ck-summary .ck-card-h{ font-size:15.5px; }
.ck-sched{
  margin:12px 0; padding:12px 0; display:grid; gap:9px;
  border-bottom:1px solid var(--line, var(--brand-line));
}
.ck-sched > div{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.ck-sched dt{
  font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--muted, var(--brand-ink-soft));
}
.ck-sched dd{ margin:0; font-size:13px; font-weight:600; text-align:right; }
`;
