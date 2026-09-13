import { createHash, timingSafeEqual } from 'node:crypto';
import { invokeSupabaseRpc } from '@com-moon/supabase-rest';
import { readInquiryJson } from './inquiry-http.ts';
import { UUID, record, bytes, strictKeys, readProjects, jobHttpStatus } from '../../../packages/codex-worker/contracts.mjs';

type Rpc = typeof invokeSupabaseRpc;
type Options = { env?: NodeJS.ProcessEnv; rpc?: Rpc };
const reply = (data: Record<string, unknown>, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const error = (code: string, httpStatus: number) => reply({ status: 'error', error: code, code }, httpStatus);

export async function handleWorkerRequest(request: Request, { env = process.env, rpc = invokeSupabaseRpc }: Options = {}) {
  const expected = env.COM_MOON_CODEX_WORKER_TOKEN?.trim();
  const workspaceId = env.COM_MOON_DEFAULT_WORKSPACE_ID;
  const workerId = env.COM_MOON_CODEX_WORKER_ID || 'local-codex';
  if (!expected || !UUID.test(workspaceId || '') || !/^[a-zA-Z0-9._-]{1,100}$/.test(workerId)) return error('worker-not-configured', 503);
  if (expected === env.COM_MOON_AGENT_API_TOKEN?.trim() || expected === env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()) return error('worker-credential-must-be-isolated', 503);
  const candidate = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1]?.trim() || '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!candidate || !timingSafeEqual(digest(candidate), digest(expected))) return error('invalid-worker-credential', 401);
  const parsed = await readInquiryJson(request, { maxBytes: 65536 });
  if (!parsed.ok) return error(parsed.error, 400);
  const { action, ...input } = parsed.body;
  try {
    const fields: Record<string, string[]> = {
      pulse: [], claim: [], heartbeat: ['id', 'leaseToken'],
      event: ['id', 'leaseToken', 'eventId', 'type', 'payload', 'threadId', 'checkpoint'],
      finish: ['id', 'leaseToken', 'state', 'threadId', 'usage', 'usageReason', 'checkpoint', 'result', 'error'],
    };
    if (typeof action !== 'string' || !Object.hasOwn(fields, action)) return error('invalid-input', 400);
    strictKeys(input, fields[action]);
    if (!['pulse', 'claim'].includes(action) && (!UUID.test(String(input.id || '')) || !UUID.test(String(input.leaseToken || '')))) return error('invalid-input', 400);
    if (action === 'event' && (typeof input.eventId !== 'string' || input.eventId.length > 200 || typeof input.type !== 'string' || !/^[a-z0-9._-]{1,100}$/i.test(input.type) || !record(input.payload) || bytes(input.payload) > 16384)) return error('invalid-input', 400);
    if (input.threadId !== undefined && input.threadId !== null && (typeof input.threadId !== 'string' || !/^[a-zA-Z0-9._-]{1,200}$/.test(input.threadId))) return error('invalid-input', 400);
    if (input.checkpoint !== undefined && (!record(input.checkpoint) || bytes(input.checkpoint) > 8192)) return error('invalid-input', 400);
    if (action === 'finish') {
      if (!['succeeded', 'failed', 'cancelled', 'needs_attention'].includes(String(input.state)) || (input.result !== null && input.result !== undefined && (!record(input.result) || bytes(input.result) > 20000)) || (input.error !== null && input.error !== undefined && (typeof input.error !== 'string' || bytes(input.error) > 2048))) return error('invalid-input', 400);
      if (input.usage !== null && input.usage !== undefined && (!record(input.usage) || bytes(input.usage) > 1024 || Object.values(input.usage).some(n => n !== null && (!Number.isSafeInteger(n) || Number(n) < 0)))) return error('invalid-input', 400);
      if (input.usageReason !== undefined && input.usageReason !== null && (typeof input.usageReason !== 'string' || input.usageReason.length > 100)) return error('invalid-input', 400);
    }
    if (['pulse', 'claim'].includes(action)) input.projects = Object.entries(readProjects(env.COM_MOON_CODEX_PROJECTS_JSON)).map(([id, p]: [string, any]) => ({ id, modes: p.modes }));
    let result;
    try { result = await rpc('agent_worker_v1', { p_workspace_id: workspaceId, p_worker_id: workerId, p_action: action, p_input: input }); }
    catch { return error('worker-storage-unavailable', 502); }
    if (!result.ok) return error(result.error === 'missing-config' ? 'worker-storage-not-configured' : 'worker-storage-unavailable', result.error === 'missing-config' ? 503 : 502);
    if (!record(result.data) || typeof result.data.status !== 'string') return error('invalid-worker-response', 502);
    return reply(result.data, jobHttpStatus(result.data));
  } catch { return error('invalid-input', 400); }
}
