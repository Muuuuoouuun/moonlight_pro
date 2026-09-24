import { GURU_CARDS } from '@com-moon/guru-guidance';

export function guidanceRequest(card, question, context = {}) {
  if (card?.kind === 'legend') throw new Error('read-only');
  const text = String(question || '').trim();
  if (!text) throw new Error('question-required');
  const known = GURU_CARDS.find(item => item.id === card?.id && item.domain === card?.domain);
  if (!known) throw new Error('unknown-guidance-card');

  if (known.domain === 'sales') {
    return {
      endpoint: '/api/hub/sales-mentor',
      target: '영업 Guru',
      body: { mode: 'open-question', draft: text, guidanceId: known.id },
    };
  }
  return {
    endpoint: '/api/hub/brand-mentor',
    target: '브랜드 멘토',
    body: {
      mode: 'open-question', draft: text, guidanceId: known.id, createWorkOrder: false,
      ...(typeof context.ref === 'string' && context.ref.trim() ? { ref: context.ref.trim() } : {}),
    },
  };
}

export async function requestGuidanceAdvice(card, question, context) {
  const request = guidanceRequest(card, question, context);
  try {
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === 'generated' && data.text) {
      return { state: 'done', text: data.text, runId: data.runId || null };
    }
    if (data?.status === 'preview') {
      return { state: 'preview', note: '연결 상태를 확인한 뒤 다시 시도해 주세요.' };
    }
    if (request.endpoint === '/api/hub/brand-mentor' && response.status === 409) {
      return { state: 'error', note: '선택한 개인 브랜드를 원장에서 확인할 수 없습니다. 브랜드를 다시 선택해 주세요.' };
    }
    return { state: 'error', note: '질문을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  } catch {
    return { state: 'error', note: '연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}
