// Central typed data layer for the storefront boilerplate.
//
// Every function wraps a verified YELO endpoint + the tenant envelope. Shapes
// are normalized to small, typed objects the UI components consume — which is
// also what makes these components expressible as component-JSON nodes later
// (a <StoreCard store={...}/> maps cleanly to { type:'StoreCard', props:{...} }).
//
// Backend verified on test-api-3025 with the deliverect tenant:
//   marketplace_fetch_app_configuration           → tenant config (lat/lng, logo)
//   marketplace/marketplace_get_city_storefronts_v3 → store list
//   marketplace_get_city_storefronts_single_v2     → one store
//   product/getAll                                 → catalogue (this tenant's are empty)
//   get_bill_breakdown / create_task_via_vendor_v2 → checkout + order
//   wallet                                         → wallet balance
import { cache } from 'react';
import { yeloPost, tenantEnvelope } from './yeloConfig';
import { normalizeBill } from './bill';
import {
  PAYMENT, requiredContactFields, missingOrderFields, nowForBackend, buildOrderBody,
} from './order';

const DEFAULT_LAT = 28.61482;
const DEFAULT_LNG = 77.219989;

/* ----------------------------- app config ----------------------------- */
// Wrapped in cache() so every caller in a single render shares ONE request.
// This is what lets the layout show an "unreachable" notice without costing an
// extra round trip: the layout and the page both await the same promise.
export const getAppConfig = cache(async function getAppConfig() {
  const r = await yeloPost('marketplace_fetch_app_configuration', { ...tenantEnvelope() });
  const d = r.status === 200 && r.data ? r.data : {};
  return {
    // `company_name`, verified present in the live response. `business_name`
    // does NOT exist — reading it fell through to domain_name, so the
    // storefront displayed a raw hostname as its own name.
    name: d.company_name || d.store_name || d.domain_name || 'Marketplace',
    logo: d.logo || null,
    // `currency_symbol` does NOT exist at the top level. The symbol lives at
    // payment_settings[0].symbol — verified live: this tenant is XCD '$', and
    // reading the absent key rendered EVERY price as '₹'. A wrong currency
    // symbol on a price is the most damaging kind of silent default, because it
    // looks completely normal.
    currency: d.payment_settings?.[0]?.symbol || d.currency_symbol || '₹',
    currencyCode: d.payment_settings?.[0]?.code || null,
    latitude: Number(d.latitude) || DEFAULT_LAT,
    longitude: Number(d.longitude) || DEFAULT_LNG,
    address: d.address || '',
    // NO walletEnabled HERE. Neither `is_wallet_enabled` nor `wallet_enabled`
    // exists in this response, and the real storefront does not read either —
    // the flag was always false and nothing consumed it. Wallet availability is
    // decided by /api/wallet answering 200 for THIS customer, which is the only
    // thing that can actually know. Re-adding a config gate here would silently
    // disable the wallet for every tenant.
    // Needed to PLACE an order, not just to display one. `currency_id` is in
    // the backend's mandatory list for create_task_via_vendor_v2
    // (customer_open_apis.js:5777) — omitting it fails the whole order with
    // PARAMETER_MISSING, which is why it is read here and not left to the
    // checkout screen to invent.
    currencyId: Number(d.currency_id) || null,
    // Which contact field the order MUST carry. The backend branches on the
    // tenant's signup_field (customer_open_apis.js:5780-5786): EMAIL wants an
    // email, PHONE wants a phone, anything else wants both. Hard-coding either
    // one breaks every tenant configured the other way.
    signupField: d.signup_field ?? null,
    // `is_guest_checkout_enabled` is the TENANT flag. `is_guest_account` is a
    // per-CUSTOMER field on vendor_details and is absent from this response
    // entirely — reading it here always produced false, which happened to be
    // safe (it demands contact fields) but for the wrong reason.
    // Verified against the live response, not inferred.
    guestCheckout: Number(d.is_guest_checkout_enabled) === 1,
    menuEnabled: Number(d.is_menu_enabled) === 1,
    // TRUE only when we could not reach the backend at all — not when it
    // answered and simply had nothing. The difference matters: one is an
    // outage we should say out loud, the other is an empty marketplace.
    unreachable: r.unreachable === true,
  };
});

/* ----------------------------- storefronts ---------------------------- */
export async function getStorefronts(latitude, longitude) {
  const r = await yeloPost('marketplace/marketplace_get_city_storefronts_v3', {
    ...tenantEnvelope(), latitude, longitude, vendor_id: 0, source: 0,
  });
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  return r.data.map(normalizeStore).filter((s) => s.name);
}

export async function getStore(storeId, latitude, longitude) {
  const r = await yeloPost('marketplace_get_city_storefronts_single_v2', {
    ...tenantEnvelope(), user_id: Number(storeId), vendor_id: 0, latitude, longitude, source: 0,
  });
  const raw = Array.isArray(r.data) ? r.data[0] : r.data;
  return raw ? normalizeStore(raw) : null;
}

// Normalizes a store AND its ordering restrictions. These rules are the
// marketplace's real constraints — components must respect them regardless of
// how the page is laid out or restyled (AI/drag-drop can move things, never
// break these):
//   • a closed store can't take instant orders…
//   • …but MAY still accept scheduled / pre-orders if enabled
//   • delivery modes (home delivery / self pickup / pick&drop) gate checkout
//   • minimum order blocks checkout below threshold
function normalizeStore(s) {
  const homeDelivery = s.home_delivery === 1;
  const selfPickup = s.self_pickup === 1;
  const pickAndDrop = s.pick_and_drop === 1;
  const availableHome = s.available_for_home_delivery === 1;
  const availablePickup = s.available_for_self_pickup === 1;
  const scheduled = s.scheduled_task === 1;
  const instant = s.instant_task === 1;
  // "Open" = active AND at least one enabled mode is currently available.
  const openNow = s.is_active !== 0 && ((homeDelivery && availableHome) || (selfPickup && availablePickup));
  return {
    id: s.storefront_user_id ?? s.user_id,
    name: s.store_name,
    logo: s.logo || null,
    banner: s.banner_image || null,
    address: s.display_address || s.address || '',
    description: s.description || '',
    rating: Number(s.store_rating) || 0,
    ratingCount: Number(s.total_ratings_count) || 0,
    deliveryTime: Number(s.delivery_time) || null,
    deliveryCharge: Number(s.merchant_delivery_charge) >= 0 ? Number(s.merchant_delivery_charge) : null,
    minOrder: Number(s.merchantMinimumOrder) || 0,
    // --- ordering restrictions ---
    openNow,
    modes: { homeDelivery, selfPickup, pickAndDrop, availableHome, availablePickup },
    scheduling: {
      scheduled,                                   // accepts scheduled orders
      instant,                                     // accepts immediate orders
      preOrder: !!(s.preorder_tag?.is_enabled) || (scheduled && !instant),
      bufferMins: Number(s.pre_booking_buffer) || 0,
    },
    // Can the customer add to cart at all right now?
    canOrder: openNow || scheduled || !!(s.preorder_tag?.is_enabled),
    orderBlockedReason: openNow ? null
      : (scheduled || s.preorder_tag?.is_enabled) ? 'closed-preorder' : 'closed',
  };
}

/* ------------------------------ catalogue ----------------------------- */
// Returns [{ id, name, products:[{id,name,price,image,description,veg}] }]
export async function getCatalogue(storeId, latitude, longitude) {
  const r = await yeloPost('product/getAll', {
    ...tenantEnvelope(), user_id: Number(storeId), vendor_id: 0, latitude, longitude,
  });
  const cats = normalizeCatalogue(r.data);
  const hasProducts = (list) => (list || []).some((c) => (c.products?.length || 0) > 0 || hasProducts(c.children));
  if (cats.length && hasProducts(cats)) return cats;
  // This tenant's stores are empty on the backend. Fall back to a clearly
  // labelled demo catalogue so the cart→checkout→order journey is walkable.
  // Remove `demoCatalogue()` once a tenant with real products is used.
  return demoCatalogue();
}

// Categories are n-level (marketplace supports up to 3: parent → child →
// grandchild via parent_category_id). We return a TREE, so a layout component
// can render it as a sidebar, centered tabs, or nested accordions — the data
// shape doesn't change, only the component that draws it.
const MAX_CATEGORY_DEPTH = 3;

function toProduct(p) {
  const available = !(p.is_available === 0 || p.in_stock === 0 || p.out_of_stock === 1);
  return {
    id: p.id ?? p.product_id,
    name: p.name || p.product_name,
    price: Number(p.selling_price ?? p.price ?? p.cost ?? (p.variants?.[0]?.price)) || 0,
    image: p.image || (Array.isArray(p.images) ? p.images[0] : null) || null,
    description: p.description || '',
    veg: p.is_veg === 1 || p.veg === 1,
    available,                                   // gates the ADD button
    hasOptions: Array.isArray(p.variants) && p.variants.length > 1,
  };
}

function isProduct(o) {
  return o && typeof o === 'object' && (o.name || o.product_name) &&
    (o.price != null || o.cost != null || o.selling_price != null || o.variants);
}

function normalizeCatalogue(data) {
  // Flat collect: { id, name, parentId, products[] }
  const flat = [];
  const walk = (node, parentId, depth) => {
    if (depth > MAX_CATEGORY_DEPTH) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, parentId, depth)); return; }
    if (!node || typeof node !== 'object') return;

    const id = node.category_id ?? node.id ?? node.category_name ?? node.name;
    const name = node.category_name || node.name;
    const products = [];
    const childNodes = [];
    for (const [, v] of Object.entries(node)) {
      if (Array.isArray(v) && v.some(isProduct)) v.filter(isProduct).forEach((p) => products.push(toProduct(p)));
      else if (Array.isArray(v)) childNodes.push(v);
    }
    if (name) {
      flat.push({ id: String(id), name, parentId: node.parent_category_id != null ? String(node.parent_category_id) : parentId ?? null, products, depth });
      childNodes.forEach((c) => walk(c, String(id), depth + 1));
    } else {
      childNodes.forEach((c) => walk(c, parentId, depth));
    }
  };
  walk(data, null, 1);

  // Build the tree from parentId links.
  const byId = new Map(flat.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const parent = c.parentId != null ? byId.get(c.parentId) : null;
    if (parent && parent !== c) parent.children.push(c);
    else roots.push(c);
  }
  return roots;
}

// Flatten a category tree to the sections a menu renders (keeps depth for
// indentation / nested nav).
export function flattenCategories(tree, depth = 1) {
  const out = [];
  for (const c of tree || []) {
    out.push({ id: c.id, name: c.name, depth, products: c.products || [] });
    if (c.children?.length) out.push(...flattenCategories(c.children, depth + 1));
  }
  return out;
}

/* --------------------------- bill breakdown --------------------------- */
// The itemized bill is the heart of checkout, and it mirrors the SaaS
// marketplace's own bill exactly — same endpoint, same backend, so the line
// items and their order match what a customer sees on the live marketplace.
//
// The backend's response keys are inconsistent (UPPERCASE from the payment
// step, lowercase elsewhere), so `num()` reads every known spelling of each
// field. The line ORDER below is the marketplace convention: what you're
// buying, what you saved, what's added, then what you pay.
export async function getBill({ storeId, items, latitude, longitude, session, deliveryType = 1 }) {
  const products = items.map((it) => ({ product_id: it.id, quantity: it.qty, unit_price: it.price }));
  const r = await yeloPost('get_bill_breakdown', {
    ...tenantEnvelope(),
    user_id: Number(storeId),
    vendor_id: session?.vendorId || 0,
    access_token: session?.token || undefined,
    latitude, longitude,
    products: JSON.stringify(products),
    is_app_product_tax_enabled: 1,
    self_pickup: deliveryType === 2 ? 1 : 0,
    // The handler reads `amount` as the cart subtotal (customer_open_apis.js
    // :856-930) and both real clients send it. Promo and minimum-order rules
    // are evaluated against it, so omitting it silently changes the bill.
    amount: products.reduce((s, p) => s + p.unit_price * p.quantity, 0),
    // Documented defaults: 0 = no promo, -1 = no tip. Sending them explicitly
    // keeps the request identical to the storefront's.
    promo_id: 0,
    tip_type: -1,
  });
  const d = r.status === 200 && r.data ? r.data : null;
  if (!d) {
    // Walkable fallback so checkout still functions when a tenant has no bill
    // config; the real bill replaces it the instant the API returns.
    const sub = items.reduce((s, it) => s + it.price * it.qty, 0);
    const delivery = deliveryType === 2 ? 0 : 25;
    const tax = Math.round(sub * 0.05);
    return {
      lines: [
        { key: 'subtotal', label: 'Item total', value: sub, kind: 'subtotal' },
        { key: 'delivery', label: deliveryType === 2 ? 'Delivery (self-pickup)' : 'Delivery', value: delivery, kind: 'charge' },
        { key: 'tax', label: 'Taxes & charges', value: tax, kind: 'charge' },
      ],
      subtotal: sub, walletUsed: 0, total: sub + delivery + tax,
      deliveryCharge: delivery, estimated: true,
    };
  }
  return normalizeBill(d, items, deliveryType);
}

/* ------------------------------ wallet -------------------------------- */
export async function getWallet(session) {
  if (!session?.vendorId) return { balance: 0, currency: '₹', enabled: false };
  const r = await yeloPost('wallet', {
    ...tenantEnvelope(), vendor_id: session.vendorId, access_token: session.token, user_type: 1,
  });
  const d = r.status === 200 && r.data ? r.data : {};
  return { balance: Number(d.wallet_balance ?? d.balance) || 0, currency: d.currency_symbol || '₹', enabled: r.status === 200 };
}

/* --------------------------- place order ------------------------------ */
// The wire contract lives in ./order.js — pure, no imports, so it can be
// tested without a network or a tenant. This file only performs the request.
// Re-exported so existing importers keep working.
export { PAYMENT, requiredContactFields, missingOrderFields, nowForBackend, buildOrderBody };

export async function placeOrder(args) {
  const { config = {} } = args;
  const body = buildOrderBody({ ...args, envelope: tenantEnvelope() });

  // Refuse locally rather than spending a round trip to be told
  // PARAMETER_MISSING with nothing named.
  const missing = missingOrderFields(body, config);
  if (missing.length) {
    return {
      ok: false,
      status: 100,
      message: `Please add ${missing[0].human} before placing the order.`,
      missing: missing.map((m) => m.key),
      orderId: null,
    };
  }

  const r = await yeloPost('create_task_via_vendor_v2', body);
  return {
    ok: r.status === 200,
    status: r.status,
    message: r.message,
    // `data.job_id` is the documented path, matching the real storefront
    // (payment.component.ts:7206). Fallbacks stay for older tenants.
    orderId: r.data?.job_id || r.data?.unique_order_id || r.data?.order_id || null,
    raw: r.data,
  };
}

/* --------------------- demo catalogue (fallback) ---------------------- */
// Clearly-labelled placeholder so the journey works on an empty tenant.
// Demo tree — includes a nested sub-category so n-level rendering is exercised.
function demoCatalogue() {
  const p = (id, name, price, description, veg = true, available = true) =>
    ({ id, name, price, image: null, description, veg, available, hasOptions: false });
  return [
    { id: 'best', name: 'Bestsellers', demo: true, depth: 1, children: [], products: [
      p('d1', 'Margherita Pizza', 249, 'San Marzano tomato, fresh mozzarella, basil'),
      p('d2', 'Butter Chicken', 329, 'Creamy tomato gravy, tandoori chicken', false),
      p('d3', 'Paneer Tikka', 279, 'Char-grilled cottage cheese, mint chutney'),
    ]},
    { id: 'mains', name: 'Mains', demo: true, depth: 1, products: [], children: [
      { id: 'mains-veg', name: 'Vegetarian', depth: 2, children: [], products: [
        p('d8', 'Dal Makhani', 259, 'Slow-cooked black lentils, cream'),
        p('d9', 'Veg Biryani', 289, 'Basmati, saffron, fried onion'),
      ]},
      { id: 'mains-nonveg', name: 'Non-vegetarian', depth: 2, children: [], products: [
        p('d10', 'Chicken Biryani', 349, 'Hyderabadi style, boiled egg', false),
        p('d11', 'Fish Curry', 399, 'Coastal spices, coconut', false, false), // unavailable → ADD blocked
      ]},
    ]},
    { id: 'sides', name: 'Sides & Snacks', demo: true, depth: 1, children: [], products: [
      p('d4', 'Garlic Bread', 129, 'Toasted, herbed butter'),
      p('d5', 'Peri Peri Fries', 149, 'Crispy, spiced'),
    ]},
    { id: 'drinks', name: 'Drinks', demo: true, depth: 1, children: [], products: [
      p('d6', 'Fresh Lime Soda', 79, 'Sweet or salted'),
      p('d7', 'Cold Coffee', 149, 'Double shot, whipped'),
    ]},
  ];
}
