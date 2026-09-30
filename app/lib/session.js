'use client';
// Storefront customer session (buyer). Marketplace login/signup returns
// { vendor_id, access_token } — stored client-side and sent on cart/checkout/
// order calls. (vendor_id = the customer, per YELO's naming.)
const KEY = 'yelo-customer-v1';

export function getSession() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function setSession(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('yelo-session'));
}
export function clearSession() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('yelo-session'));
}
