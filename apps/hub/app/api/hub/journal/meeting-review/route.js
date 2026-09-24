import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { meetingReviewService } from '@/lib/meeting-review-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ANALYZE_MAX_BYTES = 16 * 1024;
const REVIEW_MAX_BYTES = 128 * 1024;

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
  // A reviewed plan can contain 50 checklist items with Korean titles and notes.
  // Parse within that bound, then retain the smaller limit for analysis requests.
  const parsed = await readHubWriteJson(req, { maxBytes: REVIEW_MAX_BYTES });
  if (parsed.error) return parsed.error;
  if (parsed.data?.action !== 'review'
    && parsed.byteLength > ANALYZE_MAX_BYTES) {
    return NextResponse.json({ status: 'payload-too-large', error: `JSON payload must be ${ANALYZE_MAX_BYTES} bytes or smaller.` }, { status: 413 });
  }
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
