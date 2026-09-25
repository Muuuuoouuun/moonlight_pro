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
  assert.match(prompt, /선택된 자료 카드가 없으므로/);
  assert.match(prompt, /질문과 직접 관련 없는 다른 고객/);
  assert.doesNotMatch(prompt, /docs\/sales-guru-knowledge-base\.md|Dick Dunkel|Keenan/);
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
  assert.match(prompt, /이전 생성 조언.*사실 근거가 아닙니다/);
  assert.match(prompt, /내부 검토 중인 제안입니다/);
});

test('only a card the operator chose brings its verbatim playbook original with the quote-and-figure guard', () => {
  const chosen = buildGuruAdvicePrompt({
    mode: 'open-question', guidanceId: 'sales-meddic', context: {}, draft: '견적 뒤 결정이 멈췄어요.',
  });
  assert.match(chosen, /\[플레이북 원문 — 운영자가 고른 카드의 출처, 글자 그대로\]/);
  assert.match(chosen, /카드가 가리키는 절: 기법 4: Qualification — MEDDIC 프레임워크/);
  assert.match(chosen, /인용문·수치·성과 주장·사례 문구를 답변에 옮기거나 사실처럼 말하지 마십시오/);
  assert.match(chosen, /<<<원문 시작>>>[\s\S]*MEDDIC[\s\S]*<<<원문 끝>>>/);
  // The original sits before the operator's question and the ledger snapshot, apart from both.
  assert.ok(chosen.indexOf('<<<원문 끝>>>') < chosen.indexOf('견적 뒤 결정이 멈췄어요.'));

  // A mode's default card is a short frame; no card at all adds no source.
  const defaulted = buildGuruAdvicePrompt({ mode: 'deal-review', context: {} });
  assert.doesNotMatch(defaulted, /플레이북 원문|<<<원문 시작>>>/);
  const freeform = buildGuruAdvicePrompt({ mode: 'open-question', context: {}, draft: '무엇을 물을까요?' });
  assert.doesNotMatch(freeform, /플레이북 원문|<<<원문 시작>>>/);
});

test('unsupported card IDs add no untrusted frame to a mentor prompt', () => {
  const prompt = buildGuruAdvicePrompt({ mode: 'deal-review', guidanceId: 'fake-card', context: {} });
  assert.doesNotMatch(prompt, /fake-card/);
  assert.doesNotMatch(prompt, /<<<원문 시작>>>/);
  assert.ok(Object.keys(GURU_ADVICE_MODES).includes('pipeline-triage'));
  assert.equal(Object.hasOwn(GURU_ADVICE_MODES, 'followup-draft'), false);
});
