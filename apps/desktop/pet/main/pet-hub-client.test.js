'use strict';
// Mac Tests/HubTransportTests.swift 이식 + 실제 로컬 http 서버로 Origin·Cookie 전달과 리다이렉트 거부 확인.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  canonicalOrigin, createHubClient, timeoutsFor, electronCookieBridge, parseSetCookie, HubError,
} = require('./pet-hub-client');

const HUB = 'https://hub.example.test';

// 요청을 기록하고 정해진 응답을 돌려주는 fetch 대역.
function scriptedFetch(handler) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init, headers: { ...init.headers } });
    return handler({ url, ...init }, calls.length);
  };
  return { fetch, calls };
}
const json = (value, status = 200, headers = {}) => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers });

async function rejects(promise, kind, error) {
  await assert.rejects(promise, (e) => {
    assert.ok(e instanceof HubError, `HubError 가 아니다: ${e}`);
    assert.equal(e.kind, kind);
    if (error) assert.equal(e.error, error);
    return true;
  });
}

test('https 와 정확한 http loopback origin 만 받는다', () => {
  for (const address of ['https://hub.example.test', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.ok(canonicalOrigin(address), address);
  }
  for (const address of ['http://hub.example.test', 'http://127.1:3000', 'http://127.0.0.1.example.test', 'https://user:pass@hub.example.test',
    'https://hub.example.test/base', 'https://hub.example.test?token=secret', 'https://hub.example.test#fragment', 'file:///tmp/hub',
    'https://hub.example.test?', 'javascript:alert(1)', '', null]) {
    assert.equal(canonicalOrigin(address), null, String(address));
  }
  assert.throws(() => createHubClient({ origin: 'http://remote.example.test' }), (e) => e.error === 'rejected-url');
});

test('같은 origin 은 입력 표기가 달라도 한 이름으로', () => {
  assert.equal(canonicalOrigin('https://HUB.example.test:443/'), HUB);
  assert.equal(canonicalOrigin('https://hub.example.test'), HUB);
  assert.equal(canonicalOrigin('http://LOCALHOST:80/'), 'http://localhost');
});

test('Origin·content-type 은 쓰기에만, 서버 자격은 절대 싣지 않는다', async () => {
  const { fetch, calls } = scriptedFetch(() => json({ status: 'ok', source: 'supabase' }));
  const client = createHubClient({ origin: HUB, fetch, cookieHeader: async () => 'com_moon_operator_session=s1' });
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    await client.request('/api/hub/tasks?limit=20', { method, body: method === 'GET' ? undefined : {} });
  }
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'PATCH', 'DELETE']);
  for (const call of calls) {
    assert.equal(call.headers.origin, call.method === 'GET' ? undefined : HUB);
    assert.equal(call.headers['content-type'], call.method === 'GET' ? undefined : 'application/json');
    assert.equal(call.headers.cookie, 'com_moon_operator_session=s1');
    assert.equal(call.headers.authorization, undefined);
    assert.equal(call.headers['x-com-moon-hub-write-secret'], undefined);
    assert.equal(call.redirect, 'manual');
    assert.equal(call.body === undefined, call.method === 'GET');
  }
});

test('Office chat 정확한 POST 만 긴 시간 예산', () => {
  const routes = [
    ['/api/hub/office/chat', 'POST', 60000, 70000], ['/api/hub/office/chat', 'post', 60000, 70000],
    ['/api/hub/office/chat', 'GET', 20000, 45000], ['/api/hub/office/chat', 'PATCH', 20000, 45000],
    ['/api/hub/office/chat?scope=personal', 'POST', 20000, 45000], ['/api/hub/office/chat?', 'POST', 20000, 45000],
    ['/api/hub/office/chat/', 'POST', 20000, 45000], ['/api/hub/office/chat-extra', 'POST', 20000, 45000],
    ['/api/hub/office/ch%61t', 'POST', 20000, 45000], ['/api/hub/office/assignment', 'POST', 20000, 45000],
    ['/api/hub/tasks', 'POST', 20000, 45000],
  ];
  for (const [path, method, request, total] of routes) assert.deepEqual(timeoutsFor(path, method), { request, total }, `${method} ${path}`);
});

test('주입한 타이머가 경로별 예산으로 잡힌다', async () => {
  const budgets = [];
  const { fetch } = scriptedFetch(() => json({ status: 'ok' }));
  const client = createHubClient({ origin: HUB, fetch, setTimeout: (fn, ms) => { budgets.push(ms); return setTimeout(fn, 1e9); }, clearTimeout });
  await client.request('/api/hub/office/chat', { method: 'POST', body: {} });
  await client.request('/api/hub/tasks');
  assert.deepEqual(budgets, [70000, 60000, 45000, 20000]);
});

test('절대 주소·// ·점 세그먼트·조각·/api 밖 경로는 네트워크 전에 거절', async () => {
  const { fetch, calls } = scriptedFetch(() => json({ status: 'ok' }));
  const client = createHubClient({ origin: HUB, fetch });
  for (const path of ['https://other.example.test/api/hub/tasks', '//other.example.test/api/hub/tasks', '/api/../login', '/api/%2e%2e/login',
    '/api/hub/tasks#fragment', '/dashboard/work/my', '/api\\hub', '/api/./hub']) {
    await rejects(client.request(path), 'error', 'rejected-url');
  }
  await rejects(client.request('/api/hub/tasks', { method: 'PUT' }), 'error', 'rejected-url');
  assert.equal(calls.length, 0);
});

test('HTTP 200 오류 봉투는 빈 성공이 되지 않는다', async () => {
  for (const body of [{ status: 'error', tasks: [] }, { status: 'ok', source: 'error', items: [] }]) {
    const client = createHubClient({ origin: HUB, fetch: async () => json(body) });
    await assert.rejects(client.request('/api/hub/tasks'), (e) => e.kind === 'error' && e.error === 'server' && e.httpStatus === 200);
  }
});

test('preview 는 표시된 채 돌아오고 live 가 되지 않는다', async () => {
  for (const body of [{ status: 'preview' }, { status: 'ok', source: 'preview' }]) {
    const client = createHubClient({ origin: HUB, fetch: async () => json(body) });
    const response = await client.request('/api/hub/tasks');
    assert.equal(response.preview, true);
    assert.deepEqual(response.json, body);
  }
});

test('봉투 분류 표 — 인증·설정·충돌·서버·형식', async () => {
  const cases = [
    [401, { status: 'unauthorized' }, 'unauthorized'],
    [403, { status: 'forbidden', error: 'same-origin-required' }, 'unauthorized'],
    [200, { status: 'unauthorized' }, 'unauthorized'],
    [200, { status: 'forbidden' }, 'unauthorized'],
    [503, { status: 'not-configured' }, 'not-configured'],
    [401, { status: 'x', error: 'operator-login-not-configured' }, 'not-configured'],
    [409, { status: 'conflict', error: 'revision-conflict' }, 'conflict'],
    [500, { status: 'error' }, 'error'],
    [502, { status: 'saved' }, 'error'],
    [200, '<html>Login</html>', 'invalid'],
    [200, '[]', 'invalid'],
    [200, '', 'invalid'],
  ];
  for (const [status, body, kind] of cases) {
    const client = createHubClient({ origin: HUB, fetch: async () => json(body, status) });
    await assert.rejects(client.request('/api/hub/journal', { method: 'POST', body: {} }), (e) => e.kind === kind, `${status} ${JSON.stringify(body)}`);
  }
  const noContent = createHubClient({ origin: HUB, fetch: async () => new Response(null, { status: 204 }) });
  const empty = await noContent.request('/api/hub/tasks', { method: 'DELETE' });
  assert.equal(empty.httpStatus, 204);
  assert.equal(empty.json, null);
});

test('다른 origin 의 응답은 받지 않는다', async () => {
  const other = json({ status: 'live' });
  Object.defineProperty(other, 'url', { value: 'https://other.example.test/api/hub/tasks' });
  const client = createHubClient({ origin: HUB, fetch: async () => other });
  await rejects(client.request('/api/hub/tasks'), 'invalid', 'invalid-response');
});

test('리다이렉트 응답은 따라가지 않고 거절', async () => {
  const { fetch, calls } = scriptedFetch(() => json({}, 307, { location: 'https://other.example.test/receive' }));
  const client = createHubClient({ origin: HUB, fetch });
  await rejects(client.request('/api/operator/session', { method: 'POST', body: {} }), 'error', 'redirect-rejected');
  assert.equal(calls.length, 1);
  const opaque = { type: 'opaqueredirect', status: 0, url: '', headers: new Headers(), text: async () => '' };
  const browserLike = createHubClient({ origin: HUB, fetch: async () => opaque });
  await rejects(browserLike.request('/api/hub/tasks'), 'error', 'redirect-rejected');
});

test('네트워크 실패·시간 초과는 재시도 없이 분류', async () => {
  for (const path of ['/api/hub/tasks', '/api/hub/office/chat']) {
    let count = 0;
    const offline = createHubClient({ origin: HUB, fetch: async () => { count += 1; throw new TypeError('fetch failed'); } });
    await rejects(offline.request(path, { method: 'POST', body: {} }), 'error', 'offline');
    assert.equal(count, 1);
    count = 0;
    // 타이머를 즉시 발화 — 요청이 abort 되면 timeout 으로 읽는다.
    const hanging = createHubClient({
      origin: HUB,
      fetch: (url, init) => { count += 1; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); },
      setTimeout: (fn) => setTimeout(fn, 5), clearTimeout,
    });
    await rejects(hanging.request(path, { method: 'POST', body: {} }), 'error', 'timeout');
    assert.equal(count, 1);
  }
});

test('호출자가 AbortSignal 로 취소하면 cancelled', async () => {
  const controller = new AbortController();
  const client = createHubClient({
    origin: HUB,
    fetch: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  const pending = client.request('/api/hub/office/chat', { method: 'POST', body: {}, signal: controller.signal });
  controller.abort();
  await rejects(pending, 'error', 'cancelled');
  controller.abort();
  await rejects(client.request('/api/hub/tasks', { signal: controller.signal }), 'error', 'cancelled');
});

test('세션 상태: anonymous 는 오류가 아니다', async () => {
  const { fetch, calls } = scriptedFetch(() => json({ status: 'anonymous', configured: true, reason: 'missing-cookie' }));
  const client = createHubClient({ origin: HUB, fetch });
  assert.deepEqual(await client.sessionStatus(), { status: 'anonymous', configured: true, reason: 'missing-cookie' });
  assert.equal(new URL(calls[0].url).pathname, '/api/operator/session');
  assert.equal(calls[0].method, 'GET');
  for (const body of [{ status: 'ok', configured: true }, { status: 'authenticated' }]) {
    const bad = createHubClient({ origin: HUB, fetch: async () => json(body) });
    await rejects(bad.sessionStatus(), 'invalid');
  }
});

test('로그아웃은 logged_out 봉투만 인정', async () => {
  const { fetch, calls } = scriptedFetch(() => json({ status: 'logged_out' }));
  const client = createHubClient({ origin: HUB, fetch });
  assert.deepEqual(await client.logout(), { status: 'logged_out' });
  assert.deepEqual(JSON.parse(calls[0].body), { action: 'logout' });
  assert.equal(calls[0].headers.origin, HUB);
  const preview = createHubClient({ origin: HUB, fetch: async () => json({ status: 'logged_out', source: 'preview' }) });
  await rejects(preview.logout(), 'invalid');
});

test('쿠키 헤더 값에 줄바꿈이 있으면 싣지 않는다', async () => {
  const { fetch, calls } = scriptedFetch(() => json({ status: 'ok' }));
  const client = createHubClient({ origin: HUB, fetch, cookieHeader: async () => 'a=1\r\nx-injected: 1' });
  await client.request('/api/hub/tasks');
  assert.equal(calls[0].headers.cookie, undefined);
});

test('Set-Cookie 해석 — Electron cookies.set 입력', () => {
  const parsed = parseSetCookie('com_moon_operator_session=v2; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600', `${HUB}/api/hub/tasks`);
  assert.equal(parsed.remove, false);
  assert.equal(parsed.details.name, 'com_moon_operator_session');
  assert.equal(parsed.details.value, 'v2');
  assert.equal(parsed.details.path, '/');
  assert.equal(parsed.details.httpOnly, true);
  assert.equal(parsed.details.secure, true);
  assert.equal(parsed.details.sameSite, 'lax');
  assert.ok(parsed.details.expirationDate > Date.now() / 1000);
  assert.deepEqual(parseSetCookie('com_moon_operator_session=; Path=/; Max-Age=0', HUB), { remove: true, name: 'com_moon_operator_session' });
  assert.equal(parseSetCookie('broken', HUB), null);
});

test('electronCookieBridge 는 세션 쿠키를 헤더로 묶고 되돌린다', async () => {
  const jar = [{ name: 'com_moon_operator_session', value: 's1' }, { name: 'theme', value: 'dark' }];
  const writes = [];
  const session = {
    cookies: {
      get: async ({ url }) => (url.startsWith(HUB) ? jar : []),
      set: async (details) => writes.push(['set', details.name, details.value]),
      remove: async (url, name) => writes.push(['remove', name]),
    },
  };
  const bridge = electronCookieBridge(session);
  assert.equal(await bridge.cookieHeader(`${HUB}/api/hub/tasks`), 'com_moon_operator_session=s1; theme=dark');
  await bridge.storeCookies(['com_moon_operator_session=s2; Path=/', 'old=; Max-Age=0'], `${HUB}/api/hub/tasks`);
  assert.deepEqual(writes, [['set', 'com_moon_operator_session', 's2'], ['remove', 'old']]);
});

// ── 실제 로컬 서버 ─────────────────────────────────────────────────────
function startServer(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res, body);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('실제 http: Origin·Cookie 헤더가 서버에 도착하고 Set-Cookie 가 세션으로 돌아간다', async () => {
  const { server, seen, origin } = await startServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('set-cookie', 'com_moon_operator_session=rotated; Path=/; HttpOnly');
    res.end(JSON.stringify(req.method === 'GET' ? { status: 'live', tasks: [] } : { status: 'saved', task: null }));
  });
  try {
    const stored = [];
    const client = createHubClient({
      origin,
      cookieHeader: async (url) => (url.startsWith(origin) ? 'com_moon_operator_session=from-main-window' : ''),
      storeCookies: async (headers, url) => stored.push({ headers, url }),
    });
    const read = await client.request('/api/hub/tasks');
    assert.equal(read.status, 'live');
    const write = await client.request('/api/hub/tasks', { method: 'POST', body: { id: 'x', title: '제목' } });
    assert.equal(write.status, 'saved');
    assert.equal(seen.length, 2);
    assert.equal(seen[0].headers.origin, undefined);
    assert.equal(seen[0].headers.cookie, 'com_moon_operator_session=from-main-window');
    assert.equal(seen[1].headers.origin, origin);
    assert.equal(seen[1].headers.cookie, 'com_moon_operator_session=from-main-window');
    assert.equal(seen[1].headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(seen[1].body), { id: 'x', title: '제목' });
    assert.equal(stored.length, 2);
    assert.deepEqual(stored[0].headers, ['com_moon_operator_session=rotated; Path=/; HttpOnly']);
  } finally {
    server.close();
  }
});

test('실제 http: 307 리다이렉트는 다른 서버로 요청을 옮기지 않는다', async () => {
  const destination = await startServer((req, res) => { res.end('{}'); });
  const source = await startServer((req, res) => {
    res.statusCode = 307;
    res.setHeader('location', `${destination.origin}/receive`);
    res.end();
  });
  try {
    const client = createHubClient({ origin: source.origin, cookieHeader: async () => 'com_moon_operator_session=secret' });
    await rejects(client.request('/api/operator/session', { method: 'POST', body: { action: 'logout' } }), 'error', 'redirect-rejected');
    assert.equal(source.seen.length, 1);
    assert.equal(destination.seen.length, 0);
    await rejects(client.request('/api/hub/office/chat', { method: 'POST', body: {} }), 'error', 'redirect-rejected');
    assert.equal(source.seen.length, 2);
    assert.equal(destination.seen.length, 0);
  } finally {
    source.server.close();
    destination.server.close();
  }
});

test('실제 http: 응답이 없으면 예산 안에서 timeout (재시도 없음)', { timeout: 5000 }, async (t) => {
  let received;
  const arrival = new Promise(resolve => { received = resolve; });
  const hanging = await startServer(() => { received(); /* 응답하지 않는다 */ });
  t.after(() => {
    hanging.server.closeAllConnections();
    hanging.server.close();
  });
  try {
    const timers = new Set();
    const client = createHubClient({ origin: hanging.origin,
      setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; },
      clearTimeout: timer => timers.delete(timer),
    });
    const pending = rejects(client.request('/api/hub/tasks', { method: 'POST', body: {} }), 'error', 'timeout');
    // Exercise an unanswered request rather than a cold socket failing a 20ms
    // accelerated deadline before it can reach the local server under load.
    await arrival;
    const deadline = [...timers].find(timer => timer.ms === timeoutsFor('/api/hub/tasks', 'POST').request);
    assert.ok(deadline);
    deadline.fn();
    await pending;
    assert.equal(hanging.seen.length, 1);
    assert.equal(timers.size, 0);
  } finally {
    hanging.server.closeAllConnections();
    hanging.server.close();
  }
});

test('실제 http: 서버가 없으면 offline', async () => {
  const { server, origin } = await startServer((req, res) => res.end('{}'));
  await new Promise((resolve) => server.close(resolve));
  const client = createHubClient({ origin });
  await rejects(client.request('/api/hub/tasks'), 'error', 'offline');
});
