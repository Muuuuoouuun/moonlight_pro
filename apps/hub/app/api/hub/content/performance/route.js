import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getContentPerformance, saveContentPerformance } from '@/lib/repositories/content-performance-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const year = new URL(req.url).searchParams.get('year');
    return NextResponse.json(await getContentPerformance(year === null ? {} : { year }));
  } catch {
    return NextResponse.json({ status: 'error', message: '콘텐츠 성과를 읽지 못했습니다. 다시 불러오세요.' });
  }
}

export async function PATCH(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  try {
    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;
    const result = await saveContentPerformance(parsed.data);
    const status = { saved: 200, preview: 202, 'invalid-input': 400, 'not-found': 404, conflict: 409, error: 500 }[result.status] || 500;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json({ status: 'error', message: '저장 결과를 확인하지 못했습니다. 다시 불러와 확인하세요.' }, { status: 500 });
  }
}
