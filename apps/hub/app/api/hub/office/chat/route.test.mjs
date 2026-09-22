import assert from 'node:assert/strict';
import { test } from 'node:test';

let route;
try {
  route = await import('./route.js');
} catch (e) {
  // if not resolved, will fail in test
}

async function withEnv(run) {
  const snapshot = { ...process.env };
  const fetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    COM_MOON_DEFAULT_WORKSPACE_ID: 'test-workspace',
    COM_MOON_HUB_WRITE_SECRET: 'hub-secret',
    COM_MOON_SHARED_WEBHOOK_SECRET: 'engine-secret',
    COM_MOON_ENGINE_URL: 'https://engine.test',
  });
  try {
    await run();
  } finally {
    process.env = snapshot;
    globalThis.fetch = fetch;
  }
}

const request = (body, authenticated = true) =>
  new Request('https://hub.test/api/hub/office/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-com-moon-hub-write-secret': 'hub-secret' } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('hub office-chat route guards write and validates input', async () => {
  assert.ok(route, 'Hub office-chat route must exist');
  await withEnv(async () => {
    // Unauthenticated
    const resAuth = await route.POST(request({ agentId: 'eevee', message: '안녕' }, false));
    assert.equal(resAuth.status, 401);

    // Malformed JSON
    const resBad = await route.POST(request('{bad-json'));
    assert.equal(resBad.status, 400);

    // Unknown agent ID
    const resUnknown = await route.POST(request({ agentId: 'not-an-agent', message: '안녕' }));
    assert.equal(resUnknown.status, 400);
    const data = await resUnknown.json();
    assert.equal(data.code, 'unknown-agent');
  });
});

test('hub office-chat route forwards sanitized request to Engine and returns result', async () => {
  assert.ok(route);
  await withEnv(async () => {
    let forwardedUrl = null;
    let forwardedBody = null;
    let forwardedHeaders = null;

    globalThis.fetch = async (url, init) => {
      forwardedUrl = String(url);
      forwardedBody = JSON.parse(init.body);
      forwardedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          status: 'generated',
          text: '정리했어. 지금 가장 중요한 일부터 보자.',
          agentId: 'eevee',
          mode: 'chat',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const res = await route.POST(
      request({
        agentId: 'eevee',
        mode: 'chat',
        message: '할 일 정리해줘',
      })
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'generated');
    assert.equal(body.agentId, 'eevee');
    assert.ok(body.text.includes('정리했어'));

    // Verify engine forward
    assert.equal(forwardedUrl, 'https://engine.test/api/ai/office-chat');
    assert.equal(forwardedBody.agentId, 'eevee');
    assert.equal(forwardedBody.mode, 'chat');
    assert.equal(forwardedHeaders['x-com-moon-shared-secret'], 'engine-secret');
  });
});
