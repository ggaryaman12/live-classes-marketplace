// Auth proxy — the browser posts { action, ...fields } here; we add the tenant
// envelope + app_type server-side and forward to the real yelo-server endpoint.
// Only whitelisted actions are allowed; nothing else reaches the backend.
//
// The PAYLOAD SHAPING lives in ../../lib/auth.js, pure and tested, because one
// spread over every endpoint is what broke OTP login: the customer/* endpoints
// validate with Joi and REJECT unknown keys, so envelope fields the
// marketplace_* endpoints happily ignore were fatal there.
import { NextResponse } from 'next/server';
import { tenantEnvelope, yeloPost } from '../../lib/yeloConfig';
import { buildAuthBody } from '../../lib/auth';

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ status: 100, message: 'Bad request' });
  }

  const { action, ...fields } = payload || {};
  const built = buildAuthBody(action, { app_type: 'WEB', ...fields }, tenantEnvelope());
  if (!built) {
    return NextResponse.json({ status: 100, message: 'Unknown action' });
  }

  try {
    return NextResponse.json(await yeloPost(built.path, built.body));
  } catch (e) {
    console.error('[auth] upstream failed:', e);
    return NextResponse.json({ status: 100, message: 'Upstream error' });
  }
}
