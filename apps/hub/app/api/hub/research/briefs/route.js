import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { listResearchBriefs } from '@/lib/repositories/research-inbox-ledger';
import { runResearchCommand } from '@/lib/research-inbox-command';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (data, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store, max-age=0' },
});

export async function GET() {
  try { return json(await listResearchBriefs()); }
  catch { return json({ status: 'error', briefs: [] }); }
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 32768 });
  if (parsed.error) return parsed.error;
  const { httpStatus, ...result } = await runResearchCommand(parsed.data);
  return json(result, httpStatus);
}
