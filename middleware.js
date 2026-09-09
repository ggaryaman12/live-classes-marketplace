// Visitor identity — every request gets a stable random visitor id cookie. This
// is what makes A/B assignment deterministic: the same visitor always gets the
// same variant. No PII, no tracking by name — just a random hex string.
import { NextResponse } from 'next/server';

export function middleware(req) {
  const res = NextResponse.next();
  if (!req.cookies.get('yelo_v')?.value) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    res.cookies.set('yelo_v', id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 365 * 86400 });
  }
  return res;
}

// Only pages, not assets/API.
export const config = { matcher: ['/', '/stores', '/checkout', '/store/:path*', '/p/:path*'] };
