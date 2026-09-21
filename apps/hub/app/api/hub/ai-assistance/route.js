import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { assistanceService, operatorAssistanceContext, assistanceHttpStatus } from '@/lib/ai-assistance-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(req) {
  const query = Object.fromEntries(new URL(req.url).searchParams);
  const data = query.candidateId ? await assistanceService.candidate(query, operatorAssistanceContext()) : query.commandId ? await assistanceService.receipt(query.commandId, operatorAssistanceContext()) : await assistanceService.context(query, operatorAssistanceContext());
  return Response.json(data, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req) {
  const guard = assertHubWriteAllowed(req); if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 64000 }); if (parsed.error) return parsed.error;
  const data = await assistanceService.execute(parsed.data, operatorAssistanceContext());
  return Response.json(data, { status: assistanceHttpStatus(data) });
}
