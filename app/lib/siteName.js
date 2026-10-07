// THE STOREFRONT'S OWN NAME, IN ONE PLACE.
//
// THE BUG THIS ENDS, and it took two days and four wrong guesses to find all of
// it. A project kept showing stock "market" branding, and the word was hardcoded in
// more than one place, so each fix made it disappear from one surface and left it on
// another:
//
//   • the browser tab title, in app/layout.jsx — invisible while building, because
//     the Studio preview is an iframe where the tab title never shows
//   • the brand in the starter app/components/Header.jsx
//
// Both are now derived from this. The lesson worth keeping: when a brand string
// leaks, grep for the string across the whole rendered output ONCE rather than
// fixing the occurrence you happened to see.
//
// WHY AN ENV VAR. The name lives in the Studio's workspace registry, which the
// storefront cannot read — it is a separate app with no access to platform data. So
// whoever launches the storefront passes it in:
//   • an exported repo   — .env.local, written by platform/githubHandover
//   • a Studio preview   — the per-tenant spawn env in platform/previewPool
//
// THE FALLBACK IS NOT "market", DELIBERATELY. That word was the bug; leaving it as
// a default just means the bug returns the moment the env var is missing for any
// reason. A neutral placeholder is honest — nobody mistakes "Storefront" for their
// own brand, so a missing name looks like a missing name instead of looking like a
// finished design that belongs to somebody else.
const FALLBACK = 'Storefront';

function siteName() {
  const raw = process.env.STUDIO_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || '';
  // Guard against a name long enough to wreck a header or a tab title.
  const name = String(raw).replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  return name || FALLBACK;
}

// No name configured — so the tab title and the wordmark are a placeholder rather
// than a brand, and nothing should dress them up as finished.
function isUnnamed() { return siteName() === FALLBACK; }

module.exports = { siteName, isUnnamed, FALLBACK };
