// A/B conversion tracking — the storefront calls this when a tracked conversion
// happens (e.g. add-to-cart, checkout). Reads the visitor cookie, computes their
// variant the same way the resolver does, and increments the conversion count.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

const ROOT = process.env.STUDIO_DATA_ROOT || path.join(process.cwd(), '..');

function tenantId() {
  const p = process.env.STUDIO_PREVIEW_TENANT;
  if (p) return String(p);
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'data', 'active.json'), 'utf8'))?.tenantId || null; }
  catch { return null; }
}

export async function POST(req) {
  try {
    const { page } = await req.json();
    if (!page) return NextResponse.json({ ok: false }, { status: 400 });
    const tid = tenantId();
    if (!tid) return NextResponse.json({ ok: false });
    const safe = String(page).replace(/[^a-z0-9_-]/gi, '');
    const f = path.join(ROOT, 'tenants', String(tid), 'experiments', `${safe}.json`);
    let exp;
    try { exp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return NextResponse.json({ ok: false }); }
    if (!exp || exp.status !== 'running') return NextResponse.json({ ok: false });
    const vid = req.cookies.get('yelo_v')?.value || 'anon';
    const h = crypto.createHash('sha256').update(vid).digest();
    const split = Math.max(1, Math.min(99, Number(exp.split) || 50));
    const variant = (h[0] / 256 * 100) < split ? 'B' : 'A';
    if (!exp.counts) exp.counts = { A: { impressions: 0, conversions: 0 }, B: { impressions: 0, conversions: 0 } };
    exp.counts[variant].conversions += 1;
    fs.writeFileSync(f, JSON.stringify(exp, null, 2));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }, { status: 500 }); }
}
