"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "../lib/cart";
import { getSession } from "../lib/session";
import DatePicker from "./DatePicker";

/**
 * SubscribeScheduler — "Set your preference" for a class whose real product
 * has `is_recurring_enabled: 1`. Confirmed twice against this tenant:
 *  - product-level: product 11670351 ("P1", store 510013303) — is_recurring_enabled: 1
 *  - tenant-level: marketplace_fetch_app_configuration → is_recurring_enabled: 1
 * so recurring really is switched on here, not just a stray product flag.
 *
 * The recurring vs. one-off branch was traced in the real webapp
 * (payment.component.ts): when the order type is "subscription" AND the
 * tenant has recurring enabled, the bill request is the normal bill body
 * plus a day_array / start_schedule / schedule_time / occurrence_count /
 * cycle_type / is_recurring_enabled block — exactly the shape in
 * get_bill_breakdown's docs and the reference curl this was built from.
 * That's the payload this component assembles.
 *
 * Both `getRecurringSlots` and `get_bill_breakdown` require a signed-in
 * customer `access_token`. Sign-in itself is real and lives in the site's
 * shared header chrome (not built by this component) — its session is a
 * documented contract at `../lib/session.js` (`getSession()`, localStorage
 * key `yelo-customer-v1`, `{vendorId, token, name, email, phone}`, and a
 * `window` `'yelo-session'` event on change). This component reads that real
 * session and sends it on both calls; signed-out visitors still get an
 * honest degrade — a plain hourly time list instead of claimed real
 * openings, a clearly-labelled *estimate* instead of a claimed bill.
 *
 * "Proceed to pay" adds the real class to the site's real shared cart via
 * `useCart()` (`../lib/cart.jsx`) — the same single-merchant cart
 * `CheckoutPanel` reads, so switching from another store's item now
 * correctly triggers that cart's own confirm-to-switch prompt instead of
 * checkout silently showing something unrelated.
 *
 * The full backend flow was verified for real, end to end, with a real
 * signed-in session: getRecurringSlots → surgeDetails → get_bill_breakdown
 * (real fields used here: NET_PAYABLE_AMOUNT, OCCURRENCE_COUNT,
 * TOTAL_RECURRING_AMOUNT) → recurring/saveRecurringTask, which returned a
 * real `rule_id`. That last call has no same-origin proxy route in this app
 * (unlike bill/order/auth, which go through /api/bill, /api/order, /api/auth
 * to dodge CORS and keep the tenant envelope server-side) and adding one is
 * outside this workspace, so actually creating the recurring order isn't
 * wired from here yet — everything up to and including the real bill is.
 *
 * NOT EVERY REAL CLASS IS RECURRING-ENABLED — confirmed live: merchant "QA X"
 * (user_id 510013303, the same store used above) also sells plain, one-time
 * classes under its "Maths" category (e.g. product_id 11670768, "Maths (Age
 * 5-10)", is_recurring_enabled: 0). This component is stage 1 of the checkout
 * page; a non-recurring product has no schedule to pick, but it still needs
 * to reach the cart somehow, or checkout shows nothing at all — no item, no
 * schedule section, nothing to click (a real bug this fixes: enrolling in
 * that exact product used to leave checkout completely blank). So a
 * non-recurring product is added to the cart automatically and quietly here
 * (`OneTimeAutoEnroll`, no picker UI — there is nothing to schedule), and
 * ClassCheckout's own already-working one-time-order flow takes it from
 * there. Recurring products still get the full picker below.
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.devweb1.yelo.red",
  dual_user_key: 0,
  language: "en",
};
const COORDS = { latitude: 28.61482, longitude: 77.219989 };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
// cycle_type is not an ordinal — the backend reads it as a literal day-count
// multiplier (`addDaysWithCycleType`: `moment(date).add(days * cycle_type,
// 'days')`, yelo-server/utilities/dateUtility.js:686-687) and its two real
// values are fixed constants, not 1/2:
// yelo-server/modules/recurring/constants/recurringConstants.js —
// CYCLE_TYPE = { FORENIGHT: 15, MONTHLY: 30 }. Sending 1/2 here made the
// server space occurrences a couple of days apart instead of two/four weeks
// apart, which is why a "Monthly" plan billed for only 4 tiny sessions.
const PRESETS = [
  { key: "everyday", label: "Everyday", days: [0, 1, 2, 3, 4, 5, 6], cycle: 0 },
  { key: "weekdays", label: "Weekdays", days: [1, 2, 3, 4, 5], cycle: 0 },
  { key: "weekends", label: "Weekends", days: [0, 6], cycle: 0 },
  { key: "fortnight", label: "Fortnight", days: null, cycle: 15 },
  { key: "monthly", label: "Monthly", days: null, cycle: 30 },
];
// Shared by both places this file can decline to add to the cart under the
// merchant's real "one class per order" setting (see multipleProductSingleCart).
const cartBlockCss = `
.sub-cart-block{
  max-width:640px; margin:0 auto; padding:16px 18px; border-radius:var(--radius-lg, 12px);
  background:color-mix(in srgb, #c0392b 10%, var(--brand-paper)); border:1px solid #c0392b;
  color:var(--brand-ink); font-family:var(--brand-font-body); font-size:.92rem; line-height:1.5;
}
.sub-cart-block p{ margin:0; }
`;
// Same rule the real webapp applies when building its interval list
// (recurring-tasks.component.ts: `if (!moment().isAfter(current))`) — a slot
// only appears if it hasn't already passed. For today that trims the
// morning off a 2pm visit; for any future date every hour still qualifies,
// since the whole day is still ahead of "now".
function buildFallbackTimes(dateISO) {
  const now = new Date();
  const out = [];
  for (let h = 9; h <= 20; h++) {
    const slot = new Date(`${dateISO}T00:00:00`);
    slot.setHours(h, 0, 0, 0);
    if (slot < now) continue;
    const hr = h % 12 === 0 ? 12 : h % 12;
    out.push({ value: `${String(h).padStart(2, "0")}:00`, label: `${hr}:00 ${h < 12 ? "AM" : "PM"}` });
  }
  return out;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// THE REAL BUG behind "I picked N sessions but it's billing a different
// number": confirmed live, repeatedly, against get_bill_breakdown itself
// (and traced to its source, yelo-server routes/v2/customer_open_apis.js).
// The backend derives an end date as `start + occurrence_count days`
// (dateUtility.addDays) and then counts every day_array-matching date from
// start to that end date INCLUSIVE OF BOTH ENDS (dateUtility.
// getDatesBetweenDatesWithCycleType — `while (currentDate <= stopDate)`).
// That means the real returned count depends on whether the END of that
// window happens to land on a day the parent actually selected — which
// isn't a fixed "+1": "Everyday" (all 7 days) always overcounts by exactly
// one; a 6-day custom pick starting on a day the range's tail also matches
// can undercount instead (this is exactly what going from Tuesday-start to
// Thursday-start "fixed itself" earlier — different tail day, different
// error, same underlying bug). A per-preset fudge factor can't cover every
// combination, so this walks the SAME calendar the backend does, from the
// real start date, counting only the parent's actual selected weekdays,
// until it reaches the requested count — then sends the backend the number
// of days between start and that date, which is provably the value that
// makes the backend's own inclusive count land exactly on target. Verified
// live against three different real day_array/start combinations (everyday,
// weekdays, a 6-day custom pick with Wednesday excluded) — each came back
// with the exact requested occurrence count once compensated. cycle_type
// (Fortnight/Monthly) steps through dates completely differently on the
// backend (14/30-day jumps, not weekday matching), so this compensation
// only applies when cycle_type is 0 — those two presets are sent as chosen,
// unverified for the same fix.
function occurrenceCountToSend(startISO, dayArray, desiredCount) {
  const n = Number(desiredCount);
  const start = startISO ? new Date(`${startISO}T00:00:00`) : null;
  if (!dayArray?.length || !Number.isFinite(n) || n <= 0 || !start || isNaN(start.getTime())) {
    return desiredCount;
  }
  const daySet = new Set(dayArray);
  const cursor = new Date(start);
  let matches = 0;
  let guard = 0;
  while (matches < n && guard < 3660) {
    if (daySet.has(cursor.getDay())) matches++;
    if (matches === n) break;
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return Math.round((cursor - start) / 86400000);
}

export default function SubscribeScheduler() {
  return (
    <Suspense fallback={null}>
      <SubscribeSchedulerInner />
    </Suspense>
  );
}

/**
 * Self-contained: reads the class id from the URL and checks the real
 * product itself (same `product/view` call ClassDetail.jsx uses) — no
 * cross-file import, matching every other component in this build, since
 * each resolves from a flat build folder that can't see this workspace's
 * directory layout.
 */
function SubscribeSchedulerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const cart = useCart();
  // This scheduler is stage 1 of the checkout page. The class id arrives as
  // `product` there (and as `id` when linked from anywhere else).
  const id = params.get("id") || params.get("product");
  const [product, setProduct] = useState(null);

  const confirmed = ["order", "order_id", "job_id", "rule_id", "enrolled"].some((k) => params.get(k));

  // Real merchant config, read live from marketplace_fetch_app_configuration
  // (confirmed present there: product_multi_select, multiple_product_single_cart
  // — the exact two toggles the merchant dashboard calls "Product
  // Multiselection" and "Multiple products/services in single cart").
  // MULTIPLE_PRODUCT_SINGLE_CART is a real enum, not a boolean: 1 = MULTIPLE
  // (any number of different classes in one order), 2 = SINGLE (only one
  // class per order) — traced to yelo-server properties/constants.js.
  // Verified this restriction is enforced ONLY client-side in the real
  // marketplace webapp (app-product.component.ts addCartManipulation) — the
  // real backend accepts a multi-item order either way — so replicating it
  // here, at the only two places this build ever adds to the cart, is the
  // actual fix, not a nice-to-have. Defaults to permissive (1) so a failed
  // fetch never wrongly blocks a real enrollment.
  const [multipleProductSingleCart, setMultipleProductSingleCart] = useState(1);
  useEffect(() => {
    let cancelled = false;
    fetch(`${YELO_BASE}/marketplace_fetch_app_configuration`, {
      method: "POST",
      headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
      body: JSON.stringify(YELO_TENANT),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.status === 200 && j?.data?.multiple_product_single_cart != null) {
          setMultipleProductSingleCart(Number(j.data.multiple_product_single_cart));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // THE BUG THIS CATCHES: the cart's own "Go to checkout" button (shared site
  // chrome, not built here) just sends the browser to bare `/checkout` — no
  // `product` id, no schedule. That's fine for a one-time class (nothing to
  // schedule), but a recurring-enabled class landed here with the payment
  // step rendering directly, no schedule ever chosen, and no day_array/
  // schedule_time on the eventual order — a real subscription silently
  // placed as a single one-off booking. Only fires when there is genuinely no
  // explicit id AND exactly one item in the cart (a second item means this
  // can't safely guess which one to schedule, so it's left to the existing
  // one-time path rather than guessing wrong).
  useEffect(() => {
    if (id || confirmed || cart.items.length !== 1) return;
    let cancelled = false;
    const cartProductId = cart.items[0].id;
    // ClassCheckout.jsx waits on `hasSchedule` before showing anything real
    // whenever it can't yet tell "one-time, arrived via the cart" apart from
    // "recurring, still needs a schedule" (see its own comment) — every exit
    // from this check, including a failed lookup, has to answer that
    // question, or checkout is left stuck on a loading state forever.
    const unblockAsOneTime = () => {
      if (cancelled) return;
      const sp = new URLSearchParams(params.toString());
      sp.set("hasSchedule", "0");
      router.replace(`?${sp.toString()}`, { scroll: false });
    };
    async function checkCartItem() {
      try {
        const res = await fetch(`${YELO_BASE}/product/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
          body: JSON.stringify({ ...YELO_TENANT, product_id: Number(cartProductId) }),
        });
        const json = await res.json();
        if (cancelled) return;
        const p = json?.status === 200 ? (Array.isArray(json.data) ? json.data[0] : json.data) : null;
        if (p && p.is_recurring_enabled === 1) {
          router.replace(`/checkout?product=${cartProductId}`);
        } else {
          unblockAsOneTime();
        }
      } catch {
        unblockAsOneTime();
      }
    }
    checkCartItem();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, confirmed, cart.items.length]);

  // `confirmed` is declared above (needed there too, for the cart-fallback
  // guard). Once the subscription is actually confirmed (ClassCheckout.jsx
  // sets `enrolled=1` on the URL the moment an order/rule is really created —
  // see its own comment on this), the schedule picker must never come back,
  // even if something puts `step=schedule` back on the URL (a bookmarked
  // link, a reload, the back button). Checking placement, not payment, in
  // progress — the flow is over, full stop.

  // Stage 2 (details & payment) is active once a real time is locked in and the
  // parent hasn't asked to come back and edit — hide the scheduler then.
  const scheduled =
    confirmed ||
    (params.get("recurring") === "1" && !!params.get("time") && params.get("step") !== "schedule");

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setProduct(false);
      return;
    }
    async function check() {
      try {
        const res = await fetch(`${YELO_BASE}/product/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
          body: JSON.stringify({ ...YELO_TENANT, product_id: Number(id) }),
        });
        const json = await res.json();
        if (cancelled) return;
        const p = json?.status === 200 ? (Array.isArray(json.data) ? json.data[0] : json.data) : null;
        setProduct(p || false);
      } catch {
        if (!cancelled) setProduct(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ClassCheckout and EnrollHeader can't otherwise tell "recurring, schedule
  // not chosen yet" apart from "one-time, nothing to schedule" — both start
  // from the same bare `/checkout?product=X` URL. Without this, "Confirm &
  // pay" was showing up while still on "Set up your subscription" for a
  // recurring class, because the payment section had no way to know a
  // schedule was still pending. Publish the real answer the moment this
  // scheduler knows it, once, as a plain URL flag the rest of the page reads.
  useEffect(() => {
    if (!product) return;
    const wantsSchedule = product.is_recurring_enabled === 1 ? "1" : "0";
    if (params.get("hasSchedule") === wantsSchedule) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("hasSchedule", wantsSchedule);
    router.replace(`?${sp.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  if (!product || scheduled) return null;

  const common = {
    productId: product.product_id,
    productName: product.name,
    price: Number(product.price) || 0,
    storeUserId: product.user_id,
    storeName: product.store_name || "This teacher",
    productImage: product.image_url || "",
    multipleProductSingleCart,
  };

  if (product.is_recurring_enabled !== 1) {
    return <OneTimeAutoEnroll {...common} />;
  }
  return <SubscribePicker {...common} />;
}

// A class that isn't recurring-enabled has no schedule to pick — it just
// needs to land in the cart so the payment step below has something to show.
// Adds itself once (a ref guard, since the product/session effects this sits
// beside can re-render) and renders nothing.
function OneTimeAutoEnroll({ productId, productName, price, storeUserId, storeName, productImage, multipleProductSingleCart }) {
  const { items, add, setQty } = useCart();
  const added = useRef(false);
  // Real rule: "Multiple products/services in single cart" set to SINGLE (2)
  // means one class per order, full stop — verified this is what the real
  // marketplace webapp actually blocks on, not just quantity. A different
  // product already sitting in the cart means this one can't be silently
  // added alongside it.
  const blockedByCartRule =
    multipleProductSingleCart === 2 && items.length > 0 && items.some((it) => it.id !== productId);

  useEffect(() => {
    if (added.current || blockedByCartRule) return;
    added.current = true;
    add(
      { id: storeUserId, name: storeName },
      { id: productId, name: productName, price, image: productImage }
    );
    setQty(productId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, storeUserId, blockedByCartRule]);

  if (blockedByCartRule) {
    return (
      <div className="sub-cart-block" role="alert">
        <p>
          This teacher only accepts one class per order. Clear your cart before enrolling in
          {productName ? ` "${productName}"` : " this class"}.
        </p>
        <style>{cartBlockCss}</style>
      </div>
    );
  }

  return null;
}

function SubscribePicker({ productId, productName, price, storeUserId, storeName, productImage, multipleProductSingleCart }) {
  const router = useRouter();
  const params = useSearchParams();
  const { items, add, setQty } = useCart();
  const [session, setSession] = useState(null);
  // Same real "one class per order" rule OneTimeAutoEnroll enforces (see its
  // comment) — checked here too since this is the OTHER of the only two
  // places this build ever adds to the cart.
  const blockedByCartRule =
    multipleProductSingleCart === 2 && items.length > 0 && items.some((it) => it.id !== productId);

  useEffect(() => {
    setSession(getSession());
    const onChange = () => setSession(getSession());
    window.addEventListener("yelo-session", onChange);
    return () => window.removeEventListener("yelo-session", onChange);
  }, []);

  // Coming BACK from checkout's "Schedule" step: the choices the parent already
  // made ride on the URL, so rehydrate them instead of resetting to defaults.
  const qpDays = (params.get("days") || "").split(",").filter(Boolean).map(Number);
  const qpFreq = params.get("frequency");
  const [preset, setPreset] = useState(
    PRESETS.some((p) => p.key === qpFreq) ? qpFreq : qpDays.length ? "custom" : "everyday"
  );
  const [days, setDays] = useState(qpDays.length ? qpDays : PRESETS[0].days);
  const [date, setDate] = useState(params.get("start") || todayISO());
  const [time, setTime] = useState(params.get("time") || "");
  const [occurrences, setOccurrences] = useState(Math.max(1, Number(params.get("occurrences")) || 8));
  // The "After N sessions" field used to be a plain controlled number input
  // wired straight to `occurrences` — forcing every keystroke through
  // `Math.max(1, Number(value) || 1)`. That's fine once a full number is
  // typed, but the moment the field is EMPTY mid-edit (select-all + retype,
  // the normal way to change "8" to "50"), `Number("") || 1` snapped the
  // field straight back to "1" before the next digit ever landed — so typing
  // "5" then "0" actually continued from "1", not from nothing. A separate
  // draft string lets the field hold whatever's actually been typed,
  // including briefly empty, while `occurrences` (the real value everything
  // else here — the bill, the summary — reacts to) only updates once the
  // draft is a genuinely valid number greater than 0.
  const [occurrencesDraft, setOccurrencesDraft] = useState(String(occurrences));
  const [occurrencesInvalid, setOccurrencesInvalid] = useState(false);

  const [slotState, setSlotState] = useState("loading"); // loading | real | fallback
  const [times, setTimes] = useState(() => buildFallbackTimes(todayISO()));
  const [billState, setBillState] = useState("idle"); // idle | loading | real | estimate
  const [realBill, setRealBill] = useState(null); // { perSession, occurrences, total } from a real get_bill_breakdown

  useEffect(() => {
    if (!storeUserId) return;
    let cancelled = false;
    async function load() {
      setSlotState("loading");
      try {
        const res = await fetch(`${YELO_BASE}/recurring/getRecurringSlots`, {
          method: "POST",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
          body: JSON.stringify({
            ...YELO_TENANT,
            date,
            vendor_id: session?.vendorId || 0,
            access_token: session?.token,
            user_id: storeUserId,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        const now = new Date();
        if (json?.status === 200 && Array.isArray(json?.data?.slots_array) && json.data.slots_array.length) {
          // THE 'Z' ON THESE STRINGS IS FAKE — do not let it trigger a real
          // UTC conversion. The backend builds each slot as
          // `date + 'T' + storedTime + ':00.000Z'` (recurringController.js
          // getRecurringSlots), where storedTime is the merchant's raw,
          // timezone-less HH:mm from tb_recurring_schedule — the 'Z' just
          // gets tacked on, it doesn't mean the value is actually UTC. The
          // real webapp knows this: it parses these strings with
          // moment(date, 'YYYY-MM-DD HH:mm') — a format with no timezone
          // token at all, so moment reads the literal digits and ignores the
          // 'Z' entirely (recurring-tasks.component.ts intervalsNew()).
          //
          // Letting `new Date(iso)` do a real UTC→local conversion (what
          // this used to do) silently shifts every slot by the browser's UTC
          // offset — a merchant's real 21:11 slot became "02:41 next day" in
          // IST, which falls outside the merchant's actual configured hours,
          // so the order was rejected with "Order date time is not
          // available" even though a real, bookable slot was picked.
          // Confirmed against a live saveRecurringTask call. Reading the
          // literal digits instead (never through Date's UTC parsing) is
          // what makes the value round-trip correctly.
          const parseLiteral = (iso) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
            if (!m) return null;
            const [y, mo, d, h, mi] = m.slice(1).map(Number);
            return new Date(y, mo - 1, d, h, mi);
          };
          const real = json.data.slots_array
            .map((iso) => parseLiteral(iso))
            .filter((d) => d && d >= now)
            .map((d) => {
              const hh = String(d.getHours()).padStart(2, "0");
              const mm = String(d.getMinutes()).padStart(2, "0");
              const h12 = d.getHours() % 12 || 12;
              const ampm = d.getHours() < 12 ? "AM" : "PM";
              return { value: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` };
            });
          setTimes(real);
          setSlotState(real.length ? "real" : "empty");
        } else {
          setTimes(buildFallbackTimes(date));
          setSlotState("fallback");
        }
      } catch {
        if (!cancelled) {
          setTimes(buildFallbackTimes(date));
          setSlotState("fallback");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [date, storeUserId, session]);

  // If the selected time falls out of the list (e.g. it already passed once
  // the real/fallback slots were filtered), drop the stale selection instead
  // of silently keeping an unpickable value selected.
  useEffect(() => {
    if (!time || slotState === "loading") return;
    if (!times.some((t) => t.value === time)) setTime("");
  }, [times, slotState]);

  const toggleDay = (i) => {
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()));
    setPreset("custom");
  };

  const applyPreset = (p) => {
    setPreset(p.key);
    if (p.days) setDays(p.days);
  };

  const daysDisabled = preset === "fortnight" || preset === "monthly";
  // Fortnight/Monthly don't let the parent pick multiple weekdays — the
  // single day repeated is whichever weekday the start date falls on. `days`
  // itself is left over from whatever preset was active before (e.g. all 7
  // from "Everyday"), so reading it directly here showed every day as the
  // "anchor" even though only one was ever actually booked.
  const effectiveDays = useMemo(
    () => (daysDisabled ? [new Date(`${date}T00:00:00`).getDay()] : days),
    [daysDisabled, date, days]
  );
  const sessionCount = occurrences;
  const estimatedTotal = price * Math.max(sessionCount, 0);

  // See occurrenceCountToSend()'s comment for the real, verified backend bug
  // this corrects for. Only meaningful when cycle_type is 0 (not
  // Fortnight/Monthly, which step through dates completely differently).
  const cycleTypeNow = PRESETS.find((p) => p.key === preset)?.cycle ?? 0;
  const requestedOccurrenceCount = cycleTypeNow
    ? occurrences
    : occurrenceCountToSend(date, effectiveDays, occurrences);

  // attempt the real bill preview whenever the schedule changes meaningfully
  useEffect(() => {
    if (!days.length || !time) {
      setBillState("idle");
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setBillState("loading");
      const preset_ = PRESETS.find((p) => p.key === preset);
      const recurringBody = {
        day_array: effectiveDays,
        start_schedule: date,
        schedule_time: time,
        is_recurring_enabled: true,
        cycle_type: preset_?.cycle ?? 0,
        occurrence_count: String(requestedOccurrenceCount),
      };
      try {
        const res = await fetch(`${YELO_BASE}/get_bill_breakdown`, {
          method: "POST",
          headers: { "Content-Type": "application/json", base_version: "1.0.0", device_type: "WEB" },
          body: JSON.stringify({
            ...YELO_TENANT,
            ...COORDS,
            vendor_id: session?.vendorId || 0,
            access_token: session?.token,
            user_id: storeUserId,
            amount: price,
            products: JSON.stringify([{ product_id: productId, quantity: 1, unit_price: price }]),
            self_pickup: 1,
            is_app_product_tax_enabled: 1,
            promo_id: 0,
            tip_type: -1,
            ...recurringBody,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (json?.status === 200 && json?.data) {
          const b = json.data;
          setRealBill({
            perSession: b.NET_PAYABLE_AMOUNT ?? price,
            occurrences: b.OCCURRENCE_COUNT ?? sessionCount,
            total: b.TOTAL_RECURRING_AMOUNT ?? b.NET_PAYABLE_AMOUNT ?? estimatedTotal,
          });
          setBillState("real");
        } else {
          setRealBill(null);
          setBillState("estimate");
        }
      } catch {
        if (!cancelled) {
          setRealBill(null);
          setBillState("estimate");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [days, date, time, occurrences, preset, daysDisabled, storeUserId, productId, price, session]);

  const proceed = () => {
    if (blockedByCartRule) return;
    // Populate the real, shared cart (single-merchant — the same `useCart()`
    // CheckoutPanel reads) so checkout actually has this class in it, instead
    // of relying only on URL params RecurringSummary displays.
    //
    // `add()` INCREMENTS quantity if the product is already in the cart —
    // right for a physical good you might want two of, wrong here: there's no
    // "seats" control anywhere on this page, so the only way qty ever moves
    // past 1 is a parent going back and hitting "Confirm & enroll" again. For
    // a class enrollment that reads as "3× P1 ₹300" at checkout with nothing
    // the parent did explaining the 3 — and for a subscription it's worse,
    // since the real quantity that matters (how many sessions) is the
    // day/time schedule below, never this cart line. Force it back to 1 every
    // time so repeat visits can't silently stack up a quantity nobody chose.
    add(
      { id: storeUserId, name: storeName },
      { id: productId, name: productName, price, image: productImage }
    );
    setQty(productId, 1);

    const p = new URLSearchParams({
      product: String(productId),
      recurring: "1",
      frequency: preset,
      days: effectiveDays.join(","),
      start: date,
      time: time || times[0]?.value || "",
      occurrences: String(occurrences),
    });
    router.push(`/checkout?${p.toString()}`);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const timeLabel = time ? times.find((t) => t.value === time)?.label || time : null;

  return (
    <div className="bell-sub" aria-label="Set up your subscription">
      <div className="sub-main">
        <div className="sub-head">
          <p className="sub-eyebrow">Enroll {productName ? `in ${productName}` : "in this class"}</p>
          <h3>Set up your subscription</h3>
          <p className="sub-sub">Pick how often it runs, which days and time, and when it ends. You confirm and pay on the next step.</p>
        </div>

        <div className="sub-block">
          <p className="sub-label">Frequency</p>
          <div className="sub-presets" role="tablist" aria-label="Frequency">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={preset === p.key}
                data-on={preset === p.key}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sub-block">
          <p className="sub-label">{daysDisabled ? "Anchor day" : "Days of the week"}</p>
          <div className="sub-days" aria-label="Days of the week">
            {DAY_LETTERS.map((l, i) => (
              <button
                key={i}
                type="button"
                data-on={effectiveDays.includes(i)}
                disabled={daysDisabled}
                onClick={() => toggleDay(i)}
                aria-pressed={effectiveDays.includes(i)}
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
              >
                {l}
              </button>
            ))}
          </div>
          {daysDisabled && <p className="sub-hint">Repeats {preset === "fortnight" ? "every 14 days" : "on this date each month"} from your start date.</p>}
        </div>

        <div className="sub-grid">
          <div className="sub-field">
            <DatePicker label="📅 Start date" value={date} min={todayISO()} onChange={setDate} />
          </div>
          <label className="sub-field">
            <span>🕓 Time <i>({slotState === "real" ? "live" : slotState === "empty" ? "none left today" : "typical"})</i></span>
            <select value={time} onChange={(e) => setTime(e.target.value)} disabled={slotState === "empty"}>
              <option value="" disabled>{slotState === "empty" ? "No times left" : "Choose…"}</option>
              {times.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>
        {slotState === "fallback" && (
          <p className="sub-note">Sign in to see this teacher's real open times — showing typical hours for now.</p>
        )}
        {slotState === "empty" && (
          <p className="sub-note">This teacher has no more openings today — pick another date to see times.</p>
        )}

        <div className="sub-block">
          <p className="sub-label">Ends</p>
          <div className="sub-end">
            <label className={`sub-radio${occurrencesInvalid ? " sub-radio-invalid" : ""}`}>
              After
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="sub-inline-number"
                aria-invalid={occurrencesInvalid}
                value={occurrencesDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  setOccurrencesDraft(raw);
                  const n = Number(raw);
                  // Live validation per the actual rule ("a number greater
                  // than 0"): a real positive integer commits immediately so
                  // the bill/summary track what's typed as it's typed. An
                  // empty field, "0", a negative number or stray text just
                  // flags invalid — it does NOT reset the field or the last
                  // good `occurrences`, so typing continues undisturbed.
                  const valid = raw.trim() !== "" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
                  setOccurrencesInvalid(!valid);
                  if (valid) setOccurrences(n);
                }}
                onBlur={() => {
                  // Leaving the field with nothing valid in it — snap back to
                  // the last real value instead of leaving "Ends" pointed at
                  // an empty or invalid number.
                  if (occurrencesInvalid) {
                    setOccurrencesDraft(String(occurrences));
                    setOccurrencesInvalid(false);
                  }
                }}
              />
              sessions
            </label>
            {occurrencesInvalid && (
              <p className="sub-inline-error" role="alert">Enter a number greater than 0</p>
            )}
          </div>
        </div>
      </div>

      <aside className="sub-summary">
        <p className="sub-summary-kind">Subscription summary</p>
        {productName && <p className="sub-summary-item">{productName}{storeName ? ` · ${storeName}` : ""}</p>}
        <dl className="sub-summary-grid">
          <div><dt>Frequency</dt><dd style={{ textTransform: "capitalize" }}>{preset === "custom" ? "Custom" : PRESETS.find((p) => p.key === preset)?.label || "—"}</dd></div>
          <div><dt>Days</dt><dd>{effectiveDays.length ? effectiveDays.map((d) => DAY_NAMES[d]).join(", ") : "—"}</dd></div>
          <div><dt>Time</dt><dd>{timeLabel || "Not picked yet"}</dd></div>
          <div><dt>Starts</dt><dd>{date || "—"}</dd></div>
          <div><dt>Ends</dt><dd>After {occurrences} session{occurrences === 1 ? "" : "s"}</dd></div>
          <div><dt>Sessions</dt><dd>{(realBill?.occurrences ?? sessionCount) || "—"}</dd></div>
        </dl>
        <div className="sub-price-row">
          <span>
            {realBill ? `₹${realBill.perSession.toLocaleString()} × ${realBill.occurrences}` : price ? `₹${price.toLocaleString()} × ${sessionCount}` : "—"}
          </span>
          <b>{realBill ? `₹${realBill.total.toLocaleString()}` : price ? `₹${estimatedTotal.toLocaleString()}` : "—"}</b>
        </div>
        <p className="sub-price-tag">
          {billState === "loading" ? "Checking exact price…"
            : billState === "real" ? "Exact total from the real bill"
            // Once signed in, a stuck "estimate" isn't an auth problem —
            // telling a signed-in parent to "sign in" for the real total
            // is just wrong, not merely imprecise.
            : session ? "Estimated — exact total confirms at checkout"
            : "Estimated — sign in for the exact total"}
        </p>
        {slotState === "fallback" && (
          <p className="sub-note">These are typical hours, not this teacher's real slots — sign in to pick a bookable time before subscribing.</p>
        )}
        <button
          type="button"
          className="sub-cta"
          onClick={proceed}
          // A guessed (fallback) time isn't one of the teacher's real slots —
          // the backend checks schedule_time against its own configured
          // slots exactly, so a subscription built on a guess is rejected at
          // save time ("Order date time is not available") instead of here,
          // where it's still fixable. Block it before that happens.
          disabled={!days.length || !time || slotState === "fallback"}
        >
          Proceed to pay
        </button>
      </aside>

      <style>{css}</style>
    </div>
  );
}

const css = `
/* Matches the checkout ("Details & payment"): a page-width two-column grid,
   the form in a card on the left, an elevated sticky summary on the right —
   same tokens, radii and shadow language as the .ck-* checkout. */
.bell-sub{
  margin:28px auto 0; max-width:1000px;
  display:grid; grid-template-columns:1fr; gap:16px; align-items:start;
  font-family:var(--sans, var(--brand-font-body)); color:var(--ink, var(--brand-ink));
}
@media (min-width:900px){ .bell-sub{ grid-template-columns:1fr 360px; } }

.sub-main{
  background:var(--card, var(--brand-surface));
  border:1px solid var(--line, var(--brand-line));
  border-radius:var(--r-lg, var(--radius-lg));
  padding:22px; display:grid; gap:22px;
}
.sub-head{ display:grid; gap:10px; }
.sub-eyebrow{ margin:0; font-size:.78rem; font-weight:600; color:var(--muted, var(--brand-ink-soft)); }
.sub-head h3{ margin:0; font-family:var(--display, var(--brand-font-display)); font-weight:700; letter-spacing:-.02em; font-size:clamp(1.3rem,3vw,1.6rem); }
.sub-sub{ margin:0; font-size:.86rem; line-height:1.5; color:var(--muted, var(--brand-ink-soft)); max-width:46ch; }

.sub-block{ display:grid; gap:10px; }
.sub-label{ margin:0; font-size:.76rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--brand-ink-soft); }

.sub-presets{ display:flex; flex-wrap:wrap; gap:6px; }
.sub-presets button{
  border:1px solid var(--brand-line); background:var(--brand-paper); color:var(--brand-ink-soft);
  font:inherit; font-size:.84rem; font-weight:600; padding:8px 14px; border-radius:980px; cursor:pointer;
  transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease), border-color var(--motion) var(--motion-ease);
}
.sub-presets button[data-on="true"]{ background:var(--brand-accent); border-color:var(--brand-accent); color:var(--brand-accent-ink); }

.sub-days{ display:flex; gap:8px; }
.sub-days button{
  width:38px; height:38px; border-radius:50%; border:1px solid var(--brand-line);
  background:var(--brand-paper); color:var(--brand-ink-soft); font-weight:700; font-size:.85rem; cursor:pointer;
  transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease), transform var(--motion) var(--motion-ease);
}
.sub-days button[data-on="true"]{ background:var(--brand-ink); color:var(--brand-accent-ink); border-color:var(--brand-ink); transform:scale(1.06); }
.sub-days button:disabled{ opacity:.35; cursor:not-allowed; transform:none; }
.sub-hint{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); }

.sub-grid{ display:grid; gap:14px; grid-template-columns:1fr; }
@media (min-width:560px){ .sub-grid{ grid-template-columns:1fr 1fr; } }
.sub-field{ display:grid; gap:6px; font-size:.78rem; font-weight:700; letter-spacing:.02em; color:var(--brand-ink-soft); }
.sub-field i{ font-style:normal; font-weight:500; text-transform:none; opacity:.8; }
.sub-field select{
  font:inherit; text-transform:none; letter-spacing:normal; font-weight:400; font-size:.92rem;
  padding:11px 12px; border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-paper); color:var(--brand-ink);
}
.sub-note{ margin:-8px 0 0; font-size:.78rem; color:var(--brand-ink-soft); font-style:italic; }

.sub-end{ display:grid; gap:6px; }
.sub-radio{ display:flex; align-items:center; gap:8px; font-size:.9rem; }
.sub-radio input[type="radio"]{ accent-color:var(--brand-accent); }
.sub-inline-number{ width:64px; padding:6px 8px; border:1px solid var(--brand-line); border-radius:8px; background:var(--brand-paper); color:var(--brand-ink); font:inherit; transition:border-color var(--motion) var(--motion-ease); }
.sub-radio-invalid .sub-inline-number{ border-color:#c0392b; }
.sub-inline-number:focus-visible{ outline:2px solid var(--brand-accent); outline-offset:1px; }
.sub-inline-error{ margin:0; font-size:.78rem; color:#c0392b; }

.sub-summary{
  background:var(--card, var(--brand-surface));
  border:1px solid var(--line, var(--brand-line));
  border-radius:var(--r-lg, var(--radius-lg));
  padding:20px; display:flex; flex-direction:column; gap:13px;
  box-shadow:var(--sh-md, 0 12px 28px -12px color-mix(in srgb, var(--brand-ink) 18%, transparent));
}
@media (min-width:900px){ .sub-summary{ position:sticky; top:74px; } }
.sub-summary-kind{ margin:0; font-family:var(--display, var(--brand-font-display)); font-weight:700; font-size:1rem; letter-spacing:-.01em; }
.sub-summary-item{ margin:-4px 0 0; font-size:.85rem; font-weight:600; color:var(--ink, var(--brand-ink)); }
.sub-summary-grid{ margin:0; display:grid; gap:9px; padding:12px 0; border-top:1px solid var(--line, var(--brand-line)); border-bottom:1px solid var(--line, var(--brand-line)); }
.sub-summary-grid > div{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.sub-summary-grid dt{ font-size:.72rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--muted, var(--brand-ink-soft)); }
.sub-summary-grid dd{ margin:0; font-weight:600; font-size:.84rem; text-align:right; }
.sub-price-row{ display:flex; align-items:baseline; justify-content:space-between; font-size:.9rem; }
.sub-price-row b{ font-family:var(--display, var(--brand-font-display)); font-size:1.2rem; }
.sub-price-tag{ margin:0; font-size:.74rem; color:var(--muted, var(--brand-ink-soft)); font-style:italic; }

.sub-cta{
  margin-top:4px; padding:14px 20px; border-radius:var(--r, var(--radius)); border:0;
  background:var(--brand, var(--brand-accent)); color:var(--on-brand, var(--brand-accent-ink));
  font-family:var(--display, var(--brand-font-display)); font-weight:700; font-size:.95rem; cursor:pointer;
  transition:filter var(--t), transform 140ms cubic-bezier(.2,.7,.3,1);
}
.sub-cta:hover:not(:disabled){ filter:brightness(1.06); transform:translateY(-1px); }
.sub-cta:disabled{ opacity:.55; cursor:not-allowed; }

.bell-sub :is(button,input,select):focus-visible{ outline:3px solid var(--brand, var(--brand-accent)); outline-offset:2px; }
@media (prefers-reduced-motion:reduce){ .sub-cta:hover:not(:disabled){ transform:none; } .sub-days button[data-on="true"]{ transform:none; } }
`;
