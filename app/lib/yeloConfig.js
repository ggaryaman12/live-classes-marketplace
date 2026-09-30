// Server-side YELO backend config + tenant envelope.
// These are public tenant identifiers (not secrets) — override via env in prod.
// Every marketplace POST needs this envelope; we inject it server-side so the
// browser never has to know it (and to dodge CORS).
import { YELO_BASE as SHARED_BASE, YELO_TENANT } from './yeloTenant';

export const YELO_BASE = process.env.YELO_BASE || SHARED_BASE;

// Active tenant envelope. Defaults to the deliverect test tenant; per-tenant
// values are injected via env (YELO_MKT / YELO_REF / YELO_DOMAIN) so the same
// build serves multiple tenants on the dev server. Verified against
// marketplace_fetch_app_configuration (status 200, ACTION_COMPLETE).
// Read the Studio's currently-selected tenant (written by the tenant switcher)
// at request time, so switching tenants updates this preview on next reload —
// no rebuild, no restart. Falls back to env defaults if none selected.
function activeTenant() {
  try {
    // tenant-demo runs with cwd=<root>/tenant-demo; the shared store is one up.
    const fs = require('fs');
    const path = require('path');
    const p = path.join(process.cwd(), '..', 'platform', 'data', 'active.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

export const tenantEnvelope = () => {
  const a = activeTenant();
  return {
    marketplace_user_id: Number(a?.marketplace_user_id || process.env.YELO_MKT || YELO_TENANT.marketplace_user_id),
    marketplace_reference_id:
      a?.marketplace_reference_id || process.env.YELO_REF || YELO_TENANT.marketplace_reference_id,
    domain_name:
      a?.domain_name || process.env.YELO_DOMAIN || 'deliverecttest.freelancer.jungleworks.me',
    dual_user_key: 0,
    language: 'en',
  };
};

// How long we will wait for the backend before giving up on a request.
//
// This is not a performance tuning knob — it is what stops a dead backend from
// hanging the page FOREVER. `fetch` has no default timeout, so when the API
// host stops answering (TLS completes, HTTP never returns — what a down origin
// behind Cloudflare actually looks like) the server render never resolves and
// Next serves `loading.jsx` indefinitely. The site then appears to a tenant as
// permanently broken grey skeletons, with nothing anywhere saying why.
//
// The backend normally answers in well under a second, so 10s only ever fires
// on a real outage. On timeout we return the same shape as any other failure,
// so every existing caller degrades through the path it already has.
const REQUEST_TIMEOUT_MS = 10_000;

// yelo-server always returns HTTP 200 — real status is body.status.
export async function yeloPost(path, body) {
  let res;
  try {
    res = await fetch(`${YELO_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        device_type: 'WEB',
        base_version: '1.0.0',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Timed out, DNS failure, connection refused, TLS error. Never rethrow:
    // a throw here propagates into the server render and blanks the page,
    // which is the failure this timeout exists to prevent.
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      status: 100,
      unreachable: true,
      message: timedOut
        ? `Backend did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Could not reach the backend: ${err?.message || 'network error'}`,
    };
  }
  // yelo-server should return JSON, but error/timeout pages come back as HTML.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Some tenant configs contain raw (unescaped) control chars in string
    // fields, which strict JSON.parse rejects. Strip bare control chars and
    // retry before giving up.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001F]+/g, ' '));
    } catch {
      // We reached SOMETHING, but not the API. yelo-server always answers 200
      // with the real status in the body, so a 5xx or an HTML body means we
      // got a proxy/error page instead — an outage, indistinguishable to the
      // tenant from the connection failing outright. Flagged the same way, or
      // the site quietly reports "no stores open right now" during a 503,
      // which reads as "your marketplace is empty" rather than "we cannot
      // reach the server" — the reassuring lie this whole change exists to stop.
      return {
        status: 100,
        unreachable: true,
        message: res.status >= 500
          ? `Backend returned HTTP ${res.status}`
          : 'Backend returned a non-JSON response',
      };
    }
  }
}

// GET-style marketplace endpoints that are actually POST routes (yelo-server
// convention). Same envelope, same 200-with-body-status contract.
export async function yeloGet(path, body) {
  return yeloPost(path, body);
}

// Fetch the tenant's app configuration (name, logo, default lat/long, colors).
// Cached per request; used to seed the storefront listing location.
export async function fetchAppConfig() {
  const res = await yeloPost('marketplace_fetch_app_configuration', {
    ...tenantEnvelope(),
  });
  const d = res.status === 200 && res.data ? res.data : {};
  return {
    name: d.business_name || d.domain_name || 'Marketplace',
    logo: d.logo || null,
    latitude: Number(d.latitude) || null,
    longitude: Number(d.longitude) || null,
    address: d.address || '',
  };
}

// Server-side storefront listing (real merchants for the tenant location).
export async function fetchStorefronts(latitude, longitude) {
  const res = await yeloPost('marketplace/marketplace_get_city_storefronts_v3', {
    ...tenantEnvelope(),
    latitude,
    longitude,
    vendor_id: 0,
    source: 0,
  });
  if (res.status !== 200 || !Array.isArray(res.data)) return [];
  return res.data
    .map((s) => ({
      id: s.storefront_user_id ?? s.user_id,
      name: s.store_name,
      logo: s.logo || null,
      address: s.display_address || s.address || '',
      rating: Number(s.store_rating) || 0,
      deliveryTime: Number(s.delivery_time) || null,
    }))
    .filter((s) => s.name);
}
