'use client';
import Link from 'next/link';

// One store tile. Typed props → { type:'StoreCard', props:{ store } }.
//
// NO `prefetch` — DELIBERATELY, and it is not a perf oversight.
//
// A bare `prefetch` is `prefetch={true}`, which tells Next to prefetch the
// page's FULL data and hold it in the client router cache for five minutes.
// Clicking then renders that copy WITH NO NETWORK REQUEST AT ALL — verified:
// the click produced zero requests. So a shop's menu could be five minutes
// stale, and right after a catalogue change it showed the previous menu while
// the server was serving the correct one. That is a menu, a price and a
// stock state; it is the one thing on the page that must never be a cached
// guess.
//
// The default (auto) still prefetches the shell, so the tile stays snappy, and
// the actual products are fetched on navigation.
export default function StoreCard({ store, index = 0 }) {
  return (
    <Link href={`/store/${store.id}`} className="sc" style={{ '--i': index }}>
      <div className="sc-media">
        {store.banner ? <img src={store.banner} alt="" loading="lazy" /> : store.logo ? <img src={store.logo} alt="" loading="lazy" /> : <div className="sc-media-ph">{store.name.slice(0, 1)}</div>}
        {store.deliveryTime ? <span className="sc-eta">{store.deliveryTime} min</span> : null}
      </div>
      <div className="sc-body">
        <div className="sc-row">
          <div className="sc-name">{store.name}</div>
          {store.rating > 0 && <span className="sc-rating">★ {store.rating.toFixed(1)}</span>}
        </div>
        <div className="sc-addr">{store.address}</div>
      </div>
    </Link>
  );
}
