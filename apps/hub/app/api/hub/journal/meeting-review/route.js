import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { meetingReviewService } from '@/lib/meeting-review-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const entryId = new URL(req.url).searchParams.get('entryId');
    const result = await meetingReviewService.get(entryId);
    // Hub read routes keep the status:error envelope at HTTP 200.
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'error', error: 'read-failed', run: null, proposals: [], usage: { status: 'unknown' } }, { status: 200 });
  }
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 16 * 1024 });
  if (parsed.error) return parsed.error;
  try {
    const input = parsed.data;
    const result = input?.action === 'analyze' ? await meetingReviewService.analyze(input)
      : input?.action === 'review' ? await meetingReviewService.review(input)
        : { status: 'invalid-input', error: 'invalid-action', httpStatus: 400 };
    const { httpStatus = 200, ...body } = result;
    return NextResponse.json(body, { status: httpStatus });
  } catch {
    return NextResponse.json({ status: 'unknown', error: 'outcome-unknown', retryable: false }, { status: 502 });
  }
}
