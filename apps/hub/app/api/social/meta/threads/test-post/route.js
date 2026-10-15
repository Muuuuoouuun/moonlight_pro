import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { verifyOperatorSessionRequest } from '@/lib/operator-session';
import { isCanonicalUuid } from '@/lib/uuid';
import { runGoreThreadsTest, readGoreThreadsTestJob } from '@/lib/gore-threads-test-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = ({ httpStatus = 200, ...data }) => NextResponse.json(data, { status: httpStatus, headers: { 'cache-control': 'private, no-store' } });
// Middleware authenticates GET; GET only reads a tokenless job receipt.
export async function GET(req) {
  const id = new URL(req.url).searchParams.get('jobId');
  if (!isCanonicalUuid(id)) return json({ status: 'invalid-input', httpStatus: 400 });
  return json(await readGoreThreadsTestJob(id));
}
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  // A general Hub write secret alone cannot authorize this one-post test.
  if (!verifyOperatorSessionRequest(req).ok) return json({ status: 'forbidden', reason: 'operator-session-required', httpStatus: 401 });
  try {
    const origin = new URL(req.headers.get('origin') || req.headers.get('referer')).origin;
    if (origin !== new URL(req.url).origin) throw Error();
  } catch { return json({ status: 'forbidden', reason: 'same-origin-required', httpStatus: 403 }); }
  const parsed = await readHubWriteJson(req, { maxBytes: 2048 });
  if (parsed.error) return parsed.error;
  return json(await runGoreThreadsTest(parsed.data));
}
