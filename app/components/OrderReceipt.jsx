// ─────────────────────────────────────────────────────────────────────────────
// TALKS TO THE YELO BACKEND. Restyle it freely; keep the API calls.
//
// The markup, classes and copy in here are yours to change. The fetches, the
// field names and the order of the bill/order/payment calls are a contract with
// the YELO API — if they change, this still renders but stops working, and the
// failure shows up at the till rather than in the build.
//
// Endpoints and payloads: docs/YELO_API_REFERENCE.md
// ─────────────────────────────────────────────────────────────────────────────
'use client';
// THE RECEIPT, PRINTING.
//
// This replaces an abstract 3D parcel, and the reason is worth stating: the
// parcel was decoration next to the information. A receipt IS the information —
// the shop, the items, the totals, the order number — so animating it prints
// the thing the customer actually wants instead of a shape beside it.
//
// The metaphor is exact: an order confirmation is a till receipt, and a till
// receipt arrives by being pushed out of a slot, slowly, from the top.
//
// WHY DOM AND NOT WEBGL. Everything on this paper is real, selectable text: the
// order number can be copied, the items can be read by a screen reader, and it
// costs no bundle. The dimensionality is real too — a genuine 3D transform on
// the paper's leading edge as it clears the slot, and a shadow that tracks it —
// rather than a canvas that renders text as pixels nobody can select.
//
// The printer housing is the only decorative element, and it earns its place by
// making the motion legible: paper appearing from behind a solid object reads
// as printing, paper appearing from nothing reads as a CSS slide.
import { useEffect, useRef, useState } from 'react';
import { apiPath } from '../lib/apiPath';

const money = (cur, n) => `${cur}${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`;

export default function OrderReceipt({
  storeName,
  orderId,
  items = [],
  bill,
  currency = '₹',
  payLabel,
  session,
  fetchPath = '/api/order-details',
}) {
  const paper = useRef(null);
  const [h, setH] = useState(0);
  const [printed, setPrinted] = useState(false);

  // THE STORE'S RECORD, NOT OUR SNAPSHOT.
  //
  // The props are what the browser knew at the moment of purchase — correct,
  // but ours, and gone on refresh. This reads the order back by its id so the
  // paper prints what the shop actually recorded.
  //
  // The wait is not a spinner: the paper is genuinely still inside the printer
  // until there is something to print on it, which is the one loading state
  // that needs no explaining.
  const [confirmed, setConfirmed] = useState(null);
  useEffect(() => {
    if (!orderId || !session?.vendorId) return undefined;
    let dead = false;
    fetch(apiPath(fetchPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: orderId, session }),
    })
      .then((r) => r.json())
      .then((d) => {
        // Only replace what came back with real content. A backend that answers
        // with an empty order must not blank a receipt we could already print.
        if (!dead && d?.ok && d.order?.items?.length) setConfirmed(d.order);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [orderId, session, fetchPath]);

  const src = confirmed || { storeName, items, bill };

  // MEASURE, THEN PRINT. The paper's height decides how far it travels and how
  // long that takes — a fixed duration would crawl for a one-item order and
  // race for a ten-item one. Measured after layout so the real content is in.
  useEffect(() => {
    const el = paper.current;
    if (!el) return undefined;
    const height = el.scrollHeight;
    setH(height);

    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
    if (reduced) { setPrinted(true); return undefined; }

    const id = requestAnimationFrame(() => setPrinted(true));
    return () => cancelAnimationFrame(id);
  }, [src.items?.length, orderId, confirmed]);

  // ~0.9s for a short receipt, capped so a long one never outstays its welcome.
  const duration = Math.min(2200, 700 + h * 1.6);

  const lines = src.bill?.lines || [];
  const total = src.bill?.total;
  const cur = (typeof src.bill?.currency === 'string' && src.bill.currency) || currency;

  return (
    <div className="rc" style={{ '--rc-h': `${h}px`, '--rc-dur': `${duration}ms` }}>
      {/* The printer. Fixed, solid, and above the paper in z — the paper has to
          come from BEHIND something for the motion to read as printing. */}
      <div className="rc-printer" aria-hidden="true">
        <span className="rc-slot" />
      </div>

      <div className={`rc-paper${printed ? ' is-printed' : ''}`} ref={paper}>
        <div className="rc-inner">
          <p className="rc-shop">{src.storeName || storeName || 'Your order'}</p>
          <p className="rc-kind">Order receipt</p>

          <div className="rc-rule" aria-hidden="true" />

          <ul className="rc-items">
            {(src.items || []).map((it) => (
              <li key={it.id}>
                <span className="rc-q">{it.qty}×</span>
                <span className="rc-n">{it.name}</span>
                <span className="rc-p">{money(cur, it.price * it.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="rc-rule" aria-hidden="true" />

          {lines.map((l) => (
            <p className="rc-line" key={l.key}>
              <span>{typeof l.label === 'string' ? l.label : ''}</span>
              <span>{l.kind === 'charge' && l.value === 0 ? 'FREE' : money(cur, l.value)}</span>
            </p>
          ))}

          <p className="rc-total">
            <span>Total</span>
            <span>{money(cur, total)}</span>
          </p>

          {payLabel ? <p className="rc-pay">{payLabel}</p> : null}

          {orderId ? (
            <>
              {/* A barcode drawn from the order number itself, so it is the
                  order's own mark rather than a stock graphic. Decorative —
                  the number below it is the real, selectable text. */}
              <div className="rc-code" aria-hidden="true">
                {String(orderId).split('').flatMap((ch, i) => {
                  const n = (ch.charCodeAt(0) * 7 + i * 13) % 5;
                  return [
                    <i key={`${i}a`} style={{ width: `${1 + (n % 3)}px` }} />,
                    <i key={`${i}b`} className="sp" style={{ width: `${1 + ((n + 1) % 3)}px` }} />,
                  ];
                })}
              </div>
              <p className="rc-no"><b>#{orderId}</b></p>
            </>
          ) : null}

          <p className="rc-thanks">Thank you — see you again</p>
        </div>

        {/* The torn edge. A repeating conic notch, so it is one gradient rather
            than thirty elements. */}
        <span className="rc-tear" aria-hidden="true" />
      </div>
    </div>
  );
}
