// Pure order-contract logic — NO IMPORTS, on purpose, same as bill.js.
//
// This file is the wire contract for placing an order, kept separate from the
// code that performs the request so it can be tested without a network, a
// tenant, or Next's module resolution. That separation is not tidiness: the
// order body shipped with five wrong field names because the only way to check
// one was to place a real order against a live backend.
//
// Every value below is cited to the handler that reads it:
//   yelo-server/routes/v2/customer_open_apis.js  exports.createTaskViaVendorV3
// See tenant-demo/docs/YELO_API_REFERENCE.md §4 for the full contract.

// PAYMENT METHOD VALUES — verified in BOTH repos, never edit from memory.
//   yelo-server/properties/constants.js:472-606   merchantPaymentMethodsMasks
//   yelo-marketplace-webapp/src/app/enums/enum.ts:75-91   PaymentMode
//
// This said CASH: 4 for months. Four is not a payment method in this system;
// the order is created with no method attached and it surfaces in the
// merchant's accounts rather than as an error anyone sees.
// tests/suites/apiref-checkout.test.js cross-checks these against both files.
export const PAYMENT = {
  CASH: 8,
  PAY_ON_DELIVERY: 9,
  WALLET: 16384,
  PAYLATER: 65536,
};

// The backend's own mandatory list, in its own order, from
// customer_open_apis.js:5777-5787. Data rather than a pile of ifs, so the
// preflight and its tests read from one place.
const REQUIRED_ORDER_FIELDS = [
  ['job_pickup_name', 'a name for the order'],
  ['job_pickup_datetime', 'a delivery time'],
  ['job_pickup_latitude', 'a delivery location'],
  ['job_pickup_longitude', 'a delivery location'],
  ['job_pickup_address', 'a delivery address'],
  ['currency_id', 'the tenant currency'],
  ['marketplace_user_id', 'the tenant id'],
];

// The backend's REGISTER_METHOD constants. Anything else means BOTH.
const SIGNUP_EMAIL = 1;
const SIGNUP_PHONE = 2;

// Which contact field this tenant's order must carry. The handler branches on
// signup_field (customer_open_apis.js:5780-5786); hard-coding either one breaks
// every tenant configured the other way.
export function requiredContactFields(config) {
  if (config?.guestCheckout) return [];
  if (config?.signupField === SIGNUP_EMAIL) return ['job_pickup_email'];
  if (config?.signupField === SIGNUP_PHONE) return ['job_pickup_phone'];
  return ['job_pickup_email', 'job_pickup_phone'];
}

// Names the missing fields IN HUMAN TERMS before we spend a round trip finding
// out. The backend answers a blank mandatory entry with a generic
// PARAMETER_MISSING that names nothing, so without this the customer sees
// "Can not process" and nobody can tell which field was empty.
export function missingOrderFields(body, config) {
  const contact = requiredContactFields(config).map((f) => [
    f, f === 'job_pickup_email' ? 'an email address' : 'a phone number',
  ]);
  return [...REQUIRED_ORDER_FIELDS, ...contact]
    .filter(([key]) => {
      const v = body?.[key];
      return v === undefined || v === null || v === '';
    })
    .map(([key, human]) => ({ key, human }));
}

// The backend wants `YYYY-MM-DD HH:MM:SS` and interprets it in the TENANT's
// timezone. An ISO Z stamp shifts every order by the UTC offset.
export function nowForBackend(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Arguments in, wire body out. `envelope` is passed in rather than imported so
// this module stays dependency-free.
export function buildOrderBody({
  storeId, items, address, session, paymentType, bill,
  deliveryType = 1, config = {}, scheduledFor, envelope = {},
}) {
  const products = (items || []).map((it) => ({
    product_id: it.id,
    quantity: it.qty,
    unit_price: it.price,
    name: it.name,
    seller_id: Number(storeId),
  }));

  return {
    ...envelope,
    user_id: Number(storeId),      // the MERCHANT — yelo naming: user_id = seller
    vendor_id: session?.vendorId,  // the CUSTOMER — vendor_id = buyer
    access_token: session?.token,
    products: JSON.stringify(products),

    // `payment_method` on the wire. The handler assigns it to an internal field
    // named payment_type (:5640) — sending `payment_type` reaches nothing and
    // parseInt(undefined) is NaN.
    payment_method: paymentType,

    // `amount`, not `total_payable`. NET_PAYABLE_AMOUNT straight from
    // get_bill_breakdown — never a total recomputed on the client, which will
    // disagree with the backend for legitimate tenant-config reasons.
    amount: bill?.total,
    delivery_charge: bill?.deliveryCharge,

    // Mandatory block. `job_pickup_*` is the wire spelling for all of it. An
    // earlier version sent `customer_address`, which the handler never reads,
    // so job_address arrived blank and manData rejected every order.
    job_pickup_name: session?.name || '',
    job_pickup_email: session?.email || '',
    job_pickup_phone: session?.phone || '',
    job_pickup_address: address?.text || '',
    job_pickup_latitude: address?.lat,
    job_pickup_longitude: address?.lng,
    job_pickup_datetime: scheduledFor || nowForBackend(),
    currency_id: config?.currencyId,

    latitude: address?.lat,
    longitude: address?.lng,

    // `is_scheduled`, not `is_schedule` (:5636).
    is_scheduled: scheduledFor ? 1 : 0,
    job_delivery_datetime: scheduledFor || '',

    self_pickup: deliveryType === 2 ? 1 : 0,
    home_delivery: deliveryType === 1 ? 1 : 0,

    // Both real clients hard-code this (checkout.service.ts:245,
    // payment.service.ts:48).
    is_app_product_tax_enabled: 1,
    // Claiming menus on a tenant without them changes how the order is priced.
    ...(config?.menuEnabled ? { is_app_menu_enabled: 1 } : {}),
  };
}
