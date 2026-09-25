import { GURU_CARDS } from '@com-moon/guru-guidance';

const MAX_HISTORY_TURNS = 3;
const MAX_QUESTION_CHARS = 1200;
const MAX_ANSWER_CHARS = 2400;

function scopedHistory(card, ref, history) {
  if (!Array.isArray(history)) return [];
  return history.filter(turn => turn && typeof turn === 'object'
    && typeof turn.question === 'string' && turn.question.trim()
    && typeof turn.answer === 'string' && turn.answer.trim()
    && turn.guidanceId === card?.id
    && (turn.ref || '') === ref,
  ).slice(-MAX_HISTORY_TURNS).map(turn => ({
    question: turn.question.trim().slice(0, MAX_QUESTION_CHARS),
    answer: turn.answer.trim().slice(0, MAX_ANSWER_CHARS),
    ...(card ? { guidanceId: card.id } : {}),
    ...(ref ? { ref } : {}),
  }));
}

export function guidanceRequest(card, question, context = {}, history = []) {
  if (card?.kind === 'legend') throw new Error('read-only');
  const text = String(question || '').trim();
  if (!text) throw new Error('question-required');
  const free = !card && context?.free === true;
  const known = free ? null : GURU_CARDS.find(item => item.id === card?.id && item.domain === card?.domain);
  if (!known && !free) throw new Error('unknown-guidance-card');
  const ref = typeof context?.ref === 'string' ? context.ref.trim() : '';
  const previous = scopedHistory(known, known?.domain === 'sales' || free ? '' : ref, history);

  if (free || known.domain === 'sales') {
    return {
      endpoint: '/api/hub/sales-mentor',
      target: '영업 Guru',
      body: { mode: 'open-question', draft: text,
        ...(known ? { guidanceId: known.id } : {}),
        ...(previous.length ? { history: previous } : {}),
      },
    };
  }
  return {
    endpoint: '/api/hub/brand-mentor',
    target: '브랜드 멘토',
    body: {
      mode: 'open-question', draft: text, guidanceId: known.id, createWorkOrder: false,
      ...(ref ? { ref } : {}),
      ...(previous.length ? { history: previous } : {}),
    },
  };
}

export async function requestGuidanceAdvice(card, question, context, history) {
  const request = guidanceRequest(card, question, context, history);
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
