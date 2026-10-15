import { GORE_THREADS_TEST, threadsId, sha256 } from './gore-threads-test-contract.js';

const BASE = 'https://graph.threads.net/v1.0';
export const THREADS_TEXT_REQUEST_TIMEOUT_MS = 10000;
export function createThreadsTextTestAdapter({ accessToken, fetchImpl = fetch } = {}) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw Error('credential-unavailable');
  async function request(path, params, method = 'GET', beforeSend) {
    const url = new URL(`${BASE}/${path}`);
    const headers = { authorization: `Bearer ${accessToken}` };
    const options = { method, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(THREADS_TEXT_REQUEST_TIMEOUT_MS) };
    if (method === 'GET') url.search = new URLSearchParams(params).toString();
    else { headers['content-type'] = 'application/x-www-form-urlencoded'; options.body = new URLSearchParams(params).toString(); }
    // Synchronous final lease check after request setup, immediately before fetch.
    // It cannot cancel an already-sent request or fence the provider atomically.
    if (method === 'POST') beforeSend?.();
    try {
      const response = await fetchImpl(url.toString(), options);
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
      return data;
    } catch { throw Error(method === 'POST' ? 'provider-effect-unconfirmed' : 'provider-read-unconfirmed'); }
  }
  function objectId(id) { if (!threadsId(id)) throw Error('invalid-provider-id'); return id; }
  return {
    async profile() { return request('me', { fields: 'id,username' }); },
    async createContainer(body, { beforeSend } = {}) {
      if (body !== GORE_THREADS_TEST.body) throw Error('body-mismatch');
      const result = await request('me/threads', { media_type: 'TEXT', text: body }, 'POST', beforeSend);
      if (!threadsId(result.id)) throw Error('provider-effect-unconfirmed');
      return result.id;
    },
    async container(id) {
      const data = await request(objectId(id), { fields: 'id,status' });
      if (data.id !== id || !['IN_PROGRESS','FINISHED','PUBLISHED','ERROR','EXPIRED'].includes(data.status)) throw Error('provider-read-unconfirmed');
      return { id, status: data.status };
    },
    async publish(containerId, { beforeSend } = {}) {
      const data = await request('me/threads_publish', { creation_id: objectId(containerId) }, 'POST', beforeSend);
      if (!threadsId(data.id)) throw Error('provider-effect-unconfirmed');
      return data.id;
    },
    async post(id) {
      const data = await request(objectId(id), { fields: 'id,username,owner,text,permalink' });
      if (data.id !== id) throw Error('provider-read-unconfirmed');
      return { id: data.id, username: data.username, ownerId: typeof data.owner === 'object' ? data.owner?.id : data.owner,
        body: data.text, permalink: data.permalink };
    },
  };
}

export function verifiedGorePost(post, job) {
  if (!post || post.id !== job.postId || !threadsId(post.id) || post.ownerId !== job.accountId ||
    post.username !== GORE_THREADS_TEST.username || post.body !== GORE_THREADS_TEST.body || sha256(post.body) !== job.bodyHash) return null;
  try {
    const url = new URL(post.permalink);
    if (url.protocol !== 'https:' || !['www.threads.com','www.threads.net','threads.com','threads.net'].includes(url.hostname) ||
      url.username || url.password || !/^\/@go_re_startagain\/post\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    url.search = ''; url.hash = '';
    return { postId: post.id, permalink: url.toString() };
  } catch { return null; }
}
