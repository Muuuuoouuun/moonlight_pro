export function buildQuickTaskCapture({ id, raw } = {}) {
  const title = typeof raw === "string" ? raw.trim().slice(0, 300) : "";

  if (!title) {
    return { ok: false, reason: "empty-capture" };
  }

  return {
    ok: true,
    payload: {
      id,
      title,
      status: "inbox",
      priority: "medium",
      source: "quick-capture",
    },
  };
}

export function isDurableQuickTaskResult(result) {
  return result?.status === "saved" || result?.status === "duplicate";
}
