// THIS STOREFRONT'S COMPONENTS. Plain imports — edit the files directly.
//
// Inside YELO Studio one app serves many storefronts, so this file is a resolver
// that picks a per-project override and falls back to a shared default. Your repo
// has one storefront, so there is nothing to resolve: the components in
// app/components ARE yours, and that is what this imports.
//
// To change your header, edit app/components/Header.jsx. Nothing regenerates it
// and nothing falls back if it is missing — a missing file is a build error, which
// is what you want, rather than a stranger's design appearing in its place.
import Header from '../components/Header';
import StoreCard from '../components/StoreCard';
import StoreHeader from '../components/StoreHeader';
import Catalogue from '../components/Catalogue';
import CheckoutPanel from '../components/CheckoutPanel';
import BillLines from '../components/BillLines';
import Hero3DSection from '../components/Hero3DSection';
import EntrySequence from '../components/EntrySequence';

export const Chrome = { Header, StoreCard, StoreHeader, Catalogue, CheckoutPanel, BillLines, Hero3DSection, EntrySequence };
