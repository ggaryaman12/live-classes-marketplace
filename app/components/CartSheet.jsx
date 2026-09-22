'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../lib/cart';
import { getSession } from '../lib/session';

const YELO_BASE = 'https://test-api-3025.jungleworks.com';
const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.devweb1.yelo.red',
  dual_user_key: 0,
  language: 'en',
};

export default function CartSheet({ open, onClose, onSignIn }) {
  const { items, storeName, subtotal, count, setQty, clear, pendingSwitch, confirmSwitch, cancelSwitch } = useCart();
  const router = useRouter();
  // Real merchant setting ("Product Multiselection" in the dashboard) —
  // traced to yelo-server: product_multi_select 0 means a customer may only
  // ever hold ONE of a given class per order (server rejects qty>1 outright
  // at order time with CAN_NOT_SELECT_MULTIPLE_QUANTITY), and the real
  // marketplace webapp's own cart reflects that by swapping the +/- stepper
  // for a single "Remove" action per line (app-cart.html — product.type 1 =
  // ADD-only). Defaults to permissive (1) so a failed fetch never wrongly
  // hides quantity control the merchant actually allows.
  const [productMultiSelect, setProductMultiSelect] = useState(1);
  useEffect(() => {
    let cancelled = false;
    fetch(`${YELO_BASE}/marketplace_fetch_app_configuration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
      body: JSON.stringify(YELO_TENANT),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.status === 200 && j?.data?.product_multi_select != null) {
          setProductMultiSelect(Number(j.data.product_multi_select));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const singleQtyOnly = productMultiSelect === 0;

  function checkout() {
    if (!getSession()) { onSignIn?.(); return; }
    onClose?.();
    router.push('/checkout');
  }

  return (
    <>
      <div className={`sheet-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sheet ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Your cart</div>
            {storeName && <div className="sheet-sub">{storeName}</div>}
          </div>
          <button className="sheet-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {count === 0 ? (
          <div className="sheet-empty">
            <div className="sheet-empty-emoji">🛒</div>
            Your cart is empty.<br />Add items from a store to get started.
          </div>
        ) : (
          <>
            <div className="sheet-items">
              {items.map((it) => (
                <div className="ci" key={it.id}>
                  <div className="ci-logo">{it.image ? <img src={it.image} alt="" /> : it.name.slice(0, 1)}</div>
                  <div className="ci-body">
                    <div className="ci-name">{it.name}</div>
                    <div className="ci-price">₹{it.price}</div>
                  </div>
                  {singleQtyOnly ? (
                    <button className="ci-remove" onClick={() => setQty(it.id, 0)}>Remove</button>
                  ) : (
                    <div className="ci-qty">
                      <button onClick={() => setQty(it.id, it.qty - 1)}>−</button>
                      <span>{it.qty}</span>
                      <button onClick={() => setQty(it.id, it.qty + 1)}>+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="sheet-foot">
              <div className="sheet-row"><span>Subtotal</span><span>₹{subtotal}</span></div>
              <button className="sheet-checkout" onClick={checkout}>Go to checkout · ₹{subtotal}</button>
              <button className="sheet-clear" onClick={clear}>Clear cart</button>
            </div>
          </>
        )}
      </aside>

      {pendingSwitch && (
        <div className="modal-scrim2" onClick={cancelSwitch}>
          <div className="modal2" onClick={(e) => e.stopPropagation()}>
            <div className="modal2-t">Start a new cart?</div>
            <p>Your cart has items from <b>{storeName}</b>. Ordering from <b>{pendingSwitch.store.name}</b> will clear it.</p>
            <div className="modal2-a">
              <button className="btn2-ghost" onClick={cancelSwitch}>Keep current</button>
              <button className="btn2-primary" onClick={confirmSwitch}>Clear & add</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .ci-remove{
          flex:none; height:28px; padding:0 12px; border-radius:7px;
          border:1px solid var(--line-2); background:var(--card); color:var(--muted);
          font-size:12px; font-weight:700; cursor:pointer;
        }
        .ci-remove:hover{ color:#c0392b; border-color:#c0392b; }
      `}</style>
    </>
  );
}
