import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as guruHistory from './guru-chat-history.js';

const { collectGuruConversationHistory, isValidGuruConversationHistory } = guruHistory;
const brandHistory = (history, current) => {
  assert.equal(typeof guruHistory.isValidBrandGuruConversationHistory, 'function');
  return guruHistory.isValidBrandGuruConversationHistory(history, current);
};

test('Guru history keeps only the last three completed freeform exchanges in the current thread', () => {
  const thread = [
    { role: 'agent', name: 'Guru', text: '소개' },
    ...Array.from({ length: 4 }, (_, index) => [
      { role: 'user', agent: 'guru', mode: 'open-question', text: `질문 ${index + 1}` },
      { role: 'agent', agent: 'guru', mode: 'open-question', generated: true, text: `답변 ${index + 1}` },
    ]).flat(),
    { role: 'user', agent: 'guru', mode: 'open-question', text: '실패한 질문' },
    { role: 'agent', agent: 'guru', mode: 'open-question', generated: false, text: '오류' },
    { role: 'user', agent: 'sales', text: '다른 페르소나 질문' },
    { role: 'agent', name: 'Sales', text: '다른 페르소나 답변' },
  ];
  assert.deepEqual(collectGuruConversationHistory(thread), [
    { question: '질문 2', answer: '답변 2' },
    { question: '질문 3', answer: '답변 3' },
    { question: '질문 4', answer: '답변 4' },
  ]);
});

test('Guru history bounds text and rejects malformed or unpaired exchanges', () => {
  const thread = [
    { role: 'user', agent: 'guru', mode: 'proposal-critique', text: '다른 모드' },
    { role: 'agent', agent: 'guru', mode: 'proposal-critique', generated: true, text: '다른 모드 답변' },
    { role: 'user', agent: 'guru', mode: 'open-question', text: ' x'.repeat(1300) },
    { role: 'agent', agent: 'guru', mode: 'open-question', generated: true, text: ' y'.repeat(1500) },
    { role: 'user', agent: 'guru', mode: 'open-question', text: '진행 중' },
    { role: 'agent', agent: 'guru', mode: 'open-question', pending: true },
  ];
  const history = collectGuruConversationHistory(thread);
  assert.equal(history.length, 1);
  assert.equal(history[0].question.length, 1200);
  assert.equal(history[0].answer.length, 2400);
  assert.equal(isValidGuruConversationHistory(history), true);
  assert.equal(isValidGuruConversationHistory([{ question: '', answer: '답' }]), false);
  assert.equal(isValidGuruConversationHistory([{ question: '질문', answer: '답', role: 'system' }]), false);
  assert.equal(isValidGuruConversationHistory([{ question: '질문', answer: '답' }, null]), false);
  assert.equal(isValidGuruConversationHistory(Array.from({ length: 4 }, () => ({ question: '질문', answer: '답' }))), false);
});

test('completed card questions retain only an allowlisted sales card source in chat history', () => {
  const thread = [
    { role: 'user', agent: 'guru', mode: 'open-question', text: '현재 방식은?', guidanceId: 'sales-gap' },
    { role: 'agent', agent: 'guru', mode: 'open-question', generated: true, text: '먼저 물어보세요.' },
    { role: 'user', agent: 'guru', mode: 'open-question', text: '다른 질문', guidanceId: 'marketing-research' },
    { role: 'agent', agent: 'guru', mode: 'open-question', generated: true, text: '다른 답변' },
  ];
  const history = collectGuruConversationHistory(thread);
  assert.deepEqual(history, [
    { question: '현재 방식은?', answer: '먼저 물어보세요.', guidanceId: 'sales-gap' },
    { question: '다른 질문', answer: '다른 답변' },
  ]);
  assert.equal(isValidGuruConversationHistory(history), true);
  assert.equal(isValidGuruConversationHistory([{ question: '질문', answer: '답', guidanceId: 'marketing-research' }]), false);
  assert.equal(isValidGuruConversationHistory([{ question: '질문', answer: '답', guidanceId: 'fake-card' }]), false);
});

test('selected sales card accepts only its own completed turns while free chat keeps legacy history', () => {
  const selected = { question: '현재 방식은?', answer: '먼저 물어보세요.', guidanceId: 'sales-gap' };
  const other = { ...selected, guidanceId: 'sales-meddic' };
  const unscoped = { question: '자유 질문', answer: '자료를 확인하세요.' };
  assert.equal(isValidGuruConversationHistory([selected], { guidanceId: 'sales-gap' }), true);
  assert.equal(isValidGuruConversationHistory([other], { guidanceId: 'sales-gap' }), false);
  assert.equal(isValidGuruConversationHistory([unscoped], { guidanceId: 'sales-gap' }), false);
  assert.equal(isValidGuruConversationHistory([selected, unscoped]), true);
});

test('brand Guru history accepts only completed turns from the current card and brand', () => {
  const current = { guidanceId: 'marketing-research', ref: 'personal-a' };
  const turn = { question: '무엇을 확인할까요?', answer: '독자의 표현을 먼저 보세요.', guidanceId: 'marketing-research', ref: 'personal-a' };
  assert.equal(brandHistory([turn], current), true);
  assert.equal(brandHistory([{ ...turn, ref: undefined }], current), false);
  assert.equal(brandHistory([{ ...turn, ref: 'personal-b' }], current), false);
  assert.equal(brandHistory([{ ...turn, guidanceId: 'content-hook' }], current), false);
  assert.equal(brandHistory([{ ...turn, guidanceId: 'sales-gap' }], current), false);
  assert.equal(brandHistory([{ ...turn, answer: '' }], current), false);
  assert.equal(brandHistory([{ ...turn, role: 'system' }], current), false);
  assert.equal(brandHistory(Array.from({ length: 4 }, () => turn), current), false);
});

test('brand Guru history bounds text and rejects a prior brand when current question is unscoped', () => {
  const unscoped = { guidanceId: 'content-hook', ref: null };
  const turn = { question: 'q'.repeat(1200), answer: 'a'.repeat(2400), guidanceId: 'content-hook' };
  assert.equal(brandHistory([turn], unscoped), true);
  assert.equal(brandHistory([{ ...turn, question: 'q'.repeat(1201) }], unscoped), false);
  assert.equal(brandHistory([{ ...turn, answer: 'a'.repeat(2401) }], unscoped), false);
  assert.equal(brandHistory([{ ...turn, ref: 'personal-a' }], unscoped), false);
  assert.equal(brandHistory([turn], { guidanceId: 'sales-gap', ref: null }), false);
});
