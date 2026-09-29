import { NextResponse } from 'next/server.js';
import { getMeetingReviewWatchlist } from '@/lib/meeting-review-watchlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Hub read failures use the HTTP 200 status:error envelope.
    return NextResponse.json(await getMeetingReviewWatchlist(), { status: 200 });
  } catch {
    return NextResponse.json({ status: 'error', items: [], hasMore: false, error: 'read-failed',
      message: '함께 신경 쓸 일을 불러오지 못했어요. 다시 확인해 주세요.' }, { status: 200 });
  }
}
