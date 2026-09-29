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
      // preview = 백엔드 미설정이라 저장되지 않았다(DESIGN.md §8.1 Save envelope). 실패와도 다르고
      // 저장과도 다르다 — 초안과 재시도 키를 그대로 두고 "Preview · 연결 필요"로 말하게 한다.
      if (data?.status === 'preview') {
        publish({ status: 'preview', error: null });
        return false;
      }
      publish({ status: 'error', error: error || data?.error || data?.status || '저장에 실패했습니다. 같은 입력으로 다시 시도하세요.' });
      return false;
    },
  };
}

export const QUICK_CAPTURE_ENDPOINT = "/api/hub/inbox";
export const QUICK_CAPTURE_TIMEOUT_MS = 20000;
export const QUICK_CAPTURE_LOST_RESPONSE = '저장 응답을 확인하지 못했습니다. 입력을 보관했으니 같은 요청으로 다시 시도하세요.';

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';

// 빠른 입력 한 번의 왕복: session.begin → POST /api/hub/inbox → session.settle.
// 전역 빠른 입력(quick-capture.jsx)과 데스크톱 위젯(quick-widget.jsx)이 같이 쓴다 — 멱등 키 회전,
// 20초 제한, 응답 유실 문구가 두 곳에서 갈라지지 않게 한 곳에 둔다.
// 반환: { started } — begin이 거절했으면 false. { durable } — saved/duplicate일 때만 true.
export async function submitQuickCapture(session, { fetchImpl = globalThis.fetch, timeoutMs = QUICK_CAPTURE_TIMEOUT_MS } = {}) {
  const capture = session.begin();
  if (!capture.ok) return { started: false, durable: false };
  try {
    const response = await fetchImpl(QUICK_CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capture.payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(error => { if (isTimeout(error)) throw error; return {}; });
    const durable = session.settle({
      ok: response.ok,
      data,
      error: !response.ok && !data.error && !data.status ? `저장 실패 (${response.status})` : null,
    });
    return { started: true, durable };
  } catch (error) {
    session.settle({ ok: false, error: isTimeout(error) ? QUICK_CAPTURE_LOST_RESPONSE : error instanceof Error ? error.message : null });
    return { started: true, durable: false };
  }
}
