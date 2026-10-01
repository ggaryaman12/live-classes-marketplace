import { NextResponse } from 'next/server';
import { getBill } from '../../lib/api';
export async function POST(req) {
  try { const b = await req.json(); return NextResponse.json(await getBill(b)); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
