import { NextResponse } from 'next/server.js';
import { getJournalSearch } from '@/lib/repositories/journal-search-ledger';
import { JOURNAL_SEARCH_DEFAULTS } from '@/lib/journal-search';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const input = Object.fromEntries([...Object.keys(JOURNAL_SEARCH_DEFAULTS), 'cursor', 'limit'].map(key => [key, params.get(key)]));
    return NextResponse.json(await getJournalSearch(input));
  } catch {
    return NextResponse.json({ status: 'error', configured: Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()), workspaceId: null,
      filters: { ...JOURNAL_SEARCH_DEFAULTS }, context: null, entries: [], nextCursor: null,
      error: 'read-failed', message: '메모를 찾지 못했어요. 다시 시도해 주세요.' });
  }
}
