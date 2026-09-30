// Presentational itemized bill. Renders the normalized `lines[]` from getBill
// (see app/lib/api.js normalizeBill) — one row per charge/discount, discounts
// shown negative and in the positive/ok hue, then the payable total.
//
// Pure and typed, so it maps cleanly to a component-JSON node and is reused by
// both the checkout panel and any standalone BillBreakdown placement.
export default function BillLines({
  bill, currency = '₹', showTotal = true, totalLabel = 'To pay', loading = false,
}) {
  // THE SKELETON IS THE BILL'S OWN SHAPE.
  //
  // This was the words "Calculating…" on one line, so the panel jumped when
  // three rows and a total replaced it. A loading state that does not match
  // what it becomes is a layout shift with a polite label on it.
  //
  // Three rows and a total, at the real row heights: the summary column holds
  // its height from first paint, and the numbers fade in where the bars were.
  if (!bill) {
    return (
      <div className="bl bl-skel" aria-busy="true" aria-live="polite">
        <span className="sr-only">Working out the total</span>
        {[0, 1, 2].map((i) => (
          <div className="bl-row" key={i} aria-hidden="true">
            <span className="sk sk-label" style={{ '--i': i, width: `${[38, 30, 46][i]}%` }} />
            <span className="sk sk-val" style={{ '--i': i }} />
          </div>
        ))}
        <div className="bl-total" aria-hidden="true">
          <span className="sk sk-label sk-strong" style={{ '--i': 3, width: '30%' }} />
          <span className="sk sk-val sk-strong" style={{ '--i': 3 }} />
        </div>
      </div>
    );
  }
  // While a refetch is in flight the numbers on screen belong to the PREVIOUS
  // address or delivery mode. Dimming them says so; the checkout panel
  // separately refuses to place an order against a bill it is still replacing.
  // DEFENCE IN DEPTH. `normalizeBill` now guarantees a string, but a bill that
  // reaches here from anywhere else must not be able to kill the page: the
  // backend sent `CURRENCY: {}` once, and rendering that object as a React
  // child threw error #31 and took the whole checkout down — bill correct,
  // totals correct, page dead.
  const cur = (typeof bill.currency === 'string' && bill.currency) || currency;
  const money = (v) => `${v < 0 ? '−' : ''}${cur}${Math.abs(Math.round(v * 100) / 100)}`;

  return (
    <div className={`bl${loading ? ' bl-stale' : ''}`} aria-busy={loading || undefined}>
      {(bill.lines || []).map((l) => (
        <div className={`bl-row ${l.kind}`} key={l.key}>
          <span className="bl-label">{typeof l.label === 'string' ? l.label : ''}</span>
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
