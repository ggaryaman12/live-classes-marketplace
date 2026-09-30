// AN API PATH THAT SURVIVES A BASE PATH.
//
// The storefront called `fetch('/api/auth')` — root-relative, no prefix. That
// worked for exactly as long as the preview was served from the domain root.
// The moment it moved under `/preview`, every one of those calls resolved
// against the HOST root instead of the app, so sign-in POSTed to
// `ai-studio.yelo.solutions/api/auth` — a Studio route that does not exist —
// got Apache's 404 HTML back, and met JSON.parse as:
//
//     SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// Which looks like a broken auth endpoint and is actually a missing prefix.
//
// NEXT_PUBLIC_BASE_PATH is baked in at build time (see deploy/Dockerfile), so
// this is correct wherever the app is mounted, including at the root where it
// resolves to the same string it always was.
const BASE = process.env.NEXT_PUBLIC_TENANT_BASE_PATH || '';

export function apiPath(p) {
  const path = String(p || '');
  // Absolute URLs and non-API paths are handed back untouched: this is a
  // prefixer, not a router, and quietly rewriting anything else would be worse
  // than the bug it fixes.
  if (/^https?:\/\//i.test(path) || !path.startsWith('/')) return path;
  return `${BASE}${path}`;
}
