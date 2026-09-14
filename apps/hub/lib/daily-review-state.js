const ANSWERS = ['energy', 'focus', 'progress', 'note'];

export function createReviewDraftStore(storage, { onPendingChange = () => {} } = {}) {
  const memory = new Map();
  const prefix = 'moonlight:daily-review:v1:';
  const key = (date) => `${prefix}${date}`;
  const notifyPending = () => onPendingChange([...memory.values()].some(Boolean));
  return {
    restore() {
      try {
        for (const storedKey of storage.keys?.() || []) {
          if (typeof storedKey !== 'string' || !storedKey.startsWith(prefix)) continue;
          const date = storedKey.slice(prefix.length);
          if (memory.has(date)) continue;
          const cached = readReviewDraftCache(storage.getItem(storedKey), date);
          if (cached) memory.set(date, cached);
        }
      } catch { /* Existing in-tab drafts still retain their protection. */ }
      notifyPending();
    },
    read(date) {
      // A failed storage write/remove leaves stale bytes behind. The latest
      // in-tab value (including a cleared draft) must remain authoritative.
      if (memory.has(date)) return memory.get(date);
      try {
        const cached = readReviewDraftCache(storage.getItem(key(date)), date);
        if (cached) memory.set(date, cached);
        notifyPending();
        return cached;
      }
      catch { return null; }
    },
    write(date, value) {
      memory.set(date, value);
      try {
        if (value) storage.setItem(key(date), JSON.stringify({ version: 1, ...value }));
        else storage.removeItem(key(date));
      } catch { /* Keep the latest in-tab copy when browser storage is unavailable. */ }
      // Both sessionStorage and memory disappear on tab close.
      notifyPending();
    },
  };
}

export function blankReviewDraft(reviewDate) {
  return { reviewDate, energy: null, focus: '', progress: null, note: '', expectedRevision: 0 };
}

export function reviewToDraft(review) {
  return { reviewDate: review.reviewDate, energy: review.energy, focus: review.focus, progress: review.progress, note: review.note, expectedRevision: review.revision };
}

function validDraft(draft, date) {
  return draft?.reviewDate === date
    && (draft.energy === null || (Number.isInteger(draft.energy) && draft.energy >= 1 && draft.energy <= 5))
    && [null, 0, 1, 2, 'not_applicable'].includes(draft.progress)
    && typeof draft.focus === 'string' && draft.focus.length <= 500
    && typeof draft.note === 'string' && draft.note.length <= 4000
    && Number.isInteger(draft.expectedRevision) && draft.expectedRevision >= 0;
}

function validReview(review, date) {
  return typeof review?.id === 'string' && review.id.length > 0
    && Number.isInteger(review.revision) && review.revision > 0
    && validDraft(reviewToDraft(review), date);
}

export function sameReviewAnswers(left, right) {
  return Boolean(left && right && left.reviewDate === right.reviewDate && ANSWERS.every((key) => left[key] === right[key]));
}

export function prepareReviewSave(draft, previousAttempt, newRequestId) {
  const payload = { reviewDate: draft.reviewDate, energy: draft.energy, focus: draft.focus, progress: draft.progress, note: draft.note, expectedRevision: draft.expectedRevision };
  const signature = JSON.stringify(payload);
  const requestId = previousAttempt?.signature === signature ? previousAttempt.requestId : newRequestId;
  return { signature, requestId, payload: { ...payload, requestId } };
}

export function resolveReviewSave({ responseOk, data, date }) {
  if (responseOk && ['saved', 'duplicate'].includes(data?.status) && validReview(data.review, date)) {
    return { state: 'saved', review: data.review };
  }
  if (data?.status === 'conflict' && validReview(data.review, date)) {
    return { state: 'conflict', review: data.review };
  }
  return { state: 'error', message: typeof data?.message === 'string' ? data.message : '저장을 확인하지 못했어요. 입력은 유지되어 있습니다. 다시 시도해 주세요.' };
}

export function reconcileReviewDraft(date, review, cached) {
  const base = review ? reviewToDraft(review) : blankReviewDraft(date);
  if (!cached || sameReviewAnswers(cached.draft, base)) {
    return { draft: base, attempt: null, recovered: false, conflict: null };
  }
  return {
    draft: cached.draft, attempt: cached.attempt, recovered: true,
    conflict: review && review.revision !== cached.draft.expectedRevision ? review : null,
  };
}

export function readReviewDraftCache(raw, date) {
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !validDraft(value.draft, date)) return null;
    const attempt = value.attempt?.signature === JSON.stringify({
      reviewDate: value.draft.reviewDate, energy: value.draft.energy, focus: value.draft.focus,
      progress: value.draft.progress, note: value.draft.note, expectedRevision: value.draft.expectedRevision,
    }) && typeof value.attempt?.requestId === 'string' ? value.attempt : null;
    return { draft: value.draft, attempt };
  } catch {
    return null;
  }
}
