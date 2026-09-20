import { authorizeAgentRequest } from '@/lib/agent/auth';
import { agentJson, readAgentJson } from '@/lib/agent/http';
import { assistanceService, assistanceHttpStatus } from '@/lib/ai-assistance-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(req) {
  const auth = authorizeAgentRequest(req); if (!auth.ok) return agentJson(auth);
  const query = Object.fromEntries(new URL(req.url).searchParams);
  const data = query.candidateId ? await assistanceService.candidate(query, auth.context) : query.commandId ? await assistanceService.receipt(query.commandId, auth.context) : await assistanceService.context(query, auth.context);
  return agentJson({ data });
}
export async function POST(req) {
  const auth = authorizeAgentRequest(req, { scope: 'ai:write' }); if (!auth.ok) return agentJson(auth);
  try { const data = await assistanceService.execute(await readAgentJson(req, 64000), auth.context); return agentJson({ data, httpStatus: assistanceHttpStatus(data) }); }
  catch { return agentJson({ httpStatus: 400, data: { status: 'invalid-input', error: 'invalid-command', persisted: false } }); }
}
