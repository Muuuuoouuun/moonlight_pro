import { parseAgentClientTokenHashes } from '@com-moon/agent-contracts';
import { AGENT_COMMAND_BODY_BYTES, AGENT_SCOPES, validateAgentContext, type AgentCommandContext } from './agent-command.ts';
import { validateSharedWebhookRequest } from './shared-webhook.ts';

type Authorized = { ok: true; context: AgentCommandContext } | { ok: false; httpStatus: number; data: Record<string, unknown> };
const denied = (httpStatus: number, error: string): Authorized => ({ ok: false, httpStatus, data: { status: 'error', error, code: error, persisted: false, retryable: false } });

export function authorizeAgentEngineRequest(req: Request): Authorized {
  // Agent commands never inherit the local open-webhook exception.
  if (!process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || !validateSharedWebhookRequest(req).ok) return denied(401, 'invalid-shared-secret');
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const defaultActorId = process.env.COM_MOON_AGENT_ACTOR_ID?.trim() || 'codex';
  const configuredScopes = [...new Set((process.env.COM_MOON_AGENT_SCOPES ?? 'read').split(',').map(value => value.trim()).filter(Boolean))];
  // Hub authenticates each client token; Engine needs only the configured actor names. Digests
  // here are never credentials — the shared secret above is what authenticates the Hub.
  const clients = parseAgentClientTokenHashes(process.env.COM_MOON_AGENT_CLIENT_TOKEN_HASHES);
  if (!clients.ok || validateAgentContext({ workspaceId, actorId: defaultActorId, scopes: configuredScopes })) return denied(503, 'agent-engine-not-configured');
  const actorId = req.headers.get('x-com-moon-agent-actor') ?? '';
  const actors = new Set([defaultActorId, ...clients.entries.map(entry => entry.actorId)]);
  if (req.headers.get('x-com-moon-agent-workspace')?.toLowerCase() !== workspaceId!.toLowerCase() || !actors.has(actorId)) return denied(403, 'agent-context-mismatch');
  const scopes = [...new Set((req.headers.get('x-com-moon-agent-scopes') || '').split(',').map(value => value.trim()).filter(Boolean))].sort();
  if (scopes.some(scope => !AGENT_SCOPES.includes(scope) || !configuredScopes.includes(scope))) return denied(403, 'insufficient-scope');
  return { ok: true, context: { workspaceId: workspaceId!.toLowerCase(), actorId, scopes } };
}

export async function readAgentCommandJson(req: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > AGENT_COMMAND_BODY_BYTES) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > AGENT_COMMAND_BODY_BYTES) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
