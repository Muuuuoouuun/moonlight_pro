import { NextResponse } from 'next/server.js';
import { readContentPublishTargets } from '@/lib/content-publish-targets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 브랜드별 올릴 곳 — 읽기 실패도 HTTP 200 + status:"error" 봉투(허브 read 계약).
export async function GET() {
  return NextResponse.json(await readContentPublishTargets(), { headers: { 'cache-control': 'private, no-store' } });
}
