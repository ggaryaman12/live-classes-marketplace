import { NextResponse } from 'next/server';
import { placeOrder, getAppConfig } from '../../lib/api';

// The tenant config is fetched HERE, server-side, and merged over whatever the
// client sent. currency_id, signup_field and the guest flag decide whether an
// order is accepted at all, so letting the browser supply them would let a
// tampered client place orders the tenant's own rules forbid. getAppConfig is
// wrapped in cache(), so within one request this costs no extra round trip.
export async function POST(req) {
  try {
    const body = await req.json();
    const config = await getAppConfig();
    return NextResponse.json(await placeOrder({ ...body, config }));
  } catch (e) {
    // Never surface a raw runtime message to the customer — it leaks internals
    // and reads as gibberish. Log the real one, return a plain one. Status 200
    // because the storefront reads success from the body, as the backend does.
    console.error('[order] placement failed:', e);
    return NextResponse.json({
      ok: false,
      status: 0,
      orderId: null,
      message: 'We could not reach the store. Your card has not been charged — please try again.',
    });
  }
}
