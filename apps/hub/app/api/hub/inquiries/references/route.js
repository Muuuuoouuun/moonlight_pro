import { NextResponse } from 'next/server';
import { getInquiryReferences } from '@/lib/repositories/inquiries-ledger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  return NextResponse.json(await getInquiryReferences({ query: new URL(req.url).searchParams.get('q') || '' }));
}
