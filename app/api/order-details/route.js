// Read one placed order back from the backend, so the confirmation prints the
// store's own record rather than a snapshot the browser took.
//
// Same shape as every other route here: the session arrives in the body, the
// tenant envelope is added server-side, and a failure returns JSON rather than
// an HTML error page.
import { NextResponse } from 'next/server';
import { getOrder } from '../../lib/api';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' });
  }
  try {
    const order = await getOrder(body?.jobId, body?.session);
    return NextResponse.json({ ok: !!order, order: order || null });
  } catch (e) {
    console.error('[order-details] upstream failed:', e);
    return NextResponse.json({ ok: false, error: 'Upstream error' });
  }
}
