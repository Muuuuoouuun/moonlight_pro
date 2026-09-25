import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const state = globalThis.__guruCardFollowupRouteTest = {};
const stubs = {
  '@/lib/hub-write-guard': `export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(request) { return { data: await request.json() }; }`,
  '@/lib/sales-os/context-assembler': `export async function assembleSalesContext(args) {
    globalThis.__guruCardFollowupRouteTest.contextArgs = args;
    return args.guidanceId || args.ref
      ? { source: 'supabase', scope: args.ref ? 'linked' : 'unscoped' }
      : { source: 'supabase', deals: [{ id: 'other-deal' }] };
  }`,
  '@/lib/sales-os/agent-runs': `export async function recordAgentRun() { return { persisted: true, id: 'run-1' }; }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import('../app/api/hub/sales-mentor/route.js');

test('only a prior-card follow-up uses sparse card context without marking the card newly selected', async (t) => {
  const originalEngineUrl = process.env.COM_MOON_ENGINE_URL;
  const originalFetch = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = 'http://engine.test';
  globalThis.fetch = async (_url, options) => {
    state.engineBody = JSON.parse(options.body);
    return Response.json({ status: 'generated', text: 'advice' });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEngineUrl === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = originalEngineUrl;
  });
  const history = [{ question: '무엇을 물을까요?', answer: '현재 방식을 물어보세요.', guidanceId: 'sales-gap' }];
  const request = (draft, ref = null) => new Request('http://hub.test/api/hub/sales-mentor', {
    method: 'POST', body: JSON.stringify({ mode: 'open-question', draft, history, ref }),
  });

  assert.equal((await POST(request('방금 질문을 더 짧게 바꿔주세요.'))).status, 200);
  assert.equal(state.contextArgs.guidanceId, 'sales-gap');
  assert.equal(state.engineBody.context.scope, 'unscoped');
  assert.equal(Object.hasOwn(state.engineBody, 'guidanceId'), false);

  assert.equal((await POST(request('방금 질문을 더 짧게 바꿔주세요.', 'lead-classin'))).status, 200);
  assert.equal(state.contextArgs.guidanceId, 'sales-gap');
  assert.equal(state.contextArgs.ref, 'lead-classin');
  assert.equal(state.engineBody.context.scope, 'linked');
  assert.equal(Object.hasOwn(state.engineBody, 'guidanceId'), false);

  assert.equal((await POST(request('별개로 이번 주 일정은?'))).status, 200);
  assert.equal(state.contextArgs.guidanceId, undefined);
  assert.deepEqual(state.engineBody.context.deals, [{ id: 'other-deal' }]);
  assert.equal(Object.hasOwn(state.engineBody, 'guidanceId'), false);

  assert.equal((await POST(request('별개로 이번 주 일정은?', 'lead-classin'))).status, 200);
  assert.equal(state.contextArgs.guidanceId, undefined);
  assert.equal(state.engineBody.context.scope, 'linked');
});
