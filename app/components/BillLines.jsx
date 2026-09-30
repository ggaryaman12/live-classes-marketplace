// Presentational itemized bill. Renders the normalized `lines[]` from getBill
// (see app/lib/api.js normalizeBill) — one row per charge/discount, discounts
// shown negative and in the positive/ok hue, then the payable total.
//
// Pure and typed, so it maps cleanly to a component-JSON node and is reused by
// both the checkout panel and any standalone BillBreakdown placement.
export default function BillLines({
  bill, currency = '₹', showTotal = true, totalLabel = 'To pay', loading = false,
}) {
  if (!bill) return <div className="bl-row bl-muted"><span>Calculating…</span></div>;
  // While a refetch is in flight the numbers on screen belong to the PREVIOUS
  // address or delivery mode. Dimming them says so; the checkout panel
  // separately refuses to place an order against a bill it is still replacing.
  const cur = typeof bill.currency === 'string' && bill.currency ? bill.currency : currency;
  const money = (v) => `${v < 0 ? '−' : ''}${cur}${Math.abs(Math.round(v * 100) / 100)}`;

  return (
    <div className={`bl${loading ? ' bl-stale' : ''}`} aria-busy={loading || undefined}>
      {(bill.lines || []).map((l) => (
        <div className={`bl-row ${l.kind}`} key={l.key}>
          <span className="bl-label">{l.label}</span>
          <span className="bl-val">
            {l.kind === 'charge' && l.value === 0 ? 'Free' : money(l.value)}
          </span>
        </div>
      ))}
      {showTotal && (
        <div className="bl-total">
          <span>{totalLabel}</span>
          <span>{cur}{Math.round((bill.total ?? 0) * 100) / 100}</span>
        </div>
      )}
      {bill.estimated && (
        <p className="bl-est">Estimated — the store confirms the final bill on acceptance.</p>
      )}
    </div>
  );
}
