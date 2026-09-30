// Store detail header — logo, name, rating/delivery meta, address, back link.
// Presentational and prop-toggled (showRating / showDelivery / backLabel) so
// it's a registered, editable component-JSON node. Bound to the store object.
import Link from 'next/link';

export default function StoreHeader({ store, showRating = true, showDelivery = true, backLabel = '← All stores' }) {
  if (!store) return null;
  return (
    <div className="store-hero">
      <div className="store-hero-logo">
        {store.logo ? <img src={store.logo} alt="" /> : (store.name || '?').slice(0, 1)}
      </div>
      <div className="store-hero-body">
        <h1>{store.name}</h1>
        <div className="store-hero-meta">
          {showRating && store.rating > 0 && (
            <span className="shm-rating">★ {store.rating.toFixed(1)} ({store.ratingCount})</span>
          )}
          {showDelivery && store.deliveryTime ? <span>{store.deliveryTime} min</span> : null}
          {showDelivery && store.deliveryCharge != null
            ? <span>{store.deliveryCharge === 0 ? 'Free delivery' : `₹${store.deliveryCharge} delivery`}</span>
            : null}
        </div>
        {store.address && <div className="store-hero-addr">{store.address}</div>}
      </div>
      <Link href="/" className="store-back">{backLabel}</Link>
    </div>
  );
}
