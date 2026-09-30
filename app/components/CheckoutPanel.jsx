'use client';
// Checkout + payment on one surface.
//
// The SaaS marketplace splits these across two screens; we fold them into one,
// because the split exists there for historical reasons and costs a navigation
// in the middle of a purchase. Both call the same two endpoints in the same
// order — see docs/YELO_API_REFERENCE.md §4.
//
// Registered as `CheckoutPanel`, so it renders from the checkout page tree and
// its labels are editable in the Studio. The interactive wiring lives here in
// code; only presentational props are exposed. The marketplace rules (address
// required, wallet needs balance, contact field follows the tenant) are
// enforced regardless of how it is restyled.
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../lib/cart';
import { getSession, setSession as saveSession } from '../lib/session';
// ONE definition of the payment values, imported. This file used to carry its
// own `{ CASH: 4 }` — a third copy of a wrong constant, which is exactly how
// three copies drift.
import { PAYMENT } from '../lib/order';
import BillLines from './BillLines';

const DEFAULT = { lat: 28.61482, lng: 77.219989 };

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    // A network failure must not leave the button spinning forever.
    .catch(() => ({ ok: false, unreachable: true }));

export default function CheckoutPanel({
  title = 'Checkout',
  addressLabel = 'Delivery address',
  paymentLabel = 'Payment',
  summaryLabel = 'Order summary',
  ctaLabel = 'Place order',
  allowCash = true,
  allowWallet = true,
  allowPickup = true,
}) {
  const cart = useCart();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [address, setAddress] = useState({ text: '', lat: DEFAULT.lat, lng: DEFAULT.lng });
  const [locating, setLocating] = useState(false);
  const [bill, setBill] = useState(null);
  const [billing, setBilling] = useState(false);
  const [billFailed, setBillFailed] = useState(false);
  const [wallet, setWallet] = useState({ balance: 0, enabled: false });
  const [pay, setPay] = useState(PAYMENT.CASH);
  const [mode, setMode] = useState(1);            // 1 = delivery, 2 = self-pickup
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [error, setError] = useState('');
  const [badFields, setBadFields] = useState([]);

  useEffect(() => {
    const s = getSession();
    setSession(s);
    if (s) setContact({ name: s.name || '', phone: s.phone || '', email: s.email || '' });
  }, []);

  // The bill is the backend's answer, and it changes with the address and the
  // delivery mode — self-pickup usually zeroes the delivery charge. Refetching
  // on those is not an optimisation, it is correctness.
  const refreshBill = useCallback(async () => {
    if (!cart.items.length) return;
    setBilling(true);
    const b = await post('/api/bill', {
      storeId: cart.storeId,
      items: cart.items,
      latitude: address.lat,
      longitude: address.lng,
      session,
      deliveryType: mode,
    });
    setBilling(false);
    if (b?.unreachable) { setBillFailed(true); return; }
    setBillFailed(false);
    setBill(b);
  }, [cart.items, cart.storeId, address.lat, address.lng, session, mode]);

  useEffect(() => { refreshBill(); }, [refreshBill]);

  useEffect(() => {
    if (session && allowWallet) post('/api/wallet', { session }).then((w) => w && setWallet(w));
  }, [session, allowWallet]);

  // Wallet cannot cover the bill → say so on the option itself rather than
  // waiting for the customer to pick it and get rejected at the last step.
  const total = bill?.total ?? cart.subtotal;
  const walletShort = wallet.enabled && wallet.balance < total;
  const currency = bill?.currency || '₹';

  // If wallet was selected and then became unaffordable (bill changed), move
  // off it rather than leaving an impossible selection sitting there.
  useEffect(() => {
    if (pay === PAYMENT.WALLET && (walletShort || !wallet.enabled) && allowCash) {
      setPay(PAYMENT.CASH);
    }
  }, [walletShort, wallet.enabled, pay, allowCash]);

  const money = useMemo(
    () => (n) => `${currency}${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`,
    [currency],
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser will not share your location. Type the address instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAddress((a) => ({
          ...a,
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Type the address instead.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function place() {
    setError('');
    setBadFields([]);

    // Local checks first, each naming the field. The backend's own rejection is
    // a generic PARAMETER_MISSING that names nothing, so a round trip here buys
    // the customer no information at all.
    if (mode === 1 && !address.text.trim()) {
      setBadFields(['address']);
      return setError('Add a delivery address so the store knows where to send it.');
    }
    if (!contact.name.trim()) {
      setBadFields(['name']);
      return setError('Add a name for the order.');
    }
    if (pay === PAYMENT.WALLET && wallet.balance < total) {
      return setError('Wallet balance is short of the total. Choose another payment method.');
    }

    // Keep whatever the customer typed, so a retry does not ask again.
    const merged = { ...(session || {}), ...contact };
    if (typeof window !== 'undefined' && session) saveSession(merged);

    setPlacing(true);
    const r = await post('/api/order', {
      storeId: cart.storeId,
      items: cart.items,
      address: mode === 1 ? address : { ...address, text: address.text || 'Self pickup' },
      session: merged,
      paymentType: pay,
      bill,
      deliveryType: mode,
    });
    setPlacing(false);

    if (r.ok) { setPlaced(r); cart.clear(); return; }

    // `missing` comes from the preflight and names wire fields; map them back to
    // the inputs on this screen so the right one gets highlighted.
    if (Array.isArray(r.missing)) {
      setBadFields(r.missing.map((f) => (
        f === 'job_pickup_address' ? 'address'
          : f === 'job_pickup_name' ? 'name'
            : f === 'job_pickup_phone' ? 'phone'
              : f === 'job_pickup_email' ? 'email' : f
      )));
    }
    setError(r.message || 'The order did not go through. Nothing has been charged — please try again.');
  }

  if (placed) {
    return (
      <div className="ck-done">
        <div className="ck-done-check" aria-hidden="true">✓</div>
        <h1>Order placed</h1>
        <p>{placed.orderId ? <>Order <b>#{placed.orderId}</b> is confirmed.</> : 'Your order is confirmed.'}</p>
        <p className="ck-done-sub">
          {pay === PAYMENT.CASH
            ? 'Pay in cash when it arrives. You’ll get updates as the store prepares it.'
            : 'You’ll get updates as the store prepares it.'}
        </p>
        <button className="ck-place ck-done-btn" onClick={() => router.push('/')}>Back to stores</button>
      </div>
    );
  }

  if (cart.ready && cart.count === 0) {
    return (
      <div className="ck-empty">
        <h1>Your cart is empty</h1>
        <p className="ck-done-sub">Add something from a store to check out.</p>
        <button className="ck-place ck-done-btn" onClick={() => router.push('/')}>Browse stores</button>
      </div>
    );
  }

  const bad = (f) => (badFields.includes(f) ? ' ck-bad' : '');

  return (
    <div className="ck">
      <h1 className="ck-title">{title}</h1>
      <div className="ck-grid">
        <div className="ck-left">
          {allowPickup && (
            <section className="ck-card">
              <div className="ck-card-h">How would you like it?</div>
              <div className="ck-modes" role="radiogroup" aria-label="Delivery method">
                <button type="button" role="radio" aria-checked={mode === 1}
                  className={`ck-mode ${mode === 1 ? 'on' : ''}`} onClick={() => setMode(1)}>
                  <b>Deliver to me</b><small>To your address</small>
                </button>
                <button type="button" role="radio" aria-checked={mode === 2}
                  className={`ck-mode ${mode === 2 ? 'on' : ''}`} onClick={() => setMode(2)}>
                  <b>I’ll pick it up</b><small>Collect from the store</small>
                </button>
              </div>
            </section>
          )}

          {mode === 1 && (
            <section className="ck-card">
              <div className="ck-card-h">{addressLabel}</div>
              <button className="ck-loc" onClick={useMyLocation} disabled={locating}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {locating ? 'Locating…' : 'Use my current location'}
              </button>
              <textarea className={`ck-in${bad('address')}`} rows={2} value={address.text}
                aria-label={addressLabel}
                onChange={(e) => setAddress({ ...address, text: e.target.value })}
                placeholder="Flat / house no, street, area, landmark" />
              <div className="ck-latlng"><span>{address.lat}, {address.lng}</span></div>
            </section>
          )}

          <section className="ck-card">
            <div className="ck-card-h">Contact</div>
            {/* The backend requires a name on every order, and email and/or
                phone depending on the TENANT's signup_field. We collect all
                three and let the server-side preflight decide which are
                mandatory — guessing here would break half the tenants. */}
            <input className={`ck-in${bad('name')}`} value={contact.name} placeholder="Name"
              aria-label="Name" onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <div className="ck-two">
              <input className={`ck-in${bad('phone')}`} value={contact.phone} placeholder="Phone"
                inputMode="tel" aria-label="Phone"
                onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <input className={`ck-in${bad('email')}`} value={contact.email} placeholder="Email"
                inputMode="email" aria-label="Email"
                onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </div>
          </section>

          <section className="ck-card">
            <div className="ck-card-h">{paymentLabel}</div>
            {allowCash && (
              <label className={`ck-pay ${pay === PAYMENT.CASH ? 'on' : ''}`}>
                <input type="radio" name="pay" checked={pay === PAYMENT.CASH}
                  onChange={() => setPay(PAYMENT.CASH)} />
                <span className="ck-pay-i" aria-hidden="true">💵</span>
                <span className="ck-pay-b"><b>Cash on delivery</b><small>Pay when it arrives</small></span>
              </label>
            )}
            {allowWallet && (
              <label className={`ck-pay ${pay === PAYMENT.WALLET ? 'on' : ''} ${!wallet.enabled || walletShort ? 'off' : ''}`}>
                <input type="radio" name="pay" disabled={!wallet.enabled || walletShort}
                  checked={pay === PAYMENT.WALLET} onChange={() => setPay(PAYMENT.WALLET)} />
                <span className="ck-pay-i" aria-hidden="true">👛</span>
                <span className="ck-pay-b">
                  <b>Wallet</b>
                  <small>
                    {!wallet.enabled ? 'Sign in to use your wallet'
                      : walletShort ? `Balance ${money(wallet.balance)} — short of the total`
                        : `Balance ${money(wallet.balance)}`}
                  </small>
                </span>
              </label>
            )}
          </section>
        </div>

        <div className="ck-right">
          <section className="ck-card ck-summary">
            <div className="ck-card-h">{cart.storeName || summaryLabel}</div>
            <div className="ck-items">
              {cart.items.map((it) => (
                <div className="ck-item" key={it.id}>
                  <span className="ck-item-q">{it.qty}×</span>
                  <span className="ck-item-n">{it.name}</span>
                  <span className="ck-item-p">{money(it.price * it.qty)}</span>
                </div>
              ))}
            </div>

            {billFailed ? (
              // The bill is the backend's number. If we could not get it, say so
              // and offer a retry — never show a total we computed ourselves and
              // let someone order against it.
              <div className="ck-error" role="alert">
                We couldn’t load the final price.{' '}
                <button className="ck-retry" onClick={refreshBill}>Try again</button>
              </div>
            ) : (
              <BillLines bill={bill} totalLabel="To pay" loading={billing} />
            )}

            {error && <div className="ck-error" role="alert">{error}</div>}

            {/* `billing` matters as much as `!bill`: while a refetch is in
                flight the total on screen is the one for the PREVIOUS address
                or delivery mode, and `amount` is sent from it. Placing then
                sends a figure the backend has already superseded. */}
            <button className="ck-place" disabled={placing || billing || !bill || billFailed} onClick={place}>
              {placing ? 'Placing order…' : billing ? 'Updating total…' : `${ctaLabel} · ${money(total)}`}
            </button>
            <div className="ck-secure">🔒 {session ? `Signed in as ${session.name || 'you'}` : 'Guest checkout'}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
