import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = globalThis.__advisorRouteTest = {};
const stubs = {
  "@/lib/hub-write-guard": `export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(req) { return { data: await req.json() }; }`,
  "@/lib/sales-os/brand-context": `export async function assembleBrandContext() { return { source: 'supabase' }; }`,
  "@/lib/sales-os/context-assembler": `export async function assembleSalesContext() { return { source: 'supabase' }; }`,
  "@/lib/sales-os/agent-runs": `
    export async function recordAgentRun(input) { globalThis.__advisorRouteTest.run = input; return { persisted: true, id: 'run-1' }; }
    export async function setAgentRunEmittedCount(input) { globalThis.__advisorRouteTest.emission = input; return { persisted: true }; }
    export async function getRecentAgentRuns(input) { globalThis.__advisorRouteTest.query = input; return globalThis.__advisorRouteTest.history; }`,
  "@/lib/sales-os/work-orders": `export async function createWorkOrder(input) {
    globalThis.__advisorRouteTest.order = input;
    if (globalThis.__advisorRouteTest.orderFails) throw new Error('private failure');
    return { persisted: true, id: 'order-1' };
  }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  if (stubs[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import('../app/api/hub/brand-mentor/route.js');
const { GET } = await import('../app/api/hub/agent-runs/route.js');
const { POST: guruPOST } = await import('../app/api/hub/sales-mentor/route.js');

beforeEach((t) => {
  for (const key of Object.keys(state)) delete state[key];
  state.history = { source: 'supabase', runs: [{ id: 'run-1' }] };
  const old = process.env.COM_MOON_ENGINE_URL;
  const fetchBefore = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = 'http://engine.test';
  globalThis.fetch = async (url, options) => {
    state.lastFetch = { url, options, body: options?.body ? JSON.parse(options.body) : null };
    return Response.json({ status: 'generated', text: 'advice' });
  };
  t.after(() => {
    globalThis.fetch = fetchBefore;
    if (old === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = old;
  });
});
const request = (body) => new Request('http://hub.test/api/hub/brand-mentor', { method: 'POST', body: JSON.stringify(body) });

test('advice-only records a run without creating an approval backlog', async () => {
  const res = await POST(request({ createWorkOrder: false }));
  const data = await res.json();
  assert.equal(data.runId, 'run-1');
  assert.equal(state.run.result, 'ok');
  assert.equal(state.order, undefined);
  assert.equal(data.workOrder.reason, 'not-requested');
});
test('sparring mode successfully invokes brand-mentor and records run', async () => {
  const res = await POST(request({ mode: 'sparring', draft: '신규 오퍼 검토', createWorkOrder: false }));
  const data = await res.json();
  assert.equal(data.runId, 'run-1');
  assert.equal(state.run.mode, 'sparring');
  assert.equal(state.run.result, 'ok');
});
test('explicit proposal links the exact run and records its emitted count', async () => {
  const data = await (await POST(request({ createWorkOrder: true }))).json();
  assert.equal(state.order.runId, data.runId);
  assert.equal(state.order.gate, 'human_approval');
  assert.deepEqual(state.emission, { runId: 'run-1', count: 1 });
  assert.equal(data.memory.emissionRecorded, true);
});
test('proposal persistence failure preserves advice and discloses the unsaved order', async () => {
  state.orderFails = true;
  const data = await (await POST(request({}))).json();
  assert.equal(data.text, 'advice');
  assert.equal(data.workOrder.persisted, false);
  assert.equal(state.emission, undefined);
});
test('missing Engine is needs_human, not successful generation', async () => {
  delete process.env.COM_MOON_ENGINE_URL;
  const data = await (await POST(request({}))).json();
  assert.equal(data.status, 'preview');
  assert.equal(state.run.result, 'needs_human');
  assert.equal(state.order, undefined);
});
test('failed HTTP generation cannot create a Council proposal', async () => {
  globalThis.fetch = async () => Response.json({ status: 'generated', text: 'partial output' }, { status: 500 });
  const response = await POST(request({ createWorkOrder: true }));
  const data = await response.json();
  assert.equal(response.status, 500);
  assert.equal(state.run.result, 'error');
  assert.equal(data.workOrder.reason, 'not-generated');
  assert.equal(state.order, undefined);
});
test('Guru preview and transport errors never become successful run records', async () => {
  delete process.env.COM_MOON_ENGINE_URL;
  assert.equal((await guruPOST(request({}))).status, 202);
  assert.equal(state.run.agent, 'guru');
  assert.equal(state.run.result, 'needs_human');
  process.env.COM_MOON_ENGINE_URL = 'http://engine.test';
  globalThis.fetch = async () => { throw new Error('private connection detail'); };
  const response = await guruPOST(request({}));
  assert.equal(response.status, 502);
  assert.equal(state.run.result, 'error');
  assert.equal((await response.text()).includes('private connection detail'), false);
});
test('run history validates bounds and keeps failed reads distinct from empty history', async () => {
  assert.equal((await GET(new Request('http://hub.test?limit=999'))).status, 400);
  assert.equal(state.query, undefined);
  state.history = { source: 'error', error: 'agent-runs-read-failed', runs: [] };
  const data = await (await GET(new Request('http://hub.test?agent=council&ref=brand-1&limit=5'))).json();
  assert.equal(data.status, 'error');
  assert.deepEqual(state.query, { agent: 'council', ref: 'brand-1', limit: 5 });
});
test('brand-mentor forwards legendIds and directives to Engine and retains structured council', async () => {
  globalThis.fetch = async (url, options) => {
    state.lastFetch = { url, options, body: options?.body ? JSON.parse(options.body) : null };
    return Response.json({
      status: 'generated',
      text: 'advice',
      council: {
        lenses: [{ lens: 'Jobs', verdict: '본질 집중', cost: '부차적 기능 포기' }],
        dissent: '단기 매출 하락 리스크 존재',
        conditionalVerdict: '고객 인터뷰 10명 통과 시 추진',
        nextAction: '핵심 기능 1개 정의 및 프로토타입 배포',
      },
    });
  };

  const res = await POST(request({
    legendIds: ['jobs', 'bezos', 'chouinard'],
    directives: { values: { operatorEnergy: 4 } },
    createWorkOrder: true,
  }));
  const data = await res.json();
  assert.equal(data.status, 'generated');
  assert.deepEqual(state.lastFetch.body.legendIds, ['jobs', 'bezos', 'chouinard']);
  assert.deepEqual(state.lastFetch.body.directives, { values: { operatorEnergy: 4 } });
  assert.ok(data.council);
  assert.equal(data.council.dissent, '단기 매출 하락 리스크 존재');
  assert.equal(state.order.body.council.conditionalVerdict, '고객 인터뷰 10명 통과 시 추진');
  assert.ok(state.run.inputSummary.includes('legends=jobs,bezos,chouinard'));
});
test('sales-mentor forwards directives to Engine', async () => {
  const req = new Request('http://hub.test/api/hub/sales-mentor', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'deal-review',
      directives: { knowledge: { minContracts: 10 } },
    }),
  });
  const res = await guruPOST(req);
  assert.equal(res.status, 200);
  assert.deepEqual(state.lastFetch.body.directives, { knowledge: { minContracts: 10 } });
});
