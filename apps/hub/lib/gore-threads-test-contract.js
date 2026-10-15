import { createHash } from 'node:crypto';
import { isCanonicalUuid } from './uuid.js';

// User-approved one-post test. This contract cannot select another brand/body.
export const GORE_THREADS_TEST = Object.freeze({
  jobKey: 'gore-threads-test-20260930-01', brandKey: 'gore',
  brandId: '7fad9d64-bb90-4a63-8528-de8a8a23836d', provider: 'meta_threads',
  appKey: 'gore', username: 'go_re_startagain', visibility: 'public',
  body: '확실히 하고 후회하는 게 훨씬 이득이다.\n\n해보고 나면, 적어도 다음 선택은 더 선명해진다.\n오늘은 작은 행동 하나부터.',
  bodyHash: 'cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e',
});
export const threadsId = value => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function normalizeGoreTestCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    !['prepare', 'execute', 'reconcile'].includes(input.action)) return null;
  const keys = input.action === 'prepare' ? ['action','accountId','appId','bodyHash','confirmPrepare','visibility']
    : input.action === 'execute' ? ['action','jobId','accountId','appId','bodyHash','confirmPublish','visibility']
      : ['action','jobId','accountId','appId','bodyHash','confirmLookup','observedPostId','confirmRecoveredPost'];
  if (Object.keys(input).some(key => !keys.includes(key)) || !threadsId(input.accountId) || !threadsId(input.appId) ||
    input.bodyHash !== GORE_THREADS_TEST.bodyHash ||
    (input.action !== 'prepare' && !isCanonicalUuid(input.jobId))) return null;
  if (input.action === 'prepare' && (input.confirmPrepare !== true || input.visibility !== 'public')) return null;
  if (input.action === 'execute' && (input.confirmPublish !== true || input.visibility !== 'public')) return null;
  if (input.action === 'reconcile' && (input.confirmLookup !== true ||
    (input.observedPostId != null && (!threadsId(input.observedPostId) || input.confirmRecoveredPost !== true)))) return null;
  return { ...input };
}

export function approvedGorePayload(workspaceId, accountId, appId) {
  if (!isCanonicalUuid(workspaceId) || !threadsId(accountId) || !threadsId(appId)) return null;
  const value = { ...GORE_THREADS_TEST, workspaceId, accountId, appId };
  return { ...value, payloadHash: sha256(JSON.stringify(value)) };
}

export function matchesApprovedGoreJob(job, workspaceId, command) {
  const payload = approvedGorePayload(workspaceId, command.accountId, command.appId);
  return Boolean(payload && job && job.workspaceId === workspaceId && job.jobKey === payload.jobKey &&
    job.brandId === payload.brandId && job.brandKey === 'gore' && job.provider === 'meta_threads' &&
    job.appKey === 'gore' && job.accountId === command.accountId && job.appId === command.appId &&
    job.username === payload.username && job.body === payload.body && job.bodyHash === payload.bodyHash &&
    sha256(job.body) === payload.bodyHash && job.payloadHash === payload.payloadHash && job.visibility === 'public');
}

export function publicGoreJob(job) {
  if (!job) return null;
  // Whitelist: never serialize credentials, lease tokens, provider errors or RPC internals.
  return Object.fromEntries(['id','jobKey','brandKey','provider','accountId','appId','username','body','bodyHash',
    'visibility','state','version','containerId','postId','permalink','receiptSource','errorCode','createdAt','updatedAt','verifiedAt']
    .map(key => [key, job[key] ?? null]));
}
