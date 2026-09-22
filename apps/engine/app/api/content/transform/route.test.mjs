import assert from 'node:assert/strict';
import { test } from 'node:test';
let route;
try { route = await import('./route.ts'); } catch {}
const workspaceId = '11111111-1111-1111-1111-111111111111';
const contentId = '22222222-2222-2222-2222-222222222222';
const variantId = '33333333-3333-3333-3333-333333333333';
const requestId = '55555555-5555-5555-5555-555555555555';
const updatedAt = '2026-09-12T04:30:00.123456Z';
const body = { requestId, contentId, variantId, expectedVariantUpdatedAt: updatedAt, operation: 'polish', tone: 'brand', selection: { start: 0, end: 2 }, target: { variantType: 'x_thread', channel: 'threads' } };
const candidate = { id: 'candidate-1', title: '수정', body: '다듬은 문장', variantType: 'x_thread', channel: 'threads', summary: '표현 정리', missing: [] };
async function withEnv(run) {
  const snapshot = { ...process.env };
  const fetch = globalThis.fetch;
  Object.assign(process.env, { COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_SHARED_WEBHOOK_SECRET: 'transform-secret', GEMINI_API_KEY: 'provider-secret', GEMINI_MODEL: 'test-gemini', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'db-secret' });
  try { await run(); } finally { process.env = snapshot; globalThis.fetch = fetch; }
}
const request = (value = body, headers = {}) => new Request('https://engine.test/api/content/transform', { method: 'POST', headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': 'transform-secret', ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value) });

test('authenticates before all data access and refuses legacy open webhook mode', async () => {
  assert.ok(route, 'Engine transform route must exist');
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    assert.equal((await route.POST(request(body, { 'x-com-moon-shared-secret': 'wrong' }))).status, 401);
    delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = 'true';
    assert.equal((await route.POST(request())).status, 401);
  });
});

test('enforces actual and declared byte limits and rejects malformed JSON before provider use', async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    for (const value of ['[]', 'null', '{broken']) assert.equal((await route.POST(request(value))).status, 400);
    assert.equal((await route.POST(request({ ...body, text: '한'.repeat(90000) }))).status, 413);
    assert.equal((await route.POST(request(body, { 'content-length': String(256 * 1024 + 1) }))).status, 413);
  });
});

test('wires exact scoped REST reads, a durable claim and one Gemini call, then replays the saved result', async () => {
  assert.ok(route);
  await withEnv(async () => {
    const calls = [];
    let run;
    globalThis.fetch = async (value, init) => {
      const url = new URL(value);
      calls.push({ url, init });
      const table = url.pathname.split('/').at(-1);
      if (url.hostname.includes('googleapis')) return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ candidates: [candidate] }) }] } }], usageMetadata: { totalTokenCount: 80 } }));
      if (init.method === 'POST') {
        run = JSON.parse(init.body);
        return new Response(JSON.stringify([run]), { status: 201 });
      }
      if (init.method === 'PATCH') {
        Object.assign(run, JSON.parse(init.body));
        return new Response(JSON.stringify([run]));
      }
      const rows = table === 'content_items' ? [{ id: contentId, workspace_id: workspaceId, title: '기획', source_idea: '원문', updated_at: updatedAt, meta: {} }]
        : table === 'content_variants' ? [{ id: variantId, content_id: contentId, workspace_id: workspaceId, body: '초안', title: '초안', variant_type: 'x_thread', channel: 'threads', updated_at: updatedAt }]
          : run ? [run] : [];
      return new Response(JSON.stringify(rows));
    };
    const result = await route.POST(request({ ...body, workspaceId: 'foreign', body: 'untrusted' }));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.status, 'generated');
    assert.equal(data.run.source_snapshot.body, '초안');
    assert.deepEqual(data.run.usage, { totalTokenCount: 80 });
    assert.equal(run.workspace_id, workspaceId);
    assert.ok(calls.filter(({ init }) => !init.method).every(({ url }) => url.searchParams.get('workspace_id') === `eq.${workspaceId}`));
    const duplicate = await route.POST(request(body));
    assert.equal((await duplicate.json()).status, 'duplicate');
    assert.equal(calls.filter(({ url }) => url.hostname.includes('googleapis')).length, 1);
    assert.doesNotMatch(JSON.stringify(data), /provider-secret|db-secret|transform-secret/);
  });
});

test('reports missing configuration as preview instead of mock generated content', async () => {
  assert.ok(route);
  await withEnv(async () => {
    delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    assert.equal((await route.POST(request())).status, 202);
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspaceId;
    delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    globalThis.fetch = async () => new Response('[]');
    const response = await route.POST(request());
    assert.equal(response.status, 202);
    assert.equal((await response.json()).error, 'gemini-not-configured');
  });
});
