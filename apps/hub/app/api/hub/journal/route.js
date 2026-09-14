import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getJournalLedger, writeJournal } from '@/lib/repositories/journal-ledger';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await getJournalLedger({ note: params.get('note'), before: params.get('before'), beforeId: params.get('beforeId') }));
  } catch {
    return NextResponse.json({ status: 'error', configured: Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()), workspaceId: null, entries: [], entry: null, nextCursor: null, error: 'read-failed', message: '메모를 불러오지 못했어요. 다시 시도해 주세요.' });
  }
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;
    // Full Korean body plus enhancement may exceed the guard's 64KiB default.
    const parsed = await readHubWriteJson(req, { maxBytes: 128 * 1024 });
    if (parsed.error) return parsed.error;
    const { httpStatus = 200, ...result } = await writeJournal(parsed.data);
    return NextResponse.json(result, { status: httpStatus });
  } catch {
    return NextResponse.json({ status: 'error', entry: null, error: 'save-failed', retryable: true, message: '저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.' }, { status: 502 });
  }
}
