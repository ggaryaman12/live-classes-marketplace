'use client';
// Single-merchant cart (YELO supports one store per order). Adding an item from
// a different store asks to clear the cart first. Persisted to localStorage so
// it survives reloads. Kept intentionally small + typed so a future
// component-JSON <CartSheet/> node can bind straight to this state.
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const CartCtx = createContext(null);
const KEY = 'yelo-cart-v1';

export function CartProvider({ children }) {
  const [state, setState] = useState({ storeId: null, storeName: '', items: [] });
  const [ready, setReady] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState(null); // {store, product}

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) setState(s); } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(state)); }, [state, ready]);

  const add = useCallback((store, product) => {
    setState((prev) => {
      if (prev.storeId && prev.storeId !== store.id && prev.items.length) {
        setPendingSwitch({ store, product });
        return prev;
      }
      const items = [...prev.items];
      const i = items.findIndex((x) => x.id === product.id);
      if (i >= 0) items[i] = { ...items[i], qty: items[i].qty + 1 };
      else items.push({ id: product.id, name: product.name, price: product.price, image: product.image, qty: 1 });
      return { storeId: store.id, storeName: store.name, items };
    });
  }, []);

  const setQty = useCallback((productId, qty) => {
    setState((prev) => {
      const items = prev.items.map((x) => (x.id === productId ? { ...x, qty } : x)).filter((x) => x.qty > 0);
      return items.length ? { ...prev, items } : { storeId: null, storeName: '', items: [] };
    });
  }, []);

  const clear = useCallback(() => setState({ storeId: null, storeName: '', items: [] }), []);

  const confirmSwitch = useCallback(() => {
    setPendingSwitch((p) => {
      if (p) setState({ storeId: p.store.id, storeName: p.store.name, items: [{ id: p.product.id, name: p.product.name, price: p.product.price, image: p.product.image, qty: 1 }] });
      return null;
    });
  }, []);

  const count = state.items.reduce((s, it) => s + it.qty, 0);
  const subtotal = state.items.reduce((s, it) => s + it.price * it.qty, 0);

  const value = useMemo(() => ({
    ...state, ready, count, subtotal, add, setQty, clear,
    pendingSwitch, confirmSwitch, cancelSwitch: () => setPendingSwitch(null),
  }), [state, ready, count, subtotal, add, setQty, clear, pendingSwitch, confirmSwitch]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
}
