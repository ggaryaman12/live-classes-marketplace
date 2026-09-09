"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
 */

const YELO_BASE = "https://test-api-3025.jungleworks.com";
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: "7a57517ff024ea5715497555a297e86c",
  domain_name: "deliverecttest.freelancer.jungleworks.me",
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
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function countOccurrences(startISO, endISO, dayIds) {
  if (!dayIds.length) return 0;
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (end < start) return 0;
  let n = 0;
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 1000) {
    guard++;
    if (dayIds.includes(cur.getDay())) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
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
  const id = params.get("id");
  const [product, setProduct] = useState(null);

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
        setProduct(p && p.is_recurring_enabled === 1 ? p : false);
      } catch {
        if (!cancelled) setProduct(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!product) return null;
  return (
    <SubscribePicker
      productId={product.product_id}
      productName={product.name}
      price={Number(product.price) || 0}
      storeUserId={product.user_id}
      storeName={product.store_name || "This teacher"}
      productImage={product.image_url || ""}
    />
  );
}

function SubscribePicker({ productId, productName, price, storeUserId, storeName, productImage }) {
  const router = useRouter();
  const { add, setQty } = useCart();
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(getSession());
    const onChange = () => setSession(getSession());
    window.addEventListener("yelo-session", onChange);
    return () => window.removeEventListener("yelo-session", onChange);
  }, []);
  const [mode, setMode] = useState("subscribe"); // instant | subscribe
  const [preset, setPreset] = useState("everyday");
  const [days, setDays] = useState(PRESETS[0].days);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [endMode, setEndMode] = useState("occurrences"); // date | occurrences
  const [endDate, setEndDate] = useState(addDaysISO(todayISO(), 28));
  const [occurrences, setOccurrences] = useState(8);

  const [slotState, setSlotState] = useState("loading"); // loading | real | fallback
  const [times, setTimes] = useState(() => buildFallbackTimes(todayISO()));
  const [billState, setBillState] = useState("idle"); // idle | loading | real | estimate
  const [realBill, setRealBill] = useState(null); // { perSession, occurrences, total } from a real get_bill_breakdown

  useEffect(() => {
    if (mode !== "subscribe" || !storeUserId) return;
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
  }, [mode, date, storeUserId, session]);

  // If the selected time falls out of the list (e.g. it already passed once
  // the real/fallback slots were filtered), drop the stale selection instead
  // of silently keeping an unpickable value selected.
  useEffect(() => {
    if (!time) return;
    if (!times.some((t) => t.value === time)) setTime("");
  }, [times]);

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
  const sessionCount =
    endMode === "occurrences" ? occurrences : countOccurrences(date, endDate, effectiveDays);
  const estimatedTotal = price * Math.max(sessionCount, 0);

  // attempt the real bill preview whenever the schedule changes meaningfully
  useEffect(() => {
    if (mode !== "subscribe" || !days.length || !time) {
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
        ...(endMode === "occurrences" ? { occurrence_count: String(occurrences) } : { end_schedule: endDate }),
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
  }, [mode, days, date, time, endMode, endDate, occurrences, preset, daysDisabled, storeUserId, productId, price, session]);

  const proceed = () => {
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

    if (mode !== "subscribe") {
      router.push(`/checkout?product=${productId}`);
      return;
    }
    const p = new URLSearchParams({
      product: String(productId),
      recurring: "1",
      frequency: preset,
      days: effectiveDays.join(","),
      start: date,
      time: time || times[0]?.value || "",
      endMode,
    });
    if (endMode === "date") p.set("endDate", endDate);
    else p.set("occurrences", String(occurrences));
    router.push(`/checkout?${p.toString()}`);
  };

  return (
    <div className="bell-sub" aria-label="Set your preference">
      <div className="sub-main">
        <div className="sub-head">
          <p className="sub-eyebrow">Enroll {productName ? `in ${productName}` : "in this class"}</p>
          <h3>Set your preference</h3>
          <div className="sub-mode" role="tablist" aria-label="Order type">
            <button type="button" role="tab" aria-selected={mode === "instant"} data-on={mode === "instant"} onClick={() => setMode("instant")}>
              Instant order
            </button>
            <button type="button" role="tab" aria-selected={mode === "subscribe"} data-on={mode === "subscribe"} onClick={() => setMode("subscribe")}>
              Subscribe
            </button>
          </div>
        </div>

        {mode === "subscribe" && (
          <>
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
                <label className="sub-radio">
                  <input type="radio" name="end-mode" checked={endMode === "occurrences"} onChange={() => setEndMode("occurrences")} />
                  After
                  <input
                    type="number"
                    min="1"
                    className="sub-inline-number"
                    value={occurrences}
                    disabled={endMode !== "occurrences"}
                    onChange={(e) => setOccurrences(Math.max(1, Number(e.target.value) || 1))}
                  />
                  sessions
                </label>
                <label className="sub-radio sub-radio-date">
                  <span className="sub-radio-head">
                    <input type="radio" name="end-mode" checked={endMode === "date"} onChange={() => setEndMode("date")} />
                    On date
                  </span>
                  <span className="sub-inline-date">
                    <DatePicker value={endDate} min={date} onChange={setEndDate} disabled={endMode !== "date"} />
                  </span>
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      <aside className="sub-summary">
        <p className="sub-summary-kind">{mode === "subscribe" ? "Subscription summary" : "One-time class"}</p>
        {mode === "subscribe" ? (
          <>
            <dl className="sub-summary-grid">
              <div><dt>Days</dt><dd>{effectiveDays.length ? effectiveDays.map((d) => DAY_NAMES[d]).join(", ") : "—"}</dd></div>
              <div><dt>Time</dt><dd>{time ? times.find((t) => t.value === time)?.label || time : "—"}</dd></div>
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
          </>
        ) : (
          <div className="sub-price-row">
            <span>Per session</span>
            <b>{price ? `₹${price.toLocaleString()}` : "—"}</b>
          </div>
        )}
        {mode === "subscribe" && slotState === "fallback" && (
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
          disabled={mode === "subscribe" && (!days.length || !time || slotState === "fallback")}
        >
          Proceed to pay
        </button>
      </aside>

      <style>{css}</style>
    </div>
  );
}

const css = `
.bell-sub{
  border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  background:var(--brand-surface); margin:36px 0 0; overflow:hidden;
  display:grid; grid-template-columns:1fr; font-family:var(--brand-font-body); color:var(--brand-ink);
  box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
@media (min-width:820px){ .bell-sub{ grid-template-columns:1fr 300px; } }

.sub-main{ padding:26px; display:grid; gap:22px; }
.sub-head{ display:grid; gap:10px; }
.sub-eyebrow{ margin:0; font-size:.78rem; font-weight:600; color:var(--brand-ink-soft); }
.sub-head h3{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:1.35rem; }
.sub-mode{ display:inline-flex; padding:4px; border-radius:980px; background:var(--brand-paper); border:1px solid var(--brand-line); width:fit-content; }
.sub-mode button{
  border:0; background:transparent; color:var(--brand-ink-soft); font:inherit; font-weight:600; font-size:.86rem;
  padding:9px 18px; border-radius:980px; cursor:pointer; transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.sub-mode button[data-on="true"]{ background:var(--brand-ink); color:var(--brand-accent-ink); }

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

.sub-end{ display:grid; gap:10px; }
.sub-radio{ display:flex; align-items:center; gap:8px; font-size:.9rem; }
.sub-radio input[type="radio"]{ accent-color:var(--brand-accent); }
.sub-inline-number{ width:64px; padding:6px 8px; border:1px solid var(--brand-line); border-radius:8px; background:var(--brand-paper); color:var(--brand-ink); font:inherit; }
.sub-radio-date{ align-items:flex-start; flex-direction:column; gap:8px; }
.sub-radio-head{ display:flex; align-items:center; gap:8px; }
.sub-inline-date{ padding-left:26px; max-width:240px; }

.sub-summary{
  background:var(--brand-paper); border-top:1px solid var(--brand-line);
  padding:24px; display:flex; flex-direction:column; gap:14px;
}
@media (min-width:820px){ .sub-summary{ border-top:0; border-left:1px solid var(--brand-line); } }
.sub-summary-kind{ margin:0; font-family:var(--brand-font-display); font-weight:600; font-size:.92rem; }
.sub-summary-grid{ margin:0; display:grid; gap:8px; }
.sub-summary-grid dt{ font-size:.72rem; color:var(--brand-ink-soft); }
.sub-summary-grid dd{ margin:0; font-weight:600; font-size:.86rem; }
.sub-price-row{ display:flex; align-items:baseline; justify-content:space-between; padding-top:10px; border-top:1px dashed var(--brand-line); font-size:.9rem; }
.sub-price-row b{ font-family:var(--brand-font-display); font-size:1.15rem; }
.sub-price-tag{ margin:0; font-size:.74rem; color:var(--brand-ink-soft); font-style:italic; }

.sub-cta{
  margin-top:4px; padding:13px 20px; border-radius:var(--radius); border:0;
  background:var(--brand-accent); color:var(--brand-accent-ink); font-family:var(--brand-font-display);
  font-weight:600; font-size:.94rem; cursor:pointer;
  transition:filter var(--motion) var(--motion-ease);
}
.sub-cta:hover{ filter:brightness(1.06); }
.sub-cta:disabled{ opacity:.6; cursor:not-allowed; }

.bell-sub :is(button,input,select):focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
`;
