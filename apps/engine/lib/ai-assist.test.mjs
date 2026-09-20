import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistancePrompt } from './ai-assist.ts';
import { POST } from '../app/api/ai/assist/route.ts';
const input = { operation: 'analyze', instruction: '기준 대비 진척을 확인', scope: 'personal', source: { status: 'partial', scope: 'personal', sourceRefs: [{ entityType: 'tasks', entityId: 'id' }], goals: { status: 'partial' }, snapshot: { title: '업무' } } };
test('assistance prompt preserves missing goals and scopes while bounding source context', () => {
  assert.match(assistancePrompt(input).systemInstruction, /목표와 지표/);
  assert.match(assistancePrompt(input).prompt, /partial/);
  assert.throws(() => assistancePrompt({ ...input, scope: 'company' }));
  assert.throws(() => assistancePrompt({ ...input, source: { ...input.source, sourceRefs: [] } }));
  assert.throws(() => assistancePrompt({ ...input, source: { ...input.source, body: 'x'.repeat(30001) } }));
});
test('assist route authenticates before provider and retains actual usage without inventing missing counts', async () => {
  const before = { ...process.env }, oldFetch = globalThis.fetch; let calls = 0;
  Object.assign(process.env, { COM_MOON_SHARED_WEBHOOK_SECRET: 'test-shared', GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'selected-model' });
  const request = secret => new Request('https://engine.test/api/ai/assist', { method: 'POST', headers: { 'x-com-moon-shared-secret': secret }, body: JSON.stringify(input) });
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ candidates: [{ content: { parts: [{ text: '근거가 부족한 지표는 확인 필요입니다.' }] } }] }); };
    assert.equal((await POST(request('wrong'))).status, 401); assert.equal(calls, 0);
    const data = await (await POST(request('test-shared'))).json();
    assert.equal(data.status, 'generated'); assert.equal(data.model, 'selected-model'); assert.equal(data.usage, null); assert.equal(calls, 1);
  } finally { process.env = before; globalThis.fetch = oldFetch; }
});
