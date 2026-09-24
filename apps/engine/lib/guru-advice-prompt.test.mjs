import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GURU_ADVICE_MODES, buildGuruAdvicePrompt } from './guru-advice-prompt.ts';

test('ordinary Guru advice asks for a lens and question without mandatory work creation', () => {
  const prompt = buildGuruAdvicePrompt({ mode: 'deal-review', context: { focus: { found: true } } });
  assert.match(prompt, /관찰/);
  assert.match(prompt, /적용할 프레임/);
  assert.match(prompt, /질문 또는 선택/);
  assert.match(prompt, /docs\/sales-guru-knowledge-base\.md/);
  assert.doesNotMatch(prompt, /승인 큐 후보|work_order로 올릴|항상.*다음 한 수|80%는/);
});

test('a freeform question uses an open-question mode rather than proposal critique', () => {
  const prompt = buildGuruAdvicePrompt({ mode: 'open-question', context: {}, draft: '고객에게 무엇을 확인할까요?' });
  assert.match(prompt, /운영자가 묻는 상황/);
  assert.match(prompt, /고객에게 무엇을 확인할까요/);
  assert.ok(Object.hasOwn(GURU_ADVICE_MODES, 'open-question'));
});

test('user-selected card changes the frame without asserting it as ledger fact', () => {
  const prompt = buildGuruAdvicePrompt({
    mode: 'deal-review', guidanceId: 'sales-meddic',
    context: { focus: { found: true } }, draft: '내부 검토 중인 제안입니다.',
  });
  assert.match(prompt, /Dick Dunkel/);
  assert.match(prompt, /자료 요약, 인용 아님/);
  assert.match(prompt, /원장 사실과 분리/);
  assert.match(prompt, /내부 검토 중인 제안입니다/);
});

test('unsupported card IDs add no untrusted frame to a mentor prompt', () => {
  const prompt = buildGuruAdvicePrompt({ mode: 'deal-review', guidanceId: 'fake-card', context: {} });
  assert.doesNotMatch(prompt, /fake-card/);
  assert.ok(Object.keys(GURU_ADVICE_MODES).includes('pipeline-triage'));
  assert.equal(Object.hasOwn(GURU_ADVICE_MODES, 'followup-draft'), false);
});
