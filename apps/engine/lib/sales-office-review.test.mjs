import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = (globalThis.__salesOfficeReviewTest = {});
const stubs = {
  'gemini.ts': `
    export function getGeminiIntegrationStatus() { return { configured: true }; }
    export async function generateGeminiText(input) {
      globalThis.__salesOfficeReviewTest.generation = input;
      return globalThis.__salesOfficeReviewTest.providerResult || { ok: true, model: 'test', text: '회사 관점의 검토' };
    }
  `,
  'integration-state.ts': `
    export function resolveDefaultWorkspaceId() { return '11111111-1111-4111-8111-111111111111'; }
    export async function upsertIntegrationConnection() { return { connection: null }; }
    export async function insertIntegrationSyncRun(input) {
      globalThis.__salesOfficeReviewTest.syncRun = input;
      return {};
    }
  `,
  'shared-webhook.ts': `export function validateSharedWebhookRequest() { return { ok: true }; }`,
  'supabase-rest.ts': `
    export async function insertSupabaseRecord(table, row) {
      globalThis.__salesOfficeReviewTest.writes.push({ table, row });
      return { persisted: true };
    }
  `,
};
registerHooks({ resolve(specifier, context, next) {
  const name = specifier.split('/').at(-1);
  if (specifier.includes('/lib/') && stubs[name]) {
    return { url: 'data:text/javascript,' + encodeURIComponent(stubs[name]), shortCircuit: true };
  }
  return next(specifier, context);
} });

const { POST } = await import('../app/api/ai/sales-mentor/route.ts');
const request = (body) => new Request('https://engine.test/api/ai/sales-mentor', { method: 'POST', body: JSON.stringify(body) });
const requestId = '10000000-0000-4000-8000-000000000001';
const runId = '20000000-0000-4000-8000-000000000002';
const valid = {
  mode: 'open-question', scope: 'classin', createWorkOrder: false,
  officeSource: { requestId, runId },
  draft: 'Office 결과 원문: 견적 답장은 이번 주 안에 보낸다. 근거: 통화 기록. 이견: 가격 부담. 이번 질문: 다른 관점으로 검토해 주세요.',
  context: { source: 'supabase', deals: [], leads: [], outcomes: { recent: [] }, memory: { recent_runs: [] }, missing: [] },
};

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  state.writes = [];
});

test('a company Office escalation records its Office source with the run and echoes it', async () => {
  const response = await POST(request(valid));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'generated');
  assert.equal(body.mode, 'open-question');
  assert.deepEqual(body.officeSource, valid.officeSource);
  assert.deepEqual(state.syncRun.payload.officeSource, valid.officeSource);
  assert.equal(state.syncRun.status, 'success');
  assert.match(state.generation.prompt, /Office 결과 원문: 견적 답장은/);
  assert.match(state.generation.prompt, /context\.memory\.recent_runs는 이전 생성 조언이며 현재 고객 사실 근거가 아닙니다/);
  assert.doesNotMatch(state.generation.prompt, /MEDDIC|Keenan/);
  assert.deepEqual(state.writes, []);
});

test('the company lane accepts the verbatim Office source up to 25,000 characters', async () => {
  const draft = `Office 결과 원문: ${'나'.repeat(24980)}`.slice(0, 25000);
  const response = await POST(request({ ...valid, draft }));
  assert.equal(response.status, 200);
  assert.ok(state.generation.prompt.includes(draft));
  assert.equal((await POST(request({ ...valid, officeSource: { requestId, runId: null } }))).status, 200);
});

test('a malformed company Office escalation is refused before the model or telemetry', async () => {
  for (const patch of [
    { scope: 'all' }, { scope: 'personal' }, { scope: undefined },
    { mode: 'deal-review' }, { mode: 'followup-draft' },
    { officeSource: null }, { officeSource: { requestId: 'bad', runId } }, { officeSource: { requestId, runId: 'bad' } },
    { officeSource: { requestId, runId, extra: true } },
    { draft: ' ' }, { draft: '가'.repeat(25001) },
    { createWorkOrder: true }, { createWorkOrder: undefined },
    { guidanceId: 'sales-meddic' }, { legendIds: ['jobs'] }, { directives: { values: {} } },
    { context: { ...valid.context, scope: 'personal' } },
  ]) {
    const response = await POST(request({ ...valid, ...patch }));
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal((await response.json()).error, 'invalid-office-review');
    assert.equal(state.generation, undefined);
    assert.equal(state.syncRun, undefined);
    assert.deepEqual(state.writes, []);
  }
});

test('an unavailable sales ledger or an empty answer is not reported as generated Office advice', async () => {
  for (const [source, httpStatus] of [['preview', 202], ['error', 502]]) {
    const response = await POST(request({ ...valid, context: { source, missing: [] } }));
    assert.equal(response.status, httpStatus);
    const body = await response.json();
    assert.equal(body.status, source);
    assert.deepEqual(body.officeSource, valid.officeSource);
    assert.equal(state.generation, undefined);
  }
  state.providerResult = { ok: true, model: 'test', text: '  ' };
  const empty = await POST(request(valid));
  assert.equal(empty.status, 502);
  assert.equal((await empty.json()).status, 'error');
  assert.equal(state.syncRun.status, 'failure');
  assert.equal(state.syncRun.errorMessage, 'empty-office-review');
});

test('callers without an Office source keep the same sales envelope and telemetry', async () => {
  const response = await POST(request({ mode: 'open-question', draft: '고객에게 무엇을 확인할까요?', guidanceId: 'sales-meddic', context: valid.context }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'generated');
  assert.equal(Object.hasOwn(body, 'officeSource'), false);
  assert.equal(Object.hasOwn(state.syncRun.payload, 'officeSource'), false);

  state.providerResult = { ok: true, model: 'test', text: '' };
  const blank = await POST(request({ mode: 'deal-review', context: valid.context }));
  assert.equal(blank.status, 200, 'an empty non-Office answer keeps its old envelope');
  state.providerResult = { ok: false, model: 'test', text: '', reason: 'provider-unavailable' };
  const failed = await POST(request({ mode: 'deal-review', context: valid.context }));
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).reason, 'provider-unavailable');
});
