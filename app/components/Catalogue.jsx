'use client';
// Menu renderer. Takes pre-flattened n-level sections (depth carries nesting)
// and enforces the marketplace's ordering restrictions:
//   • store closed → ADD disabled, unless scheduled/pre-order is allowed
//   • product unavailable → ADD disabled with a reason
// Layout is deliberately prop-driven (`layout`) so a different layout node can
// swap sidebar ↔ centered nav without changing data or logic.
import { useMemo, useRef, useState } from 'react';
import { useCart } from '../lib/cart';

export default function Catalogue({ store, sections, layout = 'sidebar', showImages = true }) {
  const { items, add, setQty } = useCart();
  const [active, setActive] = useState(sections[0]?.id);
  const refs = useRef({});
  const qtyOf = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.qty])), [items]);

  const canOrder = store?.canOrder !== false;
  const preOrderOnly = canOrder && store?.openNow === false;

  function jump(id) {
    setActive(id);
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const nav = (
    <nav className={`cat-nav ${layout === 'center' ? 'is-center' : ''}`}>
      {sections.map((c) => (
        <button
          key={c.id}
          className={`cat-nav-i d${c.depth || 1} ${active === c.id ? 'on' : ''}`}
          onClick={() => jump(c.id)}
        >
          {c.name}
          {c.products?.length ? <span>{c.products.length}</span> : null}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {!canOrder && (
        <div className="cat-closed">
          <b>Store is closed right now.</b> You can browse the menu, but ordering is unavailable.
        </div>
      )}
      {preOrderOnly && (
        <div className="cat-preorder">
          <b>Closed right now — pre-order available.</b> Place your order and the store will prepare it when it opens.
        </div>
      )}

      <div className={`cat layout-${layout}`}>
        {layout !== 'center' && nav}
        <div className="cat-list">
          {layout === 'center' && nav}
          {sections.map((c) => (
            <section key={c.id} className={`cat-sec d${c.depth || 1}`} ref={(el) => (refs.current[c.id] = el)}>
              <h3 className="cat-sec-h">{c.name}</h3>
              {c.products?.length === 0 ? null : (
                <div className="cat-products">
                  {c.products.map((p) => {
                    const q = qtyOf[p.id] || 0;
                    const blocked = !canOrder || p.available === false;
                    // Per instruction: one class per order, always — a
                    // different product already in the cart blocks adding
                    // this one, the same rule enforced on the class page's
                    // own "Enroll now" and in the cart drawer.
                    const otherInCart = q === 0 && items.length > 0 && items.some((it) => it.id !== p.id);
                    return (
                      <div className={`pc ${blocked ? 'is-blocked' : ''}`} key={p.id}>
                        <div className="pc-body">
                          <div className="pc-top">
                            {p.veg != null && <span className={`pc-veg ${p.veg ? 'v' : 'n'}`} aria-hidden />}
                            <span className="pc-name">{p.name}</span>
                          </div>
                          <div className="pc-price">₹{p.price}</div>
                          {p.description && <p className="pc-desc">{p.description}</p>}
                          {p.available === false && <span className="pc-unavail">Unavailable right now</span>}
                          {otherInCart && <span className="pc-unavail">Only one class per order — clear your cart first</span>}
                        </div>
                        <div className={`pc-media ${showImages ? '' : 'no-img'}`}>
                          {showImages && (p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="pc-media-ph">{p.name.slice(0, 1)}</div>)}
                          {blocked ? (
                            <button className="pc-add is-off" disabled title={!canOrder ? 'Store is closed' : 'Item unavailable'}>ADD</button>
                          ) : otherInCart ? (
                            <button className="pc-add is-off" disabled title="Only one class per order — clear your cart first">ADD</button>
                          ) : q === 0 ? (
                            <button className="pc-add" onClick={() => add(store, p)}>ADD</button>
                          ) : (
                            // Per instruction: no +/- stepper anywhere in the
                            // cart — a class enrollment isn't bought "2 of".
                            <button className="pc-add is-remove" onClick={() => setQty(p.id, 0)}>Remove</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      <style>{`
        .pc-add.is-remove:hover{ background:#c0392b; border-color:#c0392b; color:#fff; }
      `}</style>
    </>
  );
}
