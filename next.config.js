// Env-gated basePath so the tenant storefront can be served under a proxied
// subpath (/ai-studio-preview) on the server while staying at / locally.
const basePath = process.env.TENANT_BASE_PATH || '';

// BUILD SOMEWHERE ELSE, THEN SWAP.
//
// `next build` DELETES the output directory before it writes anything. With one
// shared .next that meant a failed rebuild destroyed the artifacts of the build that
// was currently SERVING: the running server lost its middleware-manifest.json
// underneath it and every preview request became a 500. The log claimed 'keeping the
// previous working build' while the previous build no longer existed on disk — and
// the retry loop then wiped it twice more.
//
// So a rebuild targets .next-next, and server.js promotes it to .next only after the
// build succeeds. A failed build now costs nothing: the live directory is never
// touched.
const distDir = process.env.TENANT_DIST_DIR || '.next';

/** @type {import('next').NextConfig} */
module.exports = {
  // The SAME value the client needs. `basePath` is applied automatically to
  // <Link> and to next/image, but NOT to a bare `fetch('/api/…')` — and the
  // storefront has several. Exposing it lets app/lib/apiPath.js prefix those
  // correctly instead of them resolving against the host root.
  env: { NEXT_PUBLIC_TENANT_BASE_PATH: basePath || '' },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  distDir,
};
