import { NextResponse } from 'next/server';
import { loadGuruArticle } from '@/lib/guru-articles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'cache-control': 'private, no-store' };

export async function GET(_request, { params }) {
  const { id } = await params;
  const article = await loadGuruArticle(id);
  return NextResponse.json(article, { status: 200, headers: HEADERS });
}
