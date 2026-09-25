import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = globalThis.__advisorRouteTest = {};
const stubs = {
  "@/lib/hub-write-guard": `export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(req) { return { data: await req.json() }; }`,
  "@/lib/sales-os/brand-context": `export async function assembleBrandContext() { globalThis.__advisorRouteTest.contextRead = true; return globalThis.__advisorRouteTest.contextResult || { source: 'supabase' }; }`,
  "@/lib/sales-os/context-assembler": `export async function assembleSalesContext() { globalThis.__advisorRouteTest.contextRead = true; return globalThis.__advisorRouteTest.salesContextResult || { source: 'supabase' }; }`,
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
test('ordinary Council advice does not create a work order by default', async () => {
  const data = await (await POST(request({}))).json();
  assert.equal(data.status, 'generated');
  assert.equal(data.runId, 'run-1');
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
  const data = await (await POST(request({ createWorkOrder: true }))).json();
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
test('Guru forwards only an allowlisted reader-selected guidance card', async () => {
  const response = await guruPOST(request({ mode: 'deal-review', guidanceId: 'sales-meddic' }));
  assert.equal(response.status, 200);
  assert.equal(state.lastFetch.body.guidanceId, 'sales-meddic');
  state.contextRead = false;
  const invalid = await guruPOST(request({ mode: 'deal-review', guidanceId: 'invented-card' }));
  assert.equal(invalid.status, 400);
  assert.equal(state.contextRead, false);
});
test('Guru rejects a marketing card before reading the sales ledger or calling Engine', async () => {
  const response = await guruPOST(request({ mode: 'open-question', draft: '이 고객을 어떻게 이해할까요?', guidanceId: 'marketing-smallest-market' }));
  assert.equal(response.status, 400);
  assert.equal(state.contextRead, undefined);
  assert.equal(state.lastFetch, undefined);
  assert.equal(state.run, undefined);
});
test('an open Guru question returns the ledger preview or error without Engine or run writes', async () => {
  for (const [source, status] of [['preview', 202], ['error', 502]]) {
    state.salesContextResult = { source, error: 'revenue-ledger-unavailable' };
    const response = await guruPOST(request({ mode: 'open-question', draft: '고객에게 무엇을 확인할까요?', guidanceId: 'sales-meddic' }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).status, source);
    assert.equal(state.lastFetch, undefined);
    assert.equal(state.run, undefined);
  }
});
test('personal Brand open-question accepts only a marketing or content card and an explicit question', async () => {
  for (const guidanceId of ['sales-meddic', 'legend-buffett', 'invented-card', undefined]) {
    const response = await POST(request({ mode: 'open-question', draft: '독자에게 어떤 질문을 할까요?', guidanceId }));
    assert.equal(response.status, 400, String(guidanceId));
    assert.equal(state.contextRead, undefined);
    assert.equal(state.lastFetch, undefined);
    assert.equal(state.run, undefined);
  }
  assert.equal((await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '  ' }))).status, 400);
  assert.equal(state.contextRead, undefined);

  const response = await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '어떤 고객 언어를 확인할까요?' }));
  assert.equal(response.status, 200);
  assert.equal(state.lastFetch.body.guidanceId, 'marketing-research');
  assert.equal(state.lastFetch.body.mode, 'open-question');
  assert.equal(state.lastFetch.body.draft, '어떤 고객 언어를 확인할까요?');
  assert.equal(state.run.agent, 'guru.brand');
  assert.equal(state.order, undefined);
});
test('personal Brand open-question never enters the approval queue even if explicitly requested', async () => {
  const response = await POST(request({ mode: 'open-question', guidanceId: 'content-storybrand', draft: '도입부를 어떻게 볼까요?', createWorkOrder: true }));
  assert.equal(response.status, 400);
  assert.equal(state.contextRead, undefined);
  assert.equal(state.lastFetch, undefined);
  assert.equal(state.run, undefined);
  assert.equal(state.order, undefined);
});
test('personal Office review forwards its provenance without a synthetic card or work order', async () => {
  const officeSource = { requestId: '10000000-0000-4000-8000-000000000001', runId: null };
  const response = await POST(request({
    mode: 'office-review', scope: 'personal', draft: 'Office 종합의 근거를 다른 관점으로 검토해 주세요.', officeSource, createWorkOrder: false,
  }));
  assert.equal(response.status, 200);
  assert.equal(state.lastFetch.body.mode, 'office-review');
  assert.equal(state.lastFetch.body.scope, 'personal');
  assert.deepEqual(state.lastFetch.body.officeSource, officeSource);
  assert.equal(state.lastFetch.body.guidanceId, undefined);
  assert.equal(state.lastFetch.body.createWorkOrder, false);
  assert.equal(state.order, undefined);
  assert.equal(state.run.mode, 'office-review');
  assert.match(state.run.inputSummary, /office-request=10000000-0000-4000-8000-000000000001/);
});
test('personal Office review rejects ambiguous lanes, malformed provenance and work requests before reading context', async () => {
  const officeSource = { requestId: '10000000-0000-4000-8000-000000000001', runId: null };
  const valid = { mode: 'office-review', scope: 'personal', draft: 'Office 종합 검토', officeSource, createWorkOrder: false };
  for (const patch of [
    { scope: 'all' }, { scope: 'classin' }, { scope: undefined },
    { officeSource: undefined }, { officeSource: { requestId: 'bad', runId: null } },
    { officeSource: { requestId: officeSource.requestId, runId: 'bad' } },
    { draft: ' ' }, { draft: '가'.repeat(6001) },
    { guidanceId: 'marketing-research' }, { createWorkOrder: true }, { createWorkOrder: undefined },
  ]) {
    const response = await POST(request({ ...valid, ...patch }));
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal((await response.json()).error, 'invalid-office-review');
    assert.equal(state.contextRead, undefined);
    assert.equal(state.lastFetch, undefined);
    assert.equal(state.run, undefined);
    assert.equal(state.order, undefined);
  }
});
test('personal Office review discloses a missing brand ledger without invoking Engine', async () => {
  state.contextResult = { source: 'error', error: 'brand-ledger-unavailable' };
  const response = await POST(request({
    mode: 'office-review', scope: 'personal', draft: 'Office 종합 검토',
    officeSource: { requestId: '10000000-0000-4000-8000-000000000001', runId: null }, createWorkOrder: false,
  }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 'error');
  assert.equal(state.lastFetch, undefined);
  assert.equal(state.run, undefined);
});
test('personal Brand question shows preview or read error without calling Engine', async () => {
  for (const [source, expectedStatus] of [['preview', 'preview'], ['error', 'error']]) {
    state.contextResult = { source, error: 'brand-ledger-unavailable' };
    const response = await POST(request({ mode: 'open-question', guidanceId: 'content-hook', draft: '무엇을 확인할까요?' }));
    assert.equal((await response.json()).status, expectedStatus);
    assert.equal(state.lastFetch, undefined);
    assert.equal(state.run, undefined);
  }
});
test('a brand question with a ref requires that exact personal brand before Engine generation', async () => {
  state.contextResult = { source: 'supabase', brand: null, focus: { found: false } };
  const missing = await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '무엇이 중요한가요?', ref: 'personal-a' }));
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).status, 'error');
  assert.equal(state.lastFetch, undefined);
  assert.equal(state.run, undefined);

  state.contextResult = { source: 'supabase', brand: { key: 'personal-b' }, focus: { found: true, kind: 'brand' } };
  const wrong = await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '무엇이 중요한가요?', ref: 'personal-a' }));
  assert.equal(wrong.status, 409);
  assert.equal((await wrong.json()).status, 'error');
  assert.equal(state.lastFetch, undefined);

  state.contextResult = { source: 'supabase', brand: { key: 'personal-a' }, focus: { found: true, kind: 'brand' } };
  const matched = await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '무엇이 중요한가요?', ref: 'personal-a' }));
  assert.equal((await matched.json()).status, 'generated');
  assert.equal(state.lastFetch.body.ref, 'personal-a');
});
test('run history validates bounds and keeps failed reads distinct from empty history', async () => {
  assert.equal((await GET(new Request('http://hub.test?limit=999'))).status, 400);
  assert.equal(state.query, undefined);
  state.history = { source: 'error', error: 'agent-runs-read-failed', runs: [] };
  const data = await (await GET(new Request('http://hub.test?agent=council&ref=brand-1&limit=5'))).json();
  assert.equal(data.status, 'error');
  assert.deepEqual(state.query, { agent: 'council', ref: 'brand-1', limit: 5 });
  const guruBrand = await GET(new Request('http://hub.test?agent=guru.brand&ref=personal-a&limit=5'));
  assert.equal(guruBrand.status, 200);
  assert.deepEqual(state.query, { agent: 'guru.brand', ref: 'personal-a', limit: 5 });
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

for (const [name, handler] of [['Council', POST], ['Guru', guruPOST]]) {
  test(`${name} rejects malformed advisor settings before context reads, model calls or ledger writes`, async () => {
    const invalid = [null, [], 'settings',
      { directives: [] }, { directives: 'settings' }, { directives: { values: [] } }, { directives: { knowledge: 3 } },
      { values: { coreValues: 'one value' } }, { directives: { values: { coreValues: 'one value' } } },
      { values: { acceptableCosts: [1] } }, { values: { pivotConditions: [{}] } }, { values: { tradeOffRules: 'a rule' } },
      { legendIds: 'jobs' }, { legendIds: ['jobs', 'unknown'] }, { legendIds: ['jobs', 'jobs'] }, { legendIds: ['constructor'] },
      { directives: { values: { legendIds: [null] } } },
      { knowledge: { domain: 'unsupported' } }, { knowledge: { facts: 'one fact' } },
      { knowledge: { playbooks: {} } }, { knowledge: { rules: [false] } }, { knowledge: { forbidden: 10 } },
      { knowledge: { retrievedSnippets: 'text' } }, { knowledge: { retrievedSnippets: [null] } },
      { knowledge: { retrievedSnippets: [{ title: 'snippet', snippet: null }] } },
      { directives: { knowledge: { retrievedSnippets: [{ title: [], snippet: 'text' }] } } },
      { knowledge: { retrievedSnippets: [{ title: 'snippet', snippet: 'text', source: {} }] } },
    ];
    for (const body of invalid) {
      const response = await handler(request(body));
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(await response.json(), { status: 'error', error: '자문 설정의 형식을 확인해 주세요.' });
      assert.equal(state.contextRead, undefined);
      assert.equal(state.lastFetch, undefined);
      assert.equal(state.run, undefined);
      assert.equal(state.order, undefined);
    }
  });

  test(`${name} preserves valid nested and top-level settings without silently truncating caller data`, async () => {
    const values = { coreValues: ['확인된 사실'], acceptableCosts: [], pivotConditions: ['새 자료 확인'], tradeOffRules: ['사실 우선'], legendIds: ['jobs', 'bezos', 'chouinard'], operatorEnergy: 4 };
    const knowledge = { domain: 'general', facts: ['전달된 내용'], playbooks: [], rules: ['원문 보존'], forbidden: ['근거 없는 보장'], retrievedSnippets: [{ id: 'note-1', title: '자료', snippet: '원문 전체', source: 'provided' }], minContracts: 10 };
    for (const settings of [{ directives: { values, knowledge } }, { values, knowledge }, { directives: null, values: null, knowledge: null, legendIds: null }]) {
      const response = await handler(request(settings));
      assert.equal(response.status, 200);
      for (const [key, value] of Object.entries(settings)) assert.deepEqual(state.lastFetch.body[key], value === null ? undefined : value);
    }
  });
}
