import { createHash, timingSafeEqual } from 'node:crypto';
import { AGENT_ACTOR_PATTERN, AGENT_SCOPES, isAgentUuid, parseAgentClientTokenHashes } from '@com-moon/agent-contracts';

function denied(httpStatus, code) {
  return { ok: false, httpStatus, data: { status: 'error', error: code, code, retryable: false }, context: null };
}

// The shared COM_MOON_AGENT_API_TOKEN acts as COM_MOON_AGENT_ACTOR_ID (default `codex`).
// COM_MOON_AGENT_CLIENT_TOKEN_HASHES optionally adds `actor:sha256hex` pairs so each MCP client
// presents its own token and receipts name who acted. Every client shares COM_MOON_AGENT_SCOPES.
export function authorizeAgentRequest(request, { scope = 'read', env = process.env } = {}) {
  const token = env.COM_MOON_AGENT_API_TOKEN?.trim();
  const workspaceId = env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const defaultActorId = env.COM_MOON_AGENT_ACTOR_ID?.trim() || 'codex';
  const scopes = [...new Set((env.COM_MOON_AGENT_SCOPES ?? 'read').split(',').map((value) => value.trim()).filter(Boolean))].sort();
  const clients = parseAgentClientTokenHashes(env.COM_MOON_AGENT_CLIENT_TOKEN_HASHES, { sharedToken: token });
  if (!token || !isAgentUuid(workspaceId) || !AGENT_ACTOR_PATTERN.test(defaultActorId) || scopes.some((value) => !AGENT_SCOPES.includes(value)) || !clients.ok) {
    return denied(503, 'agent-auth-not-configured');
  }
  const header = request?.headers?.get?.('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) return denied(401, 'agent-auth-required');
  const digest = (value) => createHash('sha256').update(value).digest();
  const presented = digest(match[1]);
  // Equal-length digests, every entry compared: timing does not reveal which identity matched.
  // Digests are unique and never the shared token's, so at most one comparison succeeds.
  let actorId = timingSafeEqual(digest(token), presented) ? defaultActorId : null;
  for (const client of clients.entries) {
    if (timingSafeEqual(Buffer.from(client.digest, 'hex'), presented)) actorId = client.actorId;
  }
  if (!actorId) return denied(401, 'agent-auth-invalid');
  if (scope !== null && (!AGENT_SCOPES.includes(scope) || !scopes.includes(scope))) return denied(403, 'agent-scope-denied');
  return { ok: true, httpStatus: 200, data: null, context: { workspaceId, actorId, scopes } };
}
