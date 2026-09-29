import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const state = globalThis.__brandCardRouteTest = {};
const stubs = {
  '@/lib/hub-write-guard': `export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(request) { return { data: await request.json() }; }`,
  '@/lib/sales-os/brand-context': `export async function assembleBrandContext(args) {
    globalThis.__brandCardRouteTest.contextArgs = args;
    return { source: 'supabase', scope: 'unscoped' };
  }`,
  '@/lib/sales-os/agent-runs': `export async function recordAgentRun() { return { persisted: true, id: 'run-1' }; }
    export async function setAgentRunEmittedCount() { return { persisted: true }; }`,
  '@/lib/sales-os/work-orders': `export async function createWorkOrder() { throw new Error('unexpected order'); }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import('../app/api/hub/brand-mentor/route.js');

test('brand card question passes selected card to the context boundary', async (t) => {
  const originalEngineUrl = process.env.COM_MOON_ENGINE_URL;
  const originalFetch = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = 'http://engine.test';
  globalThis.fetch = async () => Response.json({ status: 'generated', text: 'advice' });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEngineUrl === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = originalEngineUrl;
  });

  const response = await POST(new Request('http://hub.test/api/hub/brand-mentor', {
    method: 'POST',
    body: JSON.stringify({ mode: 'open-question', guidanceId: 'marketing-research', draft: '독자의 표현은?' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(state.contextArgs.mode, 'open-question');
  assert.equal(state.contextArgs.ref, null);
  assert.equal(state.contextArgs.guidanceId, 'marketing-research');
});
