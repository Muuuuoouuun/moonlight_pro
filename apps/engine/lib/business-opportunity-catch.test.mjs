import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = (globalThis.__businessCatchTest = {});
const stubs = {
  gemini: `
    export function getGeminiIntegrationStatus() { return { configured: true }; }
    export async function generateGeminiText(input) {
      globalThis.__businessCatchTest.generation = input;
      return { ok: true, model: 'test', text: '분석 결과' };
    }
  `,
  'integration-state': `
    export function resolveDefaultWorkspaceId() { return '11111111-1111-4111-8111-111111111111'; }
    export async function upsertIntegrationConnection() { return { connection: null }; }
    export async function insertIntegrationSyncRun() { return {}; }
  `,
  'shared-webhook': `export function validateSharedWebhookRequest() { return { ok: true }; }`,
  'supabase-rest.ts': `
    export async function insertSupabaseRecord(table, row) {
      globalThis.__businessCatchTest.writes.push({ table, row });
      return { persisted: true };
    }
    export async function fetchSupabaseRowsDetailed() { return { ok: true, data: [] }; }
  `,
  'knowledge-retriever.ts': `
    export async function retrieveKnowledge() {
      const state = globalThis.__businessCatchTest;
      state.knowledgeReads = (state.knowledgeReads || 0) + 1;
      return { status: 'live', items: state.knowledge || [] };
    }
  `,
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/server') return next('next/server.js', context);
    // Routes mix extensionless and explicit `.ts` lib imports; stub both spellings.
    const name = specifier.split('/').at(-1);
    const key = [name, name.replace(/\.ts$/, ''), `${name}.ts`].find((candidate) => stubs[candidate]);
    if (specifier.includes('/lib/') && stubs[key]) {
      return { url: 'data:text/javascript,' + encodeURIComponent(stubs[key]), shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const persona = await import('../app/api/ai/persona-chat/route.ts');
const brand = await import('../app/api/ai/brand-mentor/route.ts');
const sales = await import('../app/api/ai/sales-mentor/route.ts');
const { executePatternAnalysis, buildPatternSystemInstruction } = await import('./pattern-analysis.ts');
const request = (body) => new Request('https://engine.test/api/ai', {
  method: 'POST', body: JSON.stringify(body),
});
const instruction = () => `${state.generation.systemInstruction}\n${state.generation.prompt}`;

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  state.writes = [];
});

test('Council weekly report receives evidence-led business catch criteria without creating business records', async () => {
  const response = await persona.POST(request({ personaId: 'council', mode: 'weekly-review' }));
  assert.equal(response.status, 200);
  assert.match(instruction(), /개인 사업 기회 포착/);
  assert.match(instruction(), /SaaS.*컨설팅/);
  assert.match(instruction(), /지불 의사/);
  assert.match(instruction(), /관찰.*가설.*미확인/);
  assert.match(instruction(), /근거 부족/);
  assert.match(instruction(), /다음 주 단 1가지 실험/);
  assert.ok(state.writes.every(({ table }) => table === 'project_updates'));
});

test('Council advice and brand strategy share catch criteria, while content critique remains focused', async () => {
  await persona.POST(request({ personaId: 'council', mode: 'advice' }));
  assert.match(instruction(), /개인 사업 기회 포착/);
  for (const mode of ['brand-strategy', 'audience-analysis', 'flow-review', 'sparring']) {
    await brand.POST(request({ mode, context: { scope: 'personal' } }));
    assert.match(instruction(), /개인 사업 기회 포착/);
  }
  await brand.POST(request({ mode: 'content-critique' }));
  assert.doesNotMatch(instruction(), /개인 사업 기회 포착/);
});

test('Guru open-question records generation without creating a project update, while deal review keeps its report', async () => {
  const question = await sales.POST(request({ mode: 'open-question', draft: '고객의 결정 기준을 어떻게 확인할까요?', context: {} }));
  assert.equal(question.status, 200);
  const questionData = await question.json();
  assert.equal(questionData.status, 'generated');
  assert.equal(questionData.persistence.mentorUpdate, null);
  assert.match(state.generation.prompt, /고객의 결정 기준을 어떻게 확인할까요/);
  assert.deepEqual(state.writes, []);

  const review = await sales.POST(request({ mode: 'deal-review', context: {} }));
  assert.equal(review.status, 200);
  assert.deepEqual(state.writes.map(({ table }) => table), ['project_updates']);
});

test('company scope and company sales personas do not receive personal monetization instructions', async () => {
  for (const context of [{ scope: 'company' }, { orgScope: 'classin' }, { brand: { orgScope: 'company' } }]) {
    await persona.POST(request({ personaId: 'council', mode: 'weekly-review', context }));
    assert.doesNotMatch(instruction(), /개인 사업 기회 포착/);
    await brand.POST(request({ mode: 'brand-strategy', context }));
    assert.doesNotMatch(instruction(), /개인 사업 기회 포착/);
  }
  for (const personaId of ['guru', 'sales']) {
    await persona.POST(request({ personaId, mode: 'weekly-review' }));
    assert.doesNotMatch(instruction(), /개인 사업 기회 포착/);
  }
});

test('retrieved evidence retains its source ID so reports can distinguish original records from AI summaries', async () => {
  state.knowledge = [{ id: 'record-reference', sourceTable: 'journal_entries', kind: 'note', title: '업무 기록', snippet: '확인할 문제', occurredAt: '2026-09-22' }];
  await persona.POST(request({ personaId: 'council', mode: 'weekly-review', message: '이번 주 정리' }));
  assert.equal(state.knowledgeReads, 1);
  assert.match(state.generation.prompt, /journal_entries:record-reference/);
  assert.match(instruction(), /AI.*요약.*독립/);
});

test('single-contact outreach and outcome extraction keep the supplied record without retrieving other notes', async () => {
  state.knowledge = [{ id: 'other-contact', sourceTable: 'journal_entries', kind: 'note', title: '다른 고객', snippet: '다른 고객의 가격 협상', occurredAt: '2026-09-22' }];
  for (const mode of ['outreach-draft', 'extract-contact-outcome']) {
    const response = await persona.POST(request({
      personaId: 'sales', mode,
      draft: '이 고객의 통화 원문',
      context: { name: '이 고객', latestContact: '오늘 통화' },
    }));
    assert.equal(response.status, 200);
    assert.equal(state.knowledgeReads || 0, 0);
    assert.match(state.generation.prompt, /이 고객의 통화 원문/);
    assert.match(state.generation.prompt, /오늘 통화/);
    assert.doesNotMatch(state.generation.prompt, /다른 고객의 가격 협상/);
  }
});

test('general memo analysis receives catch criteria while preserving the structured candidate output', async () => {
  let generation;
  const result = await executePatternAnalysis({
    workspaceId: '11111111-1111-4111-8111-111111111111',
    requestId: '22222222-2222-4222-8222-222222222222', goal: 'general',
    records: [{ id: 'record-reference', body: '다음 대화에서 반복 여부를 확인한다.' }],
  }, { generate: async (input) => { generation = input; return { ok: true, text: '{"candidates":[]}' }; } });
  assert.match(generation.systemInstruction, /개인 사업 기회 포착/);
  assert.match(generation.systemInstruction, /JSON/);
  assert.deepEqual(result.patterns, []);
  assert.doesNotMatch(buildPatternSystemInstruction('content_hook'), /개인 사업 기회 포착/);
  assert.doesNotMatch(buildPatternSystemInstruction('sales_insight'), /개인 사업 기회 포착/);
});
