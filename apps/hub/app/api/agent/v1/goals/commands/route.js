import { authorizeAgentRequest } from '@/lib/agent/auth';
import { agentJson, readAgentJson } from '@/lib/agent/http';
import { executeGoalCommand, getGoalCommandReceipt } from '@/lib/repositories/goals-ledger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const auth = authorizeAgentRequest(req); if (!auth.ok) return agentJson(auth);
  const { httpStatus = 200, ...data } = await getGoalCommandReceipt(new URL(req.url).searchParams.get('commandId'), auth.context);
  return agentJson({ data, httpStatus });
}
export async function POST(req) {
  const auth = authorizeAgentRequest(req, { scope: 'goals:write' }); if (!auth.ok) return agentJson(auth);
  try {
    const { httpStatus = 200, ...data } = await executeGoalCommand(await readAgentJson(req), auth.context);
    return agentJson({ data, httpStatus });
  } catch { return agentJson({ httpStatus: 400, data: { status: 'invalid-input', error: 'invalid-command', persisted: false } }); }
}
