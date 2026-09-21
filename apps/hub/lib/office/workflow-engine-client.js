import { parseOfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';

export function officeEngineConfigured() {
  return Boolean(process.env.COM_MOON_ENGINE_URL?.trim() && process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim());
}
export async function callOfficeWorkflowEngine(request, context, { fetcher = fetch, engineUrl = process.env.COM_MOON_ENGINE_URL, secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET } = {}) {
  if (!engineUrl?.trim() || !secret?.trim()) return { status: 'preview', error: 'office-engine-not-configured' };
  try {
    const response = await fetcher(`${engineUrl.trim().replace(/\/$/, '')}/api/ai/office-workflow`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': secret.trim() },
      body: JSON.stringify({ request, context }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(55000),
    });
    const result = parseOfficeWorkflowResult(await response.json(), request, context);
    if (result.status === 'generated' && !response.ok) throw new Error('invalid-status');
    return result;
  } catch { return { status: 'unknown', error: 'office-generation-outcome-unknown' }; }
}
export async function callOfficeApplyEngine(input, context, { fetcher = fetch, engineUrl = process.env.COM_MOON_ENGINE_URL, secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET } = {}) {
  if (!engineUrl?.trim() || !secret?.trim()) return { status: 'preview', error: 'office-engine-not-configured', persisted: false };
  try {
    const response = await fetcher(`${engineUrl.trim().replace(/\/$/, '')}/api/ai/office-apply`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': secret.trim() },
      body: JSON.stringify({ ...input, context }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!result || !['saved', 'conflict', 'invalid-input', 'not-found', 'expired', 'preview', 'error', 'unknown'].includes(result.status)) throw new Error('invalid-response');
    if (result.status === 'saved' && (!response.ok || result.persisted !== true || !result.entity?.id || !result.commandId || result.action !== 'create_task')) throw new Error('invalid-receipt');
    return result;
  } catch { return { status: 'unknown', error: 'office-application-outcome-unknown', persisted: null }; }
}
