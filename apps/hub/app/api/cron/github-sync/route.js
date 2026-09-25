import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 제품 렌즈 0단계 "켜기"(docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §10):
// 하루 몇 번 GitHub 폴링 요약을 돌린다. 실제 동기화는 Engine이 하고, 여기서는 CRON_SECRET을 확인한 뒤
// shared secret으로 Engine을 부른다. 저장소가 하나도 연결되지 않았으면 Engine이 preview로 답한다.
export async function GET(req) {
  const secret = process.env.CRON_SECRET?.trim();
  const expected = Buffer.from(secret ? `Bearer ${secret}` : '');
  const supplied = Buffer.from(req.headers.get('authorization') || '');
  if (!secret || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ status: 'forbidden', error: 'github-cron-unauthorized' }, { status: 401 });
  }
  const engineUrl = (process.env.COM_MOON_ENGINE_URL?.trim() || '').replace(/\/$/, '');
  const sharedSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || '';
  if (!engineUrl) return NextResponse.json({ status: 'preview', error: 'engine-not-configured' }, { status: 202 });
  if (!sharedSecret) return NextResponse.json({ status: 'error', error: 'shared-secret-not-configured' }, { status: 503 });
  try {
    const response = await fetch(`${engineUrl}/api/integrations/github/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': sharedSecret },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json().catch(() => ({ status: 'error', error: `engine-http-${response.status}` }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: 'engine-unreachable', detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
