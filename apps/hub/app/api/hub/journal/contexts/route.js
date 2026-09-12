import { NextResponse } from 'next/server.js';
import { getJournalContexts } from '@/lib/repositories/journal-ledger';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await getJournalContexts({ type: params.get('type'), q: params.get('q') ?? '', id: params.get('id') }));
  } catch {
    return NextResponse.json({ status: 'error', configured: Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()), workspaceId: null, contexts: [], hasMore: false, error: 'read-failed', message: '연결 대상을 불러오지 못했어요. 다시 시도해 주세요.' });
  }
}
