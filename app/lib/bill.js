// Pure bill-breakdown mapping — no imports, so it's testable in isolation and
// shared by the API layer. Mirrors the SaaS marketplace's own line items
// exactly (same backend); see docs/YELO_API_REFERENCE.md §4 for the canonical
// response keys this reads.

// Read every known spelling of a numeric field (the backend mixes UPPERCASE
// from the payment step with lowercase elsewhere).
export const num = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
};

// Raw bill response → ordered typed lines the UI renders.
// kind: 'subtotal' | 'charge' (adds) | 'discount' (subtracts, shown negative).
export function normalizeBill(d, items = [], deliveryType = 1) {
  // `CURRENCY` can come back as an object — `{}` when unconfigured, or
  // `{ currency_id, symbol, … }` — never assume it's a printable string.
  const c = d.CURRENCY;
  const currency = (typeof c === 'string' && c)
    || (c && typeof c === 'object' && typeof c.symbol === 'string' && c.symbol)
    || (typeof d.currency_symbol === 'string' && d.currency_symbol)
    || '₹';
  const total = num(d, 'NET_PAYABLE_AMOUNT', 'net_payable_amount', 'total_payable', 'grand_total', 'total');

  // Carried through separately from the display lines because create_task
  // takes `delivery_charge` as its own field (the real storefront sends
  // billDeliveryCharge). Reading it back out of a rendered label would be
  // fragile, and BILL_BREAKUP may fold it into a differently-worded row.
  const deliveryCharge = deliveryType === 2
    ? 0
    : num(d, 'DELIVERY_CHARGE', 'delivery_charge', 'delivery')
      + num(d, 'DELIVERY_CHARGE_SURGE_AMOUNT', 'delivery_surge_charge');

  // Prefer the backend's pre-built, already-ordered BILL_BREAKUP when present —
  // it reflects tenant config the client can't see. Field-map only when absent.
  const breakup = d.BILL_BREAKUP || d.bill_breakup;
  if (Array.isArray(breakup) && breakup.length) {
    const lines = breakup.map((l, i) => {
      const label = l.NAME || l.name || l.LABEL || l.label || `Line ${i + 1}`;
      const value = num(l, 'VALUE', 'value', 'AMOUNT', 'amount');
      const isDiscount = l.IS_DISCOUNT || l.is_discount || /discount|off|saved|coupon|promo/i.test(label) || value < 0;
      return { key: `bb_${i}`, label, value: isDiscount ? -Math.abs(value) : value, kind: isDiscount ? 'discount' : (i === 0 ? 'subtotal' : 'charge') };
    });
    return { lines, subtotal: lines[0]?.value || 0, walletUsed: num(d, 'AMOUNT_VIA_WALLET', 'WALLET'), total: total || lines.reduce((s, l) => s + l.value, 0), currency, deliveryCharge, estimated: false };
  }

  const lines = [];
  // `keep` forces a line even at 0 — used for delivery, where "Free" is
  // information the customer wants, not an empty add-on to hide.
  const push = (key, label, value, kind = 'charge', keep = false) => {
    if (value === 0 && kind !== 'subtotal' && !keep) return;
    lines.push({ key, label, value, kind });
  };

  // Canonical keys (yelo-server getBillBreakDown): ACTUAL_AMOUNT = item total,
  // USER_TAXES = tax total, NET_PAYABLE_AMOUNT = payable.
  const subtotal = num(d, 'ACTUAL_AMOUNT', 'INITIAL_AMOUNT', 'item_total', 'sub_total', 'subtotal')
    || items.reduce((s, it) => s + it.price * it.qty, 0);
  push('subtotal', 'Item total', subtotal, 'subtotal');

  const promo = num(d, 'PAYMENT_PROMO_DISCOUNT_VALUE', 'discount', 'discount_value', 'promotion');
  push('promo', d.discount_label || 'Discount', -promo, 'discount');
  push('loyalty', 'Loyalty points', -num(d, 'LOYALTY_POINT_DISCOUNT'), 'discount');

  const delivery = num(d, 'DELIVERY_CHARGE', 'delivery_charge', 'delivery');
  const surge = num(d, 'DELIVERY_CHARGE_SURGE_AMOUNT', 'SURGE_AMOUNT', 'delivery_surge_charge');
  if (deliveryType === 2) push('delivery', 'Delivery (self-pickup)', 0, 'charge', true);
  else push('delivery', surge ? 'Delivery (high demand)' : 'Delivery', delivery + surge, 'charge', true);
  push('delivery_discount', 'Delivery discount', -num(d, 'DELIVERY_DISCOUNT', 'delivery_discount'), 'discount');

  const taxBreakup = d.TAX_BILL_BREAKUP || d.taxes || d.tax_calculation;
  if (Array.isArray(taxBreakup) && taxBreakup.length) {
    for (const t of taxBreakup) {
      const amt = num(t, 'tax_amount', 'amount', 'value');
      const name = t.tax_name || t.name || 'Tax';
      const pct = num(t, 'tax_percentage', 'percentage');
      push(`tax_${name}`, pct ? `${name} (${pct}%)` : name, amt, 'charge');
    }
  } else {
    push('tax', 'Taxes & charges', num(d, 'USER_TAXES', 'tax_amount', 'tax', 'total_tax', 'taxes'), 'charge');
  }

  const addl = d.ADDITIONAL_CHARGES;
  if (Array.isArray(addl) && addl.length) {
    for (const a of addl) push(`addl_${a.NAME || a.name}`, a.NAME || a.name || 'Charge', num(a, 'VALUE', 'value', 'AMOUNT', 'amount'), 'charge');
  } else {
    push('additional', 'Additional charges', num(d, 'TOTAL_ADDITIONAL_CHARGE', 'ADDITIONAL_AMOUNT'), 'charge');
  }
  push('convenience', 'Convenience fee', num(d, 'CONVENIENCE_PAY', 'convenience_fee'), 'charge');
  push('service', 'Service fee', num(d, 'SERVICE_MARKETPLACE', 'service_charge'), 'charge');
  push('packing', 'Packing', num(d, 'PACKING_CHARGE', 'packaging_charge', 'packing'), 'charge');
  push('tip', 'Tip', num(d, 'TIP', 'tip_value'), 'charge');

  const walletUsed = num(d, 'AMOUNT_VIA_WALLET', 'wallet_amount', 'WALLET');
  return { lines, subtotal, walletUsed, total: total || lines.reduce((s, l) => s + l.value, 0), currency, deliveryCharge, estimated: false };
}
