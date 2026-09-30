'use client';
import Link from 'next/link';

// One store tile. Typed props → { type:'StoreCard', props:{ store } }.
export default function StoreCard({ store, index = 0 }) {
  return (
    <Link href={`/store/${store.id}`} className="sc" style={{ '--i': index }} prefetch>
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
