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
 *
 * RAZORPAY — traced end to end from the real client
 * (yelo-marketplace-webapp/src/app/components/payment/payment.component.ts):
 *  1. `payment/getPaymentUrl` (Joi contract at yelo-server
 *     modules/payment/validators/paymentValidator.js:74) with
 *     payment_method: 128 (PaymentMode.RAZORPAY — enums/enum.ts:80) and
 *     payment_for: 0 (CREATE_TASK — yelo-server properties/constants.js
 *     PAYMENT_FOR). Live-tested against this tenant with a throwaway
 *     vendor_id: got back a real `status:101 "Session expired"` (an auth
 *     failure, not a validation one) — confirms this exact payload shape is
 *     accepted, it just needs a real signed-in session to go further, which
 *     is why this option is disabled for guests below.
 *  2. Response `data.url` is the real hosted Razorpay checkout page. The
 *     client opens it in an iframe with `&domain_name=` + the storefront's
 *     own origin appended (payment.component.ts:1720-1722) so that page
 *     knows where to postMessage back to.
 *  3. On success the iframe posts `window.postMessage({payment_method:128,
 *     rzp_payment_id, ...})` with no `.action`; `{action:'close'}` means the
 *     parent closed it before paying (payment.component.ts:1023-1078).
 *  4. Real client then calls `taskViaPayment()` — i.e. the SAME order-create
 *     call a cash order uses (successPayfortTransaction():10820-10832) —
 *     just with paymentType 128 instead of CASH. This build does the exact
 *     same thing: the postMessage handler below calls the same /api/order or
 *     recurring/saveRecurringTask this file already uses for cash, with
 *     `paymentType: RAZORPAY`.
 *
 * ONE GAP, STATED PLAINLY: yelo-server records the gateway's own transaction
 * id via a `transaction_id` field on the order (customer_open_apis.js:6444),
 * but that field isn't in this shared app's `buildOrderBody()` (lib/order.js,
 * outside this workspace — read-only from here), so the order records
 * "paid via Razorpay" (payment_method 128) but not the specific payment id.
 * Reconciling a specific payment against a specific order needs that field
 * added to the shared order contract, not something fixable from this file.
 */
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
// Not in the shared PAYMENT map because it isn't a per-tenant value — it's the
// fixed marketplace-wide Razorpay code, verified in both real repos:
// yelo-marketplace-webapp/src/app/enums/enum.ts:80 (PaymentMode.RAZORPAY =
// 128) and yelo-server/properties/constants.js merchantPaymentMethodsMasks.
// Deliberately NOT added to RECURRING_PAYMENT_METHODS: the real client never
// routes an online gateway through createRecurrenceTask directly (see the
// file header) — it always goes through the payment iframe first.
const RAZORPAY = 128;
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
  allowRazorpay = true,
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
  const [razorpayUrl, setRazorpayUrl] = useState('');
  const [razorpayStarting, setRazorpayStarting] = useState(false);

  // Same recap params RecurringSummary.jsx reads off the URL, set by
  // SubscribeScheduler.jsx's proceed() when the parent chose "Subscribe".
  const isSubscription = params.get('recurring') === '1';
  const frequency = params.get('frequency');
  const cycleType = frequency === 'monthly' ? 30 : frequency === 'fortnight' ? 15 : undefined;
  const dayArray = (params.get('days') || '').split(',').filter(Boolean).map(Number);
  const scheduleTime = params.get('time') || '';
  const startSchedule = params.get('start') || '';
  const recurringOccurrences = params.get('occurrences') || '';
  const usesRecurringApi = isSubscription && RECURRING_PAYMENT_METHODS.includes(pay);

  // Stage 2 of this page. "Edit" jumps back to the scheduler (stage 1) at the
  // top, keeping every choice so nothing is re-picked.
  const stepSchedule = params.get('step') === 'schedule';
  const scheduled = isSubscription && !!scheduleTime && !stepSchedule;

  // Set by the scheduler component the moment it knows whether THIS product
  // actually has a schedule to pick — '1' recurring, '0' one-time. Needed
  // because a bare `/checkout?product=X` looks identical whether or not a
  // schedule is coming; without this, payment showed up while the parent was
  // still on "Set up your subscription" for a recurring class.
  const productParam = params.get('product') || params.get('id');
  const hasSchedule = params.get('hasSchedule');
  // `scheduled` already proves a schedule was really completed even on a URL
  // that dropped the `hasSchedule` flag (e.g. right after "Proceed to pay"
  // rewrites the query to the day/time params) — never re-hide in that case.
  const waitingOnSchedule = !!productParam && hasSchedule === null && !scheduled;
  const scheduleRequired = hasSchedule === '1';

  let scheduleHref = null;
  {
    const sp = new URLSearchParams();
    for (const k of ['product', 'id', 'session', 'frequency', 'days', 'start', 'time', 'occurrences']) {
      const v = params.get(k);
      if (v) sp.set(k, v);
    }
    sp.set('step', 'schedule');
    scheduleHref = `/checkout?${sp.toString()}`;
  }

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
      occurrence_count: recurringOccurrences,
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
  }, [isSubscription, cart.items, cart.storeId, dayArrayKey, startSchedule, scheduleTime, cycleType, recurringOccurrences, session]);

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
  // payment/getPaymentUrl's Joi schema requires vendor_id for a normal
  // (non subscription-plan) payment — there's no guest path for paying
  // online, unlike cash. Verified live: a call with no real session comes
  // back `status:101 "Session expired"` rather than succeeding.
  const canRazorpay = !!(session?.vendorId && session?.token);

  useEffect(() => {
    if (pay === PAYMENT.WALLET && (walletShort || !wallet.enabled) && allowCash) {
      setPay(PAYMENT.CASH);
    }
  }, [walletShort, wallet.enabled, pay, allowCash]);

  useEffect(() => {
    if (pay === RAZORPAY && !canRazorpay && allowCash) {
      setPay(PAYMENT.CASH);
    }
  }, [canRazorpay, pay, allowCash]);

  const money = useMemo(
    () => (n) => `${currency}${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`,
    [currency],
  );

  // Real client waits ~3s after the iframe's postMessage before treating a
  // Razorpay payment as final (payment.component.ts successRazorpayTransaction)
  // — long enough for Razorpay's own on-screen success state to be visible
  // before the iframe vanishes, so it doesn't look like the tap did nothing.
  async function completeAfterRazorpay() {
    const merged = { ...(session || {}), ...contact };
    setPlacing(true);

    if (isSubscription) {
      const requestBody = buildOrderBody({
        storeId: cart.storeId,
        items: cart.items,
        address: ONLINE_PLACEHOLDER,
        session: merged,
        paymentType: RAZORPAY,
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
        occurrence_count: recurringOccurrences,
        ...(cycleType ? { cycle_type: cycleType } : {}),
        request_body: JSON.stringify({ ...requestBody, google_meet: 1 }),
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
      setError(r?.message || 'Payment went through, but the subscription could not be created — contact support with your Razorpay receipt, nothing will be charged twice.');
      return;
    }

    const r = await post('/api/order', {
      storeId: cart.storeId,
      items: cart.items,
      address: ONLINE_PLACEHOLDER,
      session: merged,
      paymentType: RAZORPAY,
      bill,
      deliveryType: 2,
    });
    setPlacing(false);
    if (r.ok) {
      setPlaced({ ...r, storeName: cart.storeName, items: cart.items.map((it) => ({ ...it })), bill });
      cart.clear();
      return;
    }
    setError(r.message || 'Payment went through, but the booking could not be recorded — contact support with your Razorpay receipt, nothing will be charged twice.');
  }

  // window.onmessage, exactly like the real client's iframe listener
  // (payment.component.ts:928-1078): the hosted Razorpay page posts back to
  // whichever window opened it, there's no other channel.
  useEffect(() => {
    function onMessage(event) {
      const d = event.data;
      if (!d || typeof d !== 'object') return;
      if (d.payment_method !== 128 && d.payment_method !== 5025) return;
      if (d.action === 'close') {
        setRazorpayUrl('');
        setError('Payment window closed — nothing was charged.');
        return;
      }
      setTimeout(() => {
        setRazorpayUrl('');
        completeAfterRazorpay();
      }, 1500);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, contact, cart.items, cart.storeId, cart.storeName, isSubscription, dayArray, scheduleTime, startSchedule, recurringOccurrences, cycleType, bill, currencyId]);

  async function startRazorpayPayment() {
    if (!session?.vendorId || !session?.token) {
      return setError('Sign in to pay online — Razorpay needs a real account.');
    }
    const merged = { ...(session || {}), ...contact };
    if (typeof window !== 'undefined') saveSession(merged);

    setRazorpayStarting(true);
    const r = await yeloPost('payment/getPaymentUrl', {
      ...YELO_TENANT,
      amount: total,
      app_type: 'WEB',
      payment_for: 0, // CREATE_TASK — yelo-server properties/constants.js PAYMENT_FOR
      // marketplace_fetch_app_configuration (which would normally supply the
      // real currency CODE, payment.component.ts:1634) returns a genuine SQL
      // error for this tenant right now — verified live: status 201,
      // ER_PARSE_ERROR. Every price on this storefront is already ₹, so INR
      // is the honest fallback, not an invented value.
      currency: 'INR',
      name: merged.name || 'Parent',
      email: merged.email || 'contact@yelo.red', // the backend's own default for a blank email (paymentValidator.js:79-81) — matched, not invented
      vendor_id: merged.vendorId,
      access_token: merged.token,
      app_access_token: merged.token,
      user_id: cart.storeId,
      payment_method: RAZORPAY,
    });
    setRazorpayStarting(false);

    if (r?.status === 200 && r?.data?.url) {
      // The real client appends its own origin so the hosted page knows
      // where to postMessage the result back to (payment.component.ts:1720-1722).
      setRazorpayUrl(`${r.data.url}&domain_name=${encodeURIComponent(window.location.origin)}`);
    } else {
      setError(r?.message || 'Could not start Razorpay — please try another payment method.');
    }
  }

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
    if (isSubscription && (!dayArray.length || !scheduleTime)) {
      return setError('Pick a day and time on the class page before subscribing.');
    }
    if (pay === RAZORPAY) {
      return startRazorpayPayment();
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
        occurrence_count: recurringOccurrences,
        ...(cycleType ? { cycle_type: cycleType } : {}),
        // google_meet: 1 requested specifically for the recurring create call —
        // added only inside request_body (an opaque JSON blob the validator
        // doesn't inspect), not as a top-level field, and not on the one-time
        // order path (buildOrderBody is shared with create_task_via_vendor_v2).
        // Nothing found in the real backend or webapp source currently reads
        // this key, so until the platform team wires it up this rides along
        // inert rather than doing anything visible.
        request_body: JSON.stringify({ ...requestBody, google_meet: 1 }),
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
          payLabel={pay === PAYMENT.CASH ? 'Pay at the session' : pay === RAZORPAY ? 'Paid online via Razorpay' : 'Paid'}
          session={session}
        />
        <button className="ck-place ck-done-btn" onClick={() => router.push('/stores')}>Back to teachers</button>
      </div>
    );
  }

  // Still finding out whether this class needs a schedule at all — stay
  // hidden rather than flash "Confirm & pay" before the scheduler above has
  // had a chance to say so (a real bug: it used to show up immediately, on
  // the "Set up your subscription" screen, for any recurring class).
  if (waitingOnSchedule) return null;
  // A class that does need one stays hidden until it's actually picked. A
  // one-time class (hasSchedule === '0') never had this requirement, so it
  // was never caught by this — and must not be, or checkout goes blank for
  // it (confirmed live: merchant "QA X"'s non-recurring Maths products).
  if (scheduleRequired && !scheduled) return null;

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
            {allowRazorpay && (
              <label className={`ck-pay ${pay === RAZORPAY ? 'on' : ''} ${!canRazorpay ? 'off' : ''}`}>
                <input type="radio" name="pay" disabled={!canRazorpay}
                  checked={pay === RAZORPAY} onChange={() => setPay(RAZORPAY)} />
                <span className="ck-pay-i" aria-hidden="true">💳</span>
                <span className="ck-pay-b">
                  <b>Pay online</b>
                  <small>{canRazorpay ? 'Card, UPI or netbanking — secured by Razorpay' : 'Sign in to pay online with Razorpay'}</small>
                </span>
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
                <div className="ck-sched-wrap">
                  <div className="ck-sched-head">
                    <span>Class schedule</span>
                    {scheduleHref && <Link className="ck-sched-edit" href={scheduleHref}>Edit</Link>}
                  </div>
                  <dl className="ck-sched">
                    {frequency && (
                      <div><dt>Frequency</dt><dd style={{ textTransform: 'capitalize' }}>{frequency}</dd></div>
                    )}
                    <div><dt>Days</dt><dd>{dayArray.length ? dayArray.map((d) => DAY_NAMES[d]).join(', ') : '—'}</dd></div>
                    <div>
                      <dt>Time</dt>
                      <dd>
                        {scheduleTime
                          ? fmtClock(scheduleTime)
                          : scheduleHref
                            ? <Link className="ck-sched-edit" href={scheduleHref}>Pick a time</Link>
                            : 'Not selected'}
                      </dd>
                    </div>
                    {startSchedule && <div><dt>Starts</dt><dd>{startSchedule}</dd></div>}
                    <div>
                      <dt>Ends</dt>
                      <dd>After {recurringOccurrences || recurringBill?.occurrences || '—'} sessions</dd>
                    </div>
                    {(recurringBill?.occurrences ?? recurringOccurrences) && (
                      <div><dt>Sessions</dt><dd>{recurringBill?.occurrences ?? recurringOccurrences}</dd></div>
                    )}
                  </dl>
                </div>
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
              data-busy={placing || razorpayStarting ? '1' : undefined}
              disabled={placing || billing || !bill || billFailed || razorpayStarting || (isSubscription && recurringBillState === 'loading')}
              onClick={place}
            >
              {razorpayStarting ? 'Opening Razorpay…'
                : placing ? (pay === RAZORPAY ? 'Confirming payment…' : usesRecurringApi ? 'Subscribing…' : 'Enrolling…')
                : billing || (isSubscription && recurringBillState === 'loading') ? 'Updating total…'
                : pay === RAZORPAY ? `${ctaLabel} with Razorpay · ${money(total)}`
                : `${ctaLabel} · ${money(total)}`}
            </button>
            <div className="ck-secure">🔒 {session ? `Signed in as ${session.name || 'you'}` : 'Guest checkout'}</div>
          </section>
        </div>
      </div>

      {razorpayUrl && (
        <div className="ck-rzp-overlay" role="dialog" aria-modal="true" aria-label="Pay with Razorpay">
          <div className="ck-rzp-modal">
            <button
              type="button"
              className="ck-rzp-close"
              aria-label="Close payment window"
              onClick={() => { setRazorpayUrl(''); setError('Payment window closed — nothing was charged.'); }}
            >
              ×
            </button>
            <iframe src={razorpayUrl} title="Razorpay payment" className="ck-rzp-frame" />
          </div>
        </div>
      )}
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
.ck-sched-wrap{ margin:12px 0; padding:12px 0; border-top:1px solid var(--line, var(--brand-line)); border-bottom:1px solid var(--line, var(--brand-line)); }
.ck-sched-head{
  display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px;
  font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  color:var(--muted, var(--brand-ink-soft));
}
.ck-sched-edit{
  font-size:11px; font-weight:700; letter-spacing:.02em; text-transform:none;
  color:var(--brand, var(--brand-accent)); text-decoration:underline; text-underline-offset:2px;
}
.ck-sched-edit:hover{ filter:brightness(1.1); }
.ck-sched{ display:grid; gap:9px; margin:0; }
.ck-sched > div{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.ck-sched dt{
  font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--muted, var(--brand-ink-soft));
}
.ck-sched dd{ margin:0; font-size:13px; font-weight:600; text-align:right; }

.ck-rzp-overlay{
  position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  padding:16px; background:color-mix(in srgb, var(--brand-ink) 55%, transparent);
}
.ck-rzp-modal{
  position:relative; width:100%; max-width:460px; height:min(640px, 92vh);
  background:var(--brand-surface); border-radius:var(--radius-lg); overflow:hidden;
  box-shadow:0 30px 60px -20px color-mix(in srgb, var(--brand-ink) 45%, transparent);
}
.ck-rzp-frame{ width:100%; height:100%; border:0; display:block; }
.ck-rzp-close{
  position:absolute; top:8px; right:8px; z-index:1; width:32px; height:32px; border-radius:50%;
  border:1px solid var(--brand-line); background:var(--brand-surface); color:var(--brand-ink);
  font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;
}
.ck-rzp-close:hover{ border-color:var(--brand-accent); color:var(--brand-accent); }
.ck-rzp-close:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
@media (max-width:480px){
  .ck-rzp-overlay{ padding:0; }
  .ck-rzp-modal{ max-width:100%; height:100%; border-radius:0; }
}
`;
