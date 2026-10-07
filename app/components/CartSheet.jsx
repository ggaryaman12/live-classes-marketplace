'use client';
import { useRouter } from 'next/navigation';
import { useCart } from '../lib/cart';
import { getSession } from '../lib/session';

export default function CartSheet({ open, onClose, onSignIn }) {
  const { items, storeName, subtotal, count, setQty, clear, pendingSwitch, confirmSwitch, cancelSwitch } = useCart();
  const router = useRouter();

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
                  {/* Per instruction: a class enrollment isn't something a
                     parent buys "2 of" — no +/- stepper, ever. One tap takes
                     the whole line out of the cart. */}
                  <button className="ci-remove" onClick={() => setQty(it.id, 0)}>Remove</button>
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
