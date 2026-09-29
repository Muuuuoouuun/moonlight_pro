import { createHash } from 'node:crypto';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from './server-write.js';
import { normalizeResearchCommand } from './research-inbox-contract.js';
import { isCanonicalUuid } from './uuid.js';

export async function runResearchCommand(input, {
  workspaceId = resolveDefaultWorkspaceId(), invokeRpc = invokeSupabaseRpc,
} = {}) {
  const command = normalizeResearchCommand(input);
  if (!command) return { status: 'invalid-input', error: 'invalid-command', httpStatus: 400 };
  if (!isCanonicalUuid(workspaceId)) return { status: 'preview', error: 'missing-workspace', httpStatus: 503 };
  const { requestId, ...payload } = command;
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  try {
    const result = await invokeRpc('research_command_v1', {
      p_workspace_id: workspaceId, p_request_id: requestId, p_request_hash: hash, p_command: payload,
    }, { timeoutMs: 15000 });
    if (!result.ok || !result.data || typeof result.data !== 'object') {
      return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
    }
    const data = result.data;
    if (data.status === 'saved' || data.status === 'duplicate') return { ...data, httpStatus: 200 };
    if (data.status === 'invalid-input') return { ...data, httpStatus: 400 };
    if (data.status === 'conflict') return { ...data, httpStatus: 409 };
    return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
  } catch { return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 }; }
}
