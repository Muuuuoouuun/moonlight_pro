import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = (globalThis.__brandOfficeReviewTest = {});
const stubs = {
  'gemini.ts': `
    export function getGeminiIntegrationStatus() { return { configured: true }; }
    export async function generateGeminiText(input) {
      globalThis.__brandOfficeReviewTest.generation = input;
      return globalThis.__brandOfficeReviewTest.providerResult || { ok: true, model: 'test', text: '다른 관점의 검토' };
    }
  `,
  'integration-state.ts': `
    export function resolveDefaultWorkspaceId() { return '11111111-1111-4111-8111-111111111111'; }
    export async function upsertIntegrationConnection() { return { connection: null }; }
    export async function insertIntegrationSyncRun(input) {
      globalThis.__brandOfficeReviewTest.syncRun = input;
      return {};
    }
  `,
  'shared-webhook.ts': `export function validateSharedWebhookRequest() { return { ok: true }; }`,
  'supabase-rest.ts': `
    export async function insertSupabaseRecord(table, row) {
      globalThis.__brandOfficeReviewTest.writes.push({ table, row });
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

const { GET, POST } = await import('../app/api/ai/brand-mentor/route.ts');
const request = (body) => new Request('https://engine.test/api/ai/brand-mentor', { method: 'POST', body: JSON.stringify(body) });
const requestId = '10000000-0000-4000-8000-000000000001';
const runId = '20000000-0000-4000-8000-000000000002';
const valid = {
  mode: 'office-review', scope: 'personal', createWorkOrder: false,
  officeSource: { requestId, runId },
  draft: 'Office 종합: 이번 주에는 제품 약속을 좁힌다. 근거: 인터뷰 3건. 이견: 확장 요구. 다음 행동: 약속 문장 점검.',
  context: { scope: 'personal', source: 'supabase', brand: null, brands: [{ key: 'personal-a', name: '개인 브랜드' }], projects: [] },
};

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  state.writes = [];
});

test('office-review gives a source-labelled personal second opinion without inventing a Guru card or business write', async () => {
  const response = await POST(request(valid));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'generated');
  assert.equal(body.mode, 'office-review');
  assert.deepEqual(body.officeSource, valid.officeSource);
  assert.match(state.generation.prompt, /Office 종합: 이번 주에는/);
  assert.match(state.generation.prompt, new RegExp(requestId));
  assert.match(state.generation.prompt, new RegExp(runId));
  assert.match(state.generation.systemInstruction, /개인 브랜드/);
  assert.doesNotMatch(state.generation.prompt, /guidancePromptFrame|선택 카드|work_order로 올릴/);
  assert.doesNotMatch(state.generation.systemInstruction, /승인 큐 후보|work_order로 올릴/);
  assert.deepEqual(state.writes, []);
  assert.equal(state.syncRun.payload.officeSource.requestId, requestId);
  const info = await (await GET()).json();
  assert.ok(info.modes.includes('office-review'));
});

test('office-review accepts an absent logged run only when the originating request is identified', async () => {
  const response = await POST(request({ ...valid, officeSource: { requestId, runId: null } }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).officeSource, { requestId, runId: null });
  assert.match(state.generation.prompt, /runId: 없음/);
});

test('office-review rejects unknown lane, missing provenance, oversized text, invented guidance and work orders before provider calls', async () => {
  const invalid = [
    { scope: 'all' }, { scope: 'classin' }, { scope: undefined },
    { context: { scope: 'classin' } },
    { context: { ...valid.context, projects: [{ id: 'company-project', workspace: 'classin' }] } },
    { context: { ...valid.context, brands: [{ key: 'company', orgScope: 'classin' }] } },
    { officeSource: undefined }, { officeSource: { requestId: 'bad', runId } },
    { officeSource: { requestId, runId: 'bad' } },
    { draft: ' ' }, { draft: '가'.repeat(6001) },
    { guidanceId: 'marketing-research' }, { legendIds: ['jobs'] },
    { createWorkOrder: true }, { createWorkOrder: undefined },
  ];
  for (const patch of invalid) {
    const response = await POST(request({ ...valid, ...patch }));
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal((await response.json()).error, 'invalid-office-review');
    assert.equal(state.generation, undefined);
    assert.deepEqual(state.writes, []);
    assert.equal(state.syncRun, undefined);
  }
});

test('office-review reports unavailable brand context without asking the model', async () => {
  for (const [source, expectedStatus, expectedHttpStatus] of [['preview', 'preview', 202], ['error', 'error', 502]]) {
    const response = await POST(request({ ...valid, context: { scope: 'personal', source, error: 'brand-ledger-unavailable' } }));
    assert.equal(response.status, expectedHttpStatus);
    assert.equal((await response.json()).status, expectedStatus);
    assert.equal(state.generation, undefined);
    assert.deepEqual(state.writes, []);
  }
});

test('office-review does not report an empty model answer as generated advice', async () => {
  state.providerResult = { ok: true, status: 'generated', model: 'test', text: '  ' };
  const response = await POST(request(valid));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 'error');
  assert.deepEqual(state.writes, []);
  assert.equal(state.syncRun.status, 'failure');
});

test('office-review provider failure stays an error and writes no project update', async () => {
  state.providerResult = { ok: false, status: 'error', reason: 'provider-unavailable', model: 'test', text: '' };
  const response = await POST(request(valid));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 'error');
  assert.deepEqual(state.writes, []);
  assert.equal(state.syncRun.status, 'failure');
});
