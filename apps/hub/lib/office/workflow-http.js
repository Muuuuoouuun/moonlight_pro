import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { officeOperatorIdentity, officeWorkflowService } from './workflow-runtime.js';

export function officeWorkflowHttpStatus(result) {
  return result.status === 'invalid-input' ? 400 : result.status === 'conflict' ? 409 : result.status === 'not-found' ? 404
    : ['running', 'unknown', 'unsaved', 'preview'].includes(result.status) ? 202 : result.status === 'error' ? 502 : 200;
}
export function officeQueryFromUrl(url) {
  const params = new URL(url).searchParams, intent = params.get('intent'), scope = params.get('scope');
  const originRef = intent === 'weekly_report'
    ? { periodStart: params.get('periodStart'), periodEnd: params.get('periodEnd'), timezone: params.get('timezone') }
    : { entityType: params.get('entityType'), entityId: params.get('entityId') };
  return { intent, scope, originRef, ...(params.has('limit') ? { limit: params.get('limit') } : {}), ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}) };
}
export function createOfficeWorkflowHandler(action, { service = officeWorkflowService, identity = officeOperatorIdentity, guard = assertHubWriteAllowed } = {}) {
  const read = ['context', 'list', 'receipt'].includes(action);
  return async (req, route = {}) => {
    if (!read) { const denied = guard(req); if (denied) return denied; }
    try {
      const actor = identity(req), params = await route.params;
      let result;
      if (action === 'context' || action === 'list') result = await service[action](officeQueryFromUrl(req.url), actor);
      else if (action === 'receipt') result = await service.receipt(params?.id, actor);
      else {
        const body = await readHubWriteJson(req, { maxBytes: 100000 }); if (body.error) return body.error;
        result = action === 'execute' ? await service.execute(body.data, actor) : await service[action](params?.id, body.data, actor);
      }
      // Read failure envelopes are the Hub contract: never hide them as an empty
      // result or change them back into 5xx responses.
      if (read && !['ready', 'preview', 'generated', 'running', 'unknown', 'expired'].includes(result.status)) result = { ...result, status: 'error', source: 'error' };
      return Response.json(result, { status: read ? 200 : officeWorkflowHttpStatus(result), headers: { 'cache-control': 'no-store' } });
    } catch {
      return Response.json({ status: 'error', source: 'error', error: 'Office 요청을 확인하지 못했습니다. 입력은 보존됩니다.' }, { status: read ? 200 : 502 });
    }
  };
}
