import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getCalendarOutcome, saveCalendarOutcome } from '@/lib/repositories/calendar-outcomes-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  return NextResponse.json(await getCalendarOutcome(new URL(req.url).searchParams.get('eventKey')));
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const { httpStatus = 200, ...result } = await saveCalendarOutcome(parsed.data);
  return NextResponse.json(result, { status: httpStatus });
}
