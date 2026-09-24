const QUICK_CAPTURE_HINTS = new Set(["task", "inbox"]);

export function buildQuickCapture({ id, raw, hint = "task" } = {}) {
  const text = typeof raw === "string" ? raw.trim() : "";

  if (!text) {
    return { ok: false, reason: "empty-capture" };
  }
  if (text.length > 4000) {
    return { ok: false, reason: "capture-too-long" };
  }
  if (!QUICK_CAPTURE_HINTS.has(hint)) {
    return { ok: false, reason: "invalid-hint" };
  }

  return {
    ok: true,
    payload: {
      raw: text,
      hint,
      idempotencyKey: id,
    },
  };
}

export function isDurableQuickCaptureResult(result) {
  return result?.status === "saved" || result?.status === "duplicate";
}

export const buildQuickTaskCapture = (input) => buildQuickCapture({ ...input, hint: "task" });
export const isDurableQuickTaskResult = isDurableQuickCaptureResult;

// React keeps an immutable draft object. Any edit after submission creates a new
// object, even if the operator types the same text again for the next task.
export function clearSubmittedQuickTaskDraft(current, submitted) {
  return current === submitted ? { ...current, title: '', dueAt: '', priority: 'medium' } : current;
}

export function shouldSubmitQuickTask(event, saving = false) {
  const native = event?.nativeEvent || event;
  return Boolean(event?.key === 'Enter' && !saving && !event.defaultPrevented && !event.repeat && !event.isComposing && !native?.isComposing && event.keyCode !== 229 && native?.keyCode !== 229);
}

// The shell owns the global session; the popup only subscribes while open.
// This keeps an unresolved request and its draft together without persisting
// personal capture text in browser storage or changing the existing API.
export function createQuickCaptureSession({ initialRaw = '', initialHint = 'task', createId } = {}) {
  let state = { raw: typeof initialRaw === 'string' ? initialRaw : '', hint: QUICK_CAPTURE_HINTS.has(initialHint) ? initialHint : 'task', requestId: createId(), status: 'idle', error: null, destinationType: null, duplicate: false };
  let lastAttempt = null;
  const listeners = new Set();
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  return {
    snapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    canClose: () => state.status !== 'saving',
    setRaw(raw) {
      if (state.status === 'saving' || raw === state.raw) return;
      publish({ raw, status: 'idle', error: null });
    },
    setHint(hint) {
      if (state.status === 'saving' || hint === state.hint || !QUICK_CAPTURE_HINTS.has(hint)) return;
      publish({ hint, status: 'idle', error: null });
    },
    begin() {
      if (state.status === 'saving') return { ok: false, reason: 'saving' };
      const capture = buildQuickCapture({ id: state.requestId, raw: state.raw, hint: state.hint });
      if (!capture.ok) { publish({ status: 'error', error: '할 일을 한 줄로 입력하세요.' }); return capture; }
      // Edits may return to the same normalized payload after a lost response.
      // Rotate its receipt key only when actually submitting a different payload.
      if (lastAttempt) {
        capture.payload.idempotencyKey = capture.payload.raw === lastAttempt.raw && capture.payload.hint === lastAttempt.hint
          ? lastAttempt.idempotencyKey : createId();
      }
      lastAttempt = { ...capture.payload };
      publish({ status: 'saving', error: null, requestId: capture.payload.idempotencyKey });
      return capture;
    },
    settle({ ok, data, error }) {
      if (state.status !== 'saving') return false;
      if (ok && isDurableQuickCaptureResult(data)) {
        lastAttempt = null;
        publish({ raw: '', requestId: createId(), status: 'saved', error: null, destinationType: data.destinationType, duplicate: data.status === 'duplicate' });
        return true;
      }
      publish({ status: 'error', error: error || data?.error || data?.status || '저장에 실패했습니다. 같은 입력으로 다시 시도하세요.' });
      return false;
    },
  };
}
