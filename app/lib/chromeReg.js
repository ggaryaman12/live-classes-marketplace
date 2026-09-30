// CHROME RESOLVER — a project's own chrome wins; the shipped component is the fallback.
//
// Site chrome (header, cart, checkout, store header, catalogue, hero, product card) used
// to be hard-wired and shared. Now each project can OWN its copies: they live in the
// project's worktree `chrome/` dir, are mirrored into app/chrome/ at build time by
// customSync.syncChrome(), and exposed through the generated app/chrome/index.js. This
// module prefers the project's version when present and falls back to the shipped
// component otherwise — so a project with no chrome overlay renders exactly like the
// stock storefront, and there is never a missing-import build break.
//
// Only MOUNT-POINT chrome (referenced by layout.jsx / registry.jsx) needs a resolver
// entry. Purely-internal chrome (CartSheet, AuthModal, HeroScene, OrderReceipt) travels
// with its parent through relative `./Sibling` imports inside whichever dir the parent
// came from, so it needs no entry here — but syncChrome still mirrors the FULL set into
// the overlay so those relative imports resolve.
import { CHROME } from '../chrome';
import Header from '../components/Header';
import StoreCard from '../components/StoreCard';
import StoreHeader from '../components/StoreHeader';
import Catalogue from '../components/Catalogue';
import CheckoutPanel from '../components/CheckoutPanel';
import BillLines from '../components/BillLines';
import Hero3DSection from '../components/Hero3DSection';
import EntrySequence from '../components/EntrySequence';

// CHROME is a runtime object (possibly empty). Reading an absent key is just
// `undefined` → the shipped default is used. No static export is required to exist.
export const Chrome = {
  Header: CHROME.Header || Header,
  StoreCard: CHROME.StoreCard || StoreCard,
  StoreHeader: CHROME.StoreHeader || StoreHeader,
  Catalogue: CHROME.Catalogue || Catalogue,
  CheckoutPanel: CHROME.CheckoutPanel || CheckoutPanel,
  BillLines: CHROME.BillLines || BillLines,
  Hero3DSection: CHROME.Hero3DSection || Hero3DSection,
  EntrySequence: CHROME.EntrySequence || EntrySequence,
};
