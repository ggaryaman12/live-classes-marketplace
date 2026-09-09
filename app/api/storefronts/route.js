// Merchant listing — real data from the YELO backend (test-api-3025).
// Browser posts { latitude, longitude }; we add the tenant envelope server-side
// and call the storefront-listing endpoint. Returns a trimmed, UI-shaped list.
import { NextResponse } from 'next/server';
import { tenantEnvelope, yeloPost } from '../../lib/yeloConfig';

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { latitude, longitude } = body || {};

  const data = await yeloPost('marketplace/marketplace_get_city_storefronts_v3', {
    ...tenantEnvelope(),
    latitude,
    longitude,
    vendor_id: 0,
    source: 0,
  });

  if (data.status !== 200 || !Array.isArray(data.data)) {
    return NextResponse.json({ ok: false, message: data.message || 'No storefronts', stores: [] });
  }

  // Map the 89-field raw store objects down to what a card needs.
  const stores = data.data.map((s) => ({
    id: s.storefront_user_id ?? s.user_id,
    name: s.store_name,
    logo: s.logo || null,
    address: s.display_address || s.address || '',
    rating: Number(s.store_rating) || 0,
    ratingCount: Number(s.total_ratings_count) || 0,
    deliveryTime: Number(s.delivery_time) || null,
    homeDelivery: s.home_delivery === 1,
  })).filter((s) => s.name);

  return NextResponse.json({ ok: true, count: stores.length, stores });
}
