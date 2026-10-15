import { verifyOperatorSessionRequest } from '../operator-session.js';
import { hasHubServerCredential } from '../hub-write-guard.js';
import { officeOperatorIdentity } from './workflow-runtime.js';
import { officeInboxService } from './inbox-runtime.js';

function authenticatedOperator(req) {
  if (hasHubServerCredential(req)) return true;
  const verified = verifyOperatorSessionRequest(req);
  return verified.ok && /^[a-zA-Z0-9._:@/-]{1,128}$/.test(verified.session?.sub || '');
}

// Middleware remains the shared gate. This read also verifies credentials before
// the workflow identity's development fallback can be used in direct invocation.
export function createOfficeInboxHandler({ service = officeInboxService, identity = officeOperatorIdentity, authenticate = authenticatedOperator } = {}) {
  return async req => {
    const headers = { 'cache-control': 'no-store' };
    if (!authenticate(req)) return Response.json({ status: 'unauthorized', error: 'operator-session-required' }, { status: 401, headers });
    try {
      const params = new URL(req.url).searchParams;
      const query = { scope: params.get('scope'), ...(params.has('limit') ? { limit: params.get('limit') } : {}),
        ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}) };
      const result = await service.list(query, identity(req));
      return Response.json(result, { status: 200, headers });
    } catch {
      return Response.json({ status: 'error', source: 'error', error: 'office-inbox-read-unavailable', items: [], hasMore: false, nextCursor: null }, { status: 200, headers });
    }
  };
}
