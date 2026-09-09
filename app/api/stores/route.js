// Stores proxy — browser posts { latitude, longitude, search_text?, skip?, limit? }
// here; we add the tenant envelope server-side and forward to the yelo-server
// storefront-listing endpoint the marketplace webapp uses for guest browsing.
// This is the customer-facing variant (tenant-envelope auth, no api_key secret).
import { NextResponse } from 'next/server';
import { tenantEnvelope, yeloPost } from '../../lib/yeloConfig';

const STORES_PATH = 'marketplace/marketplace_get_city_storefronts_v3';

export async function POST(req) {
  let payload = {};
  try {
    payload = (await req.json()) || {};
  } catch {
    // empty body is fine — falls back to defaults below
  }

  const {
    latitude,
    longitude,
    search_text,
    filters,
    skip,
    limit,
    self_pickup,
    home_delivery,
    // This tenant has is_customer_login_required — the backend rejects the
    // listing (status 201) without a logged-in customer's vendor token. Pass
    // the access_token + vendor_id from the client session after login.
    access_token,
    vendor_id,
  } = payload;

  try {
    const data = await yeloPost(STORES_PATH, {
      ...tenantEnvelope(),
      app_type: 'WEB',
      source: 0,
      latitude: Number(latitude) || 0,
      longitude: Number(longitude) || 0,
      ...(search_text ? { search_text } : {}),
      ...(filters ? { filters } : {}),
      skip: Number(skip) || 0,
      limit: Math.min(Number(limit) || 12, 50),
      ...(self_pickup != null ? { self_pickup: Number(self_pickup) } : {}),
      ...(home_delivery != null ? { home_delivery: Number(home_delivery) } : {}),
      ...(access_token ? { access_token } : {}),
      ...(vendor_id ? { vendor_id: Number(vendor_id) } : {}),
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 100, message: 'Upstream error' });
  }
}
