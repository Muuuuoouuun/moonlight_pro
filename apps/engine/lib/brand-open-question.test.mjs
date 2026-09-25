import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = (globalThis.__brandOpenQuestionTest = {});
const stubs = {
  'gemini.ts': `
    export function getGeminiIntegrationStatus() { return { configured: true }; }
    export async function generateGeminiText(input) {
      globalThis.__brandOpenQuestionTest.generation = input;
      return { ok: true, model: 'test', text: '관찰과 질문' };
    }
  `,
  'integration-state.ts': `
    export function resolveDefaultWorkspaceId() { return '11111111-1111-4111-8111-111111111111'; }
    export async function upsertIntegrationConnection() { return { connection: null }; }
    export async function insertIntegrationSyncRun() { return {}; }
  `,
  'shared-webhook.ts': `export function validateSharedWebhookRequest() { return { ok: true }; }`,
  'supabase-rest.ts': `
    export async function insertSupabaseRecord(table, row) {
      globalThis.__brandOpenQuestionTest.writes.push({ table, row });
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
beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  state.writes = [];
});

test('open-question uses the selected marketing source and operator question without a work proposal', async () => {
  const response = await POST(request({ mode: 'open-question', guidanceId: 'marketing-research', draft: '독자의 표현은 무엇인가요?', context: { scope: 'personal' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'generated');
  const instruction = `${state.generation.systemInstruction}\n${state.generation.prompt}`;
  assert.match(instruction, /독자의 표현은 무엇인가요/);
  assert.match(instruction, /David Ogilvy/);
  assert.match(instruction, /docs\/marketing-branding-gurus\.md/);
  assert.match(instruction, /자료 요약, 인용 아님/);
  assert.match(instruction, /관찰.*프레임.*질문 또는 선택/s);
  assert.doesNotMatch(instruction, /Seth Godin|Donald Miller|Eliyahu Goldratt/);
  assert.doesNotMatch(instruction, /3\. 다음 액션|4\. 승인 큐 후보|work_order로 올릴|개인 사업 기회 포착/);
  assert.deepEqual(state.writes, []);
  const info = await (await GET()).json();
  assert.ok(info.modes.includes('open-question'));
});

test('open-question accepts a content card with its own cited source', async () => {
  const response = await POST(request({ mode: 'open-question', guidanceId: 'content-hook', draft: '첫 장의 약속을 지켰나요?' }));
  assert.equal(response.status, 200);
  assert.match(state.generation.prompt, /Kane Kallaway/);
  assert.match(state.generation.prompt, /docs\/content-storytelling-people-v2\.md/);
});

test('open-question rejects wrong domain, missing source, missing question and work order requests before generation', async () => {
  for (const body of [
    { guidanceId: 'sales-meddic', draft: '고객 질문' },
    { guidanceId: 'legend-buffett', draft: '판단 질문' },
    { guidanceId: 'invented-card', draft: '브랜드 질문' },
    { draft: '브랜드 질문' },
    { guidanceId: 'marketing-research', draft: ' ' },
    { guidanceId: 'marketing-research', draft: '브랜드 질문', createWorkOrder: true },
    { guidanceId: 'marketing-research', draft: '브랜드 질문', legendIds: ['jobs'] },
    { guidanceId: 'marketing-research', draft: '브랜드 질문', context: { scope: 'company' } },
  ]) {
    const response = await POST(request({ mode: 'open-question', ...body }));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error, 'invalid-open-question');
    assert.equal(state.generation, undefined);
    assert.deepEqual(state.writes, []);
  }
});

test('default brand advisory modes no longer ask for an approval-queue candidate', async () => {
  for (const mode of ['brand-strategy', 'content-critique', 'audience-analysis']) {
    const response = await POST(request({ mode, draft: '이번 주 원고 방향을 점검해 주세요.' }));
    assert.equal(response.status, 200, mode);
    const instruction = `${state.generation.systemInstruction}\n${state.generation.prompt}`;
    assert.doesNotMatch(instruction, /승인 큐 후보|work_order로 올릴/, mode);
    assert.deepEqual(state.writes.filter(write => write.table === 'work_orders'), [], mode);
  }
});
