import { fetchSupabaseRowsDetailed, invokeSupabaseRpc, resolveDefaultWorkspaceId } from '@com-moon/supabase-rest';
import { resolveMetricEntityScope } from './metrics/source-adapters.js';
import { getGoalsLedger } from './repositories/goals-ledger.js';
import { createAssistanceService } from './ai-assistance.js';

async function generate(input) {
  const url = process.env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/, '');
  const secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return { status: 'preview', error: 'engine-not-configured', usage: null };
  try {
    const response = await fetch(`${url}/api/ai/assist`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': secret }, body: JSON.stringify(input), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!data || !['generated', 'error', 'preview', 'unknown', 'invalid-input'].includes(data.status)) throw new Error('invalid-response');
    return data;
  } catch { return { status: 'unknown', error: 'provider-outcome-unknown', usage: null }; }
}
export const assistanceService = createAssistanceService({
  recoverySecret: () => process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim(),
  goals: (query, context) => getGoalsLedger(query, context),
  read: fetchSupabaseRowsDetailed, resolveScope: resolveMetricEntityScope, generate,
  rpc: async (name, params) => {
    const result = await invokeSupabaseRpc(name, params);
    if (!result.ok || !result.data || typeof result.data !== 'object') throw new Error('assistance-persistence-unavailable');
    return result.data;
  },
});
export const operatorAssistanceContext = () => ({ workspaceId: resolveDefaultWorkspaceId(), actorId: 'operator' });
export function assistanceHttpStatus(data) {
  return data.status === 'invalid-input' ? 400 : data.status === 'conflict' ? 409 : ['unknown', 'running', 'preview', 'unsaved'].includes(data.status) ? 202 : data.status === 'error' ? 502 : 200;
}
