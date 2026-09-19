import { isCanonicalUuid } from './uuid.js';
import { normalizeJournalTags } from './journal-tags.js';

export const NOTE_QUESTIONS = [
  { value: 'note', label: '자유 메모', question: '어떤 일을 할 때 다시 꺼내보면 좋을까요?' },
  { value: 'conversation', label: '고객 대화', question: '상대가 실제로 한 말 중 기억할 문장은?' },
  { value: 'idea', label: '아이디어', question: '어떤 장면을 보고 이 생각이 들었나요?' },
  { value: 'learning', label: '배운 내용', question: '내 일에서 어디에 한번 써볼 수 있나요?' },
  { value: 'blocked', label: '막힌 일', question: '어느 단계에서 멈췄나요?' },
  { value: 'decision', label: '결정', question: '다른 선택지 대신 이것을 고른 이유는?' },
];
export const CONTEXT_TYPES = [
  { value: 'project', label: '프로젝트' }, { value: 'lead', label: '고객 · 리드' },
  { value: 'account', label: '고객 · 계약 계정' }, { value: 'brand', label: '브랜드' },
];
export function noteToDraft(entry) {
  return {
    id: entry.id, body: entry.body || '', title: entry.title || '', occurredAt: entry.occurredAt,
    noteMeta: { kind: entry.noteMeta?.kind || 'note', enhancement: entry.noteMeta?.enhancement || '',
      ...(entry.noteMeta?.tags === undefined ? {} : { tags: [...entry.noteMeta.tags] }) },
    contexts: entry.contexts || [], expectedRevision: entry.revision || 0,
  };
}
export function buildNoteSave(draft, requestId) {
  const tags = normalizeJournalTags(draft.noteMeta.tags);
  return { action: 'save', requestId, entryId: draft.id, expectedRevision: draft.expectedRevision,
    body: draft.body, title: draft.title, occurredAt: draft.occurredAt, noteMeta: { ...draft.noteMeta, ...(tags === undefined ? {} : { tags: tags ?? draft.noteMeta.tags }) },
    contexts: draft.contexts.map(({ type, id }) => ({ type, id })) };
}
export function noteFingerprint(draft) {
  if (!draft) return '';
  const { requestId, expectedRevision, ...fields } = buildNoteSave(draft, '');
  return JSON.stringify(fields);
}
function splitsSurrogate(body, index) {
  return index > 0 && index < body.length && /[\uD800-\uDBFF]/.test(body[index - 1]) && /[\uDC00-\uDFFF]/.test(body[index]);
}
export function selectedNoteExcerpt(body, start, end) {
  if (typeof body !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end <= start || end > body.length || splitsSurrogate(body, start) || splitsSurrogate(body, end)) return null;
  const text = body.slice(start, end);
  if (!text.trim() || text.length > 3500) return null;
  return { prefix: body.slice(0, start), text, suffix: body.slice(end) };
}
export function journalSourceHref(ref) {
  return ref?.type === 'journal' && isCanonicalUuid(ref.journal_id) ? `/dashboard/work/memos?note=${ref.journal_id}` : null;
}
export function memoCaptureHref(context) {
  if (!CONTEXT_TYPES.some(({ value }) => value === context?.type) || !isCanonicalUuid(context?.id)) return '/dashboard/work/memos?new=note';
  return `/dashboard/work/memos?new=note&contextType=${context.type}&contextId=${context.id}`;
}
export function isJournalEntry(entry, entryId) {
  return Boolean(entry?.id === entryId && isCanonicalUuid(entry.id) && typeof entry.body === 'string'
    && Number.isSafeInteger(entry.revision) && entry.revision > 0 && typeof entry.occurredAt === 'string');
}
const DEFINITIVE = new Set(['invalid-input', 'invalid-json', 'forbidden', 'unauthorized', 'payload-too-large']);
export function journalErrorMessage(result) {
  if (result?.message) return result.message;
  if (result?.status === 'conflict') return '다른 저장 내용이 있어요. 현재 저장본과 내 입력을 확인해 주세요.';
  if (result?.status === 'invalid-input') return '입력이나 연결할 업무를 확인해 주세요.';
  return '저장을 확인하지 못했어요. 입력은 유지됩니다. 같은 요청으로 다시 확인해 주세요.';
}

// An immutable request reaches browser storage before the network. No second
// request can pass an unresolved first request, including after a page reload.
export function createJournalWriter({ get, persist, send, update, isCurrent = () => true }) {
  let inFlight = null;
  async function perform(request) {
    const before = get(), pending = before.pending || request;
    if (!pending || !isCurrent()) return { status: 'stale-document' };
    try { persist({ ...before, pending }); }
    catch {
      update({ saveState: 'error', localError: true, message: '브라우저 복구 사본을 저장하지 못했어요. 입력을 복사한 뒤 저장 공간을 확인해 주세요.' });
      return { status: 'local-error' };
    }
    update({ pending, saveState: 'saving', conflict: null, message: '저장 중…' });
    try {
      const result = await send(pending);
      if (!isCurrent()) return { status: 'stale-document' };
      const durable = ['saved', 'duplicate'].includes(result?.status) && isJournalEntry(result.entry, pending.entryId)
        && (pending.action === 'save' || Boolean(result.target?.id && result.link?.id));
      if (durable) {
        const next = { ...get(), entry: result.entry, draft: noteToDraft(result.entry), pending: null, dirty: false,
          conflict: null, saveState: 'saved', localError: false, target: result.target || null, reuseDraft: null,
          message: pending.action === 'save' ? '저장했어요. 한 줄 더 보강하거나 필요한 부분을 활용할 수 있어요.' : '발췌와 원문 링크를 함께 저장했어요.' };
        persist(next);
        if (isCurrent()) update(next);
        return result;
      }
      const rejected = DEFINITIVE.has(result?.status) || (result?.status === 'conflict' && isJournalEntry(result.entry, pending.entryId));
      const next = { ...get(), pending: rejected ? null : pending, saveState: result?.status === 'conflict' ? 'conflict' : 'error',
        conflict: result?.status === 'conflict' && isJournalEntry(result.entry, pending.entryId) ? result.entry : null,
        message: journalErrorMessage(result) };
      persist(next); update(next);
      return result;
    } catch {
      if (isCurrent()) update({ saveState: 'error', message: journalErrorMessage() });
      return { status: 'error' };
    }
  }
  return { run(request) {
    if (inFlight) return inFlight;
    inFlight = perform(request).finally(() => { inFlight = null; });
    return inFlight;
  } };
}
