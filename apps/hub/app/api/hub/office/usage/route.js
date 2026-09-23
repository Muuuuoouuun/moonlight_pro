import { readOfficeUsage } from '@/lib/repositories/office-usage.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hub read 봉투: 실패도 HTTP 200 + status:'error' (CLAUDE.md 2026-09-01). 인증은 미들웨어 기본 게이트.
export async function GET() {
  try {
    return Response.json(await readOfficeUsage(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error', source: 'error', error: 'office-usage-read-failed' }, { headers: { 'cache-control': 'no-store' } });
  }
}
