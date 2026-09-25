import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guruUiModeForRequestMode, shouldAutoRunGuruOnOpen, requestGuruCoaching } from './guru-client.js';

test('Guru question deep links open the advice composer without generating an empty answer', () => {
  assert.equal(guruUiModeForRequestMode('open-question'), 'advice');
  assert.equal(shouldAutoRunGuruOnOpen('open-question'), false);
  assert.equal(guruUiModeForRequestMode('proposal-critique'), 'critique');
  assert.equal(guruUiModeForRequestMode('weekly-retro'), 'weekly-review');
  assert.equal(guruUiModeForRequestMode('sparring'), 'sparring');
  assert.equal(shouldAutoRunGuruOnOpen('deal-review'), true);
});

test('Guru client sends same-chat history for freeform follow-up only', async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({ status: 'generated', text: '답변' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const history = [{ question: '이전 질문', answer: '이전 답변' }];
  await requestGuruCoaching({ mode: 'open-question', draft: '방금 답변을 풀어주세요.', history });
  await requestGuruCoaching({ mode: 'deal-review', draft: '거래 검토', history });
  assert.deepEqual(bodies[0].history, history);
  assert.equal(Object.hasOwn(bodies[1], 'history'), false);
});

test('Guru client keeps the model reported by the generated response', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status: 'generated',
    text: '답변',
    model: 'gemini-3-flash-preview',
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await requestGuruCoaching({ mode: 'open-question', draft: '질문' });
  assert.equal(result.model, 'gemini-3-flash-preview');
});
