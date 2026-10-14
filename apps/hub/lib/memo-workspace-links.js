import { isCanonicalUuid } from './uuid.js';
import { memoListHref } from './journal-search-client.js';

export function journalMemosFromLegacyHref(projectId = '') {
  if (projectId && !isCanonicalUuid(projectId)) return null;
  const params = new URLSearchParams();
  if (projectId) { params.set('contextType', 'project'); params.set('contextId', projectId.toLowerCase()); }
  return memoListHref(params);
}
