import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { verifyOperatorSessionRequest } from '@/lib/operator-session';
import { readLatestThreadsJob, runThreadsPublish } from '@/lib/threads-publish-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 연결 글 10개까지 차례로 올린다 — 글 하나에 공급자 왕복 세 번.
export const maxDuration = 60;
const json = ({ httpStatus = 200, ...data }) => NextResponse.json(data, { status: httpStatus, headers: { 'cache-control': 'private, no-store' } });

// 읽기는 미들웨어 세션 게이트 뒤 — 결과물의 가장 최근 올리기 작업(토큰·계정 ID 없음).
export async function GET(req) {
  const result = await readLatestThreadsJob(new URL(req.url).searchParams.get('variantId'));
  return json({ ...result, httpStatus: result.status === 'invalid-input' ? 400 : 200 });
}

// 밖으로 글을 보내는 쓰기 — 서버 간 비밀만으로는 열리지 않는다. 운영자 세션 + 같은 출처가 필요하다.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  if (!verifyOperatorSessionRequest(req).ok) return json({ status: 'forbidden', reason: 'operator-session-required', httpStatus: 401 });
  try {
    const origin = new URL(req.headers.get('origin') || req.headers.get('referer')).origin;
    if (origin !== new URL(req.url).origin) throw Error();
  } catch { return json({ status: 'forbidden', reason: 'same-origin-required', httpStatus: 403 }); }
  const parsed = await readHubWriteJson(req, { maxBytes: 2048 });
  if (parsed.error) return parsed.error;
  return json(await runThreadsPublish(parsed.data));
}
