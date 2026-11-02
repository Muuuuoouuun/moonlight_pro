// Threads 글 올리기 어댑터 — 글 하나 = 컨테이너 만들기 → 상태 확인 → 올리기. 연결 글은 앞 글에 reply_to_id로 잇는다.
// 공급자 응답·오류 본문·토큰은 밖으로 내보내지 않는다. POST 응답을 잃으면 'provider-effect-unconfirmed'.
// Go;Re 1건 시험 어댑터(threads-text-test-adapter.js)를 일반화했다 — 시험 계약은 그대로 둔다.
const BASE = 'https://graph.threads.net/v1.0';
export const THREADS_REQUEST_TIMEOUT_MS = 10000;
export const threadsObjectId = (value) => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);

export function createThreadsTextAdapter({ accessToken, fetchImpl = fetch } = {}) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw Error('credential-unavailable');
  async function request(path, params, method = 'GET', beforeSend) {
    const url = new URL(`${BASE}/${path}`);
    const headers = { authorization: `Bearer ${accessToken}` };
    const options = { method, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(THREADS_REQUEST_TIMEOUT_MS) };
    if (method === 'GET') url.search = new URLSearchParams(params).toString();
    else { headers['content-type'] = 'application/x-www-form-urlencoded'; options.body = new URLSearchParams(params).toString(); }
    // 보내기 직전 lease 확인 — 이미 보낸 요청을 되돌리지는 못한다.
    if (method === 'POST') beforeSend?.();
    try {
      const response = await fetchImpl(url.toString(), options);
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
      return data;
    } catch { throw Error(method === 'POST' ? 'provider-effect-unconfirmed' : 'provider-read-unconfirmed'); }
  }
  const objectId = (id) => { if (!threadsObjectId(id)) throw Error('invalid-provider-id'); return id; };
  return {
    async profile() { return request('me', { fields: 'id,username' }); },
    async createContainer(text, { replyToId = null, beforeSend } = {}) {
      const params = { media_type: 'TEXT', text };
      if (replyToId) params.reply_to_id = objectId(replyToId);
      const result = await request('me/threads', params, 'POST', beforeSend);
      if (!threadsObjectId(result.id)) throw Error('provider-effect-unconfirmed');
      return result.id;
    },
    async container(id) {
      const data = await request(objectId(id), { fields: 'id,status' });
      if (data.id !== id || !['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(data.status)) throw Error('provider-read-unconfirmed');
      return { id, status: data.status };
    },
    async publish(containerId, { beforeSend } = {}) {
      const data = await request('me/threads_publish', { creation_id: objectId(containerId) }, 'POST', beforeSend);
      if (!threadsObjectId(data.id)) throw Error('provider-effect-unconfirmed');
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

const sameText = (a, b) => String(a ?? '').replace(/\r\n/g, '\n').trim() === String(b ?? '').replace(/\r\n/g, '\n').trim();

/** 첫 글을 다시 읽어 계정 · 본문 · 링크가 맞을 때만 영수증을 만든다. */
export function verifiedThreadsPost(post, { postId, accountId, username, text }) {
  if (!post || post.id !== postId || !threadsObjectId(post.id) || (post.ownerId && post.ownerId !== accountId) ||
    String(post.username || '').toLowerCase() !== username || !sameText(post.body, text)) return null;
  try {
    const url = new URL(post.permalink);
    const handle = username.replace(/[.]/g, '\\.');
    if (url.protocol !== 'https:' || !['www.threads.com', 'www.threads.net', 'threads.com', 'threads.net'].includes(url.hostname) ||
      url.username || url.password || !new RegExp(`^/@${handle}/post/[A-Za-z0-9_-]+/?$`, 'i').test(url.pathname)) return null;
    url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/^\/@[^/]+/, `/@${username}`);
    return { postId: post.id, permalink: url.toString() };
  } catch { return null; }
}
