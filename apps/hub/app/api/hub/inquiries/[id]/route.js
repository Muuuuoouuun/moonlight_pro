import { NextResponse } from 'next/server';
import { getInquiryDetail } from '@/lib/repositories/inquiries-ledger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req, { params }) {
 const {id} = await params;
 return NextResponse.json(await getInquiryDetail(id,{eventPage:new URL(req.url).searchParams.get('page') || 1}));
}
