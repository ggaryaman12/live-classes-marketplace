import { NextResponse } from 'next/server';
import { getWallet } from '../../lib/api';
export async function POST(req) {
  try { const { session } = await req.json(); return NextResponse.json(await getWallet(session)); }
  catch (e) { return NextResponse.json({ balance: 0, enabled: false }); }
}
