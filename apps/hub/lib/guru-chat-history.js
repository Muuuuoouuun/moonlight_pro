// Only completed answers from the current chat are carried into a freeform
// follow-up. These are conversation context, never independent ledger evidence.
import { GURU_CARDS } from '@com-moon/guru-guidance';

export const GURU_CHAT_HISTORY_MAX_TURNS = 3;
export const GURU_CHAT_QUESTION_MAX_CHARS = 1200;
export const GURU_CHAT_ANSWER_MAX_CHARS = 2400;
const SALES_CARD_IDS = new Set(GURU_CARDS.filter(card => card.domain === 'sales').map(card => card.id));
const BRAND_CARD_IDS = new Set(GURU_CARDS.filter(card => card.domain === 'marketing' || card.domain === 'content').map(card => card.id));

const plain = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function isValidGuruConversationHistory(history, { guidanceId } = {}) {
  return (guidanceId === undefined || SALES_CARD_IDS.has(guidanceId))
    && Array.isArray(history)
    && history.length <= GURU_CHAT_HISTORY_MAX_TURNS
    && history.every(turn => plain(turn)
      && Object.keys(turn).every(key => ['question', 'answer', 'guidanceId'].includes(key))
      && typeof turn.question === 'string'
      && turn.question.trim().length > 0
      && turn.question.length <= GURU_CHAT_QUESTION_MAX_CHARS
      && typeof turn.answer === 'string'
      && turn.answer.trim().length > 0
      && turn.answer.length <= GURU_CHAT_ANSWER_MAX_CHARS
      && (guidanceId === undefined
        ? turn.guidanceId === undefined || SALES_CARD_IDS.has(turn.guidanceId)
        : turn.guidanceId === guidanceId));
}

export function isValidBrandGuruConversationHistory(history, { guidanceId, ref = null } = {}) {
  return BRAND_CARD_IDS.has(guidanceId)
    && Array.isArray(history)
    && history.length <= GURU_CHAT_HISTORY_MAX_TURNS
    && history.every(turn => plain(turn)
      && Object.keys(turn).every(key => ['question', 'answer', 'guidanceId', 'ref'].includes(key))
      && typeof turn.question === 'string'
      && turn.question.trim().length > 0
      && turn.question.length <= GURU_CHAT_QUESTION_MAX_CHARS
      && typeof turn.answer === 'string'
      && turn.answer.trim().length > 0
      && turn.answer.length <= GURU_CHAT_ANSWER_MAX_CHARS
      && turn.guidanceId === guidanceId
      && (ref ? turn.ref === ref : turn.ref === undefined));
}

export function collectGuruConversationHistory(thread) {
  if (!Array.isArray(thread)) return [];
  const turns = [];
  for (let index = 0; index < thread.length - 1; index++) {
    const question = thread[index];
    const answer = thread[index + 1];
    if (question?.role !== 'user' || question.agent !== 'guru' || question.mode !== 'open-question'
      || answer?.role !== 'agent' || answer.agent !== 'guru' || answer.mode !== 'open-question'
      || answer.generated !== true || answer.pending === true) continue;
    const questionText = typeof question.text === 'string' ? question.text.trim().slice(0, GURU_CHAT_QUESTION_MAX_CHARS) : '';
    const answerText = typeof answer.text === 'string' ? answer.text.trim().slice(0, GURU_CHAT_ANSWER_MAX_CHARS) : '';
    if (questionText && answerText) turns.push({
      question: questionText,
      answer: answerText,
      ...(SALES_CARD_IDS.has(question.guidanceId) ? { guidanceId: question.guidanceId } : {}),
    });
    index++;
  }
  return turns.slice(-GURU_CHAT_HISTORY_MAX_TURNS);
}
