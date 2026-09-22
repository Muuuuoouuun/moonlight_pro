import { authorizeAgentRequest } from '@/lib/agent/auth';
import { agentJson } from '@/lib/agent/http';
import { getGoalsLedger } from '@/lib/repositories/goals-ledger';
import { AgentInputError } from '@com-moon/agent-contracts';
import { parseAgentGoalsQuery,projectAgentGoals } from '@/lib/agent/goals-projection';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const auth = authorizeAgentRequest(req); if (!auth.ok) return agentJson(auth);
  try {
    const query=parseAgentGoalsQuery(Object.fromEntries(new URL(req.url).searchParams));
    const ledger=await getGoalsLedger(query,auth.context);
    return agentJson({data:projectAgentGoals(ledger,query,auth.context)});
  } catch(error) {
    return agentJson({httpStatus:error instanceof AgentInputError?400:502,data:{status:'error',error:error instanceof AgentInputError?error.code:'goal-read-failed',retryable:false}});
  }
}
