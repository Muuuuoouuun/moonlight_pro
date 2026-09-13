import { createHash, timingSafeEqual } from 'node:crypto';
import { AGENT_SCOPES, isAgentUuid } from '@com-moon/agent-contracts';

function denied(httpStatus, code) {
  return { ok: false, httpStatus, data: { status: 'error', error: code, code, retryable: false }, context: null };
}

export function authorizeAgentRequest(request, { scope = 'read', env = process.env } = {}) {
  const token = env.COM_MOON_AGENT_API_TOKEN?.trim();
  const workspaceId = env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const actorId = env.COM_MOON_AGENT_ACTOR_ID?.trim() || 'codex';
  const scopes = [...new Set((env.COM_MOON_AGENT_SCOPES ?? 'read').split(',').map((value) => value.trim()).filter(Boolean))].sort();
  if (!token || !isAgentUuid(workspaceId) || !/^[a-zA-Z0-9._:@/-]{1,128}$/.test(actorId) || scopes.some((value) => !AGENT_SCOPES.includes(value))) {
    return denied(503, 'agent-auth-not-configured');
  }
  const header = request?.headers?.get?.('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) return denied(401, 'agent-auth-required');
  const digest = (value) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(token), digest(match[1]))) return denied(401, 'agent-auth-invalid');
  if (scope !== null && (!AGENT_SCOPES.includes(scope) || !scopes.includes(scope))) return denied(403, 'agent-scope-denied');
  return { ok: true, httpStatus: 200, data: null, context: { workspaceId, actorId, scopes } };
}
