import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGuruConversationHistory, isValidGuruConversationHistory } from './guru-chat-history.js';

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
