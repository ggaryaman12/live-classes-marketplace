// The page-slug rule, shared by the storefront route and the Studio's write
// path. Kept here as well as in platform/pageRoutes.js because the storefront
// cannot import from platform/ — and a slug rule that differs between the two
// would let a page be written that its own route refuses to render.
//
// Any change here must be mirrored in platform/pageRoutes.js; a test asserts
// the two agree.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 40;
const RESERVED = new Set([
  'api', '_next', 'p', 'published', 'store', 'stores', 'checkout', 'landing',
  'merchant-listing', 'index', 'null', 'undefined', 'components', 'docs', 'pages',
]);

export function validSlug(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s || s.length > MAX_SLUG) return null;
  if (!SLUG.test(s)) return null;
  if (RESERVED.has(s)) return null;
  return s;
}
