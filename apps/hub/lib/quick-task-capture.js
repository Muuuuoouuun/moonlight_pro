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
