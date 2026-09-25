import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import { guidanceRequest, requestGuidanceAdvice } from './guidance-advice-client.js';

const sales = GURU_CARDS.find(card => card.domain === 'sales');
const marketing = GURU_CARDS.find(card => card.domain === 'marketing');
const content = GURU_CARDS.find(card => card.domain === 'content');

test('sales question keeps the ClassIn Guru route and selected source ID', () => {
  assert.deepEqual(guidanceRequest(sales, '선택 기준은?'), {
    endpoint: '/api/hub/sales-mentor',
    target: '영업 Guru',
    body: { mode: 'open-question', draft: '선택 기준은?', guidanceId: sales.id },
  });
});

test('marketing and content questions use the personal brand mentor without work orders', () => {
  for (const card of [marketing, content]) {
    assert.deepEqual(guidanceRequest(card, '어떤 관점이 필요한가?'), {
      endpoint: '/api/hub/brand-mentor',
      target: '브랜드 멘토',
      body: { mode: 'open-question', draft: '어떤 관점이 필요한가?', guidanceId: card.id, createWorkOrder: false },
    });
  }
  assert.deepEqual(guidanceRequest(marketing, '이 브랜드의 핵심은?', { ref: 'sinabro' }), {
    endpoint: '/api/hub/brand-mentor',
    target: '브랜드 멘토',
    body: { mode: 'open-question', draft: '이 브랜드의 핵심은?', guidanceId: marketing.id, createWorkOrder: false, ref: 'sinabro' },
  });
});

test('Legend and blank questions cannot be submitted', () => {
  assert.throws(() => guidanceRequest(LEGEND_CARDS[0], '도와줘'), /read-only/);
  assert.throws(() => guidanceRequest(sales, '  '), /question-required/);
});

test('a free chatbot question uses Guru without assigning a mentor card', () => {
  assert.deepEqual(guidanceRequest(null, '지금 판단을 같이 봐줘', { free: true }), {
    endpoint: '/api/hub/sales-mentor',
    target: '영업 Guru',
    body: { mode: 'open-question', draft: '지금 판단을 같이 봐줘' },
  });
  assert.throws(() => guidanceRequest(null, '질문'), /unknown-guidance-card/);
});

test('follow-up sends at most three completed turns from the same card and brand', () => {
  const turns = [
    { question: '다른 카드', answer: '범위 밖', guidanceId: content.id, ref: 'other' },
    ...Array.from({ length: 4 }, (_, index) => ({
      question: `질문 ${index + 1}`, answer: `답변 ${index + 1}`, guidanceId: marketing.id, ref: 'sinabro',
    })),
  ];
  assert.deepEqual(guidanceRequest(marketing, '이어서 설명해줘', { ref: 'sinabro' }, turns).body, {
    mode: 'open-question', draft: '이어서 설명해줘', guidanceId: marketing.id,
    createWorkOrder: false, ref: 'sinabro',
    history: turns.slice(-3),
  });
  assert.deepEqual(guidanceRequest(sales, '다음 질문', {}, [
    { question: '처음 질문', answer: '첫 답변', guidanceId: sales.id },
    { question: '다른 카드', answer: '범위 밖', guidanceId: marketing.id },
  ]).body.history, [{ question: '처음 질문', answer: '첫 답변', guidanceId: sales.id }]);
});

test('request sends only when called and reports preview honestly', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (endpoint, init) => {
    requests.push({ endpoint, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ status: 'preview', error: 'Engine 연결 필요' }) };
  };
  try {
    assert.equal(requests.length, 0);
    const result = await requestGuidanceAdvice(marketing, '첫 문장을 어떻게 쓰지?', { ref: 'sinabro' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].endpoint, '/api/hub/brand-mentor');
    assert.equal(requests[0].body.createWorkOrder, false);
    assert.equal(requests[0].body.ref, 'sinabro');
    assert.deepEqual(result, { state: 'preview', note: '연결 상태를 확인한 뒤 다시 시도해 주세요.' });
  } finally {
    globalThis.fetch = previous;
  }
});

test('an unmatched selected brand gives a specific recoverable explanation', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ status: 'error', error: '선택한 개인 브랜드를 현재 원장에서 확인할 수 없습니다.' }),
  });
  try {
    assert.deepEqual(await requestGuidanceAdvice(marketing, '이 브랜드의 방향은?', { ref: 'missing' }), {
      state: 'error',
      note: '선택한 개인 브랜드를 원장에서 확인할 수 없습니다. 브랜드를 다시 선택해 주세요.',
    });
  } finally {
    globalThis.fetch = previous;
  }
});
