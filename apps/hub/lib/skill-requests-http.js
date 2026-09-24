import { assertHubWriteAllowed, readHubWriteJson } from './hub-write-guard.js';
import { authorizeAgentRequest } from './agent/auth.js';
import { readAgentJson } from './agent/http.js';
import { skillRequestService } from './skill-requests.js';

const json = ({ httpStatus, data }) => Response.json(data, { status: httpStatus, headers: { 'cache-control': 'no-store' } });

export function createHubSkillRequestHandler(action, { service = skillRequestService, guard = assertHubWriteAllowed } = {}) {
  return async (request) => {
    if (action === 'create') { const denied = guard(request); if (denied) return denied; }
    try {
      if (action === 'create') {
        const parsed = await readHubWriteJson(request, { maxBytes: 16384 });
        return parsed.error || json(await service.create(parsed.data));
      }
      const query = new URL(request.url).searchParams;
      return json(query.has('id') ? await service.get(query.get('id')) : await service.list({ limit: query.get('limit') || 20 }));
    } catch {
      return json({ httpStatus: action === 'create' ? 502 : 200,
        data: { status: 'error', source: 'error', error: 'skill-request-unavailable', persisted: false } });
    }
  };
}

export function createAgentSkillRequestHandler(action, { service = skillRequestService, authorize = authorizeAgentRequest } = {}) {
  return async (request, route = {}) => {
    const auth = authorize(request, { scope: action === 'record' ? 'tasks:write' : 'read' });
    if (!auth.ok) return json(auth);
    try {
      const { id } = await route.params || {};
      const context = auth.context;
      if (action === 'get') {
        const result = await service.get(id, context);
        // Agent callers need a non-200 on a missing request, even though Hub
        // read routes preserve their 200 error-envelope contract.
        return json(result.data.status === 'not-found' ? { ...result, httpStatus: 404 } : result);
      }
      const input = await readAgentJson(request, 16384);
      return json(await service.record(id, input, context));
    } catch (error) {
      return json({ httpStatus: error?.status || 502, data: { status: 'error', error: error?.status ? error.message : 'skill-request-unavailable', persisted: false } });
    }
  };
}
