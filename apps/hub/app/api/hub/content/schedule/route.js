import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { cancelContentSchedule, completeContentSchedule, listContentSchedules, setContentSchedule } from '@/lib/repositories/content-schedules-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCOPES = new Set(['action', 'upcoming', 'all']);

// 읽기 실패는 5xx가 아니라 200 + { status: 'error' } — 허브 read 봉투 계약(CLAUDE.md).
export async function GET(req) {
  const scope = new URL(req.url).searchParams.get('scope') || 'all';
  return NextResponse.json(await listContentSchedules({ scope: SCOPES.has(scope) ? scope : 'all' }));
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const input = parsed.data;
  const action = input && typeof input === 'object' ? input.action : null;
  const run = { set: setContentSchedule, cancel: cancelContentSchedule, complete: completeContentSchedule }[action];
  if (!run) return NextResponse.json({ status: 'invalid-input', message: '알 수 없는 예약 작업입니다.' }, { status: 400 });
  const { httpStatus = 200, ...result } = await run(input);
  return NextResponse.json(result, { status: httpStatus });
}
