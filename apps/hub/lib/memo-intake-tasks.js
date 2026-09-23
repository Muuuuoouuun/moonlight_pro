import { isCanonicalUuid } from "./uuid.js";

export function createMemoIntake(data) {
  return {
    data,
    actions: data.actionItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      selected: true,
      status: "pending",
    })),
  };
}

export function restoreMemoIntake(value) {
  if (!value || !value.data || !Array.isArray(value.actions)) return null;
  const data = value.data;
  if (![data.title, data.summary, data.transcription].every((item) => typeof item === "string")
    || ![data.keyDecisions, data.suggestedTags].every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"))
    || (value.memoId !== undefined && !isCanonicalUuid(value.memoId))) return null;
  if (!value.actions.every((item) => isCanonicalUuid(item?.id)
    && typeof item.task === "string" && typeof item.selected === "boolean"
    && (item.suggestedDue == null || typeof item.suggestedDue === "string")
    && (item.projectId == null || typeof item.projectId === "string")
    && (item.error == null || typeof item.error === "string")
    && ["pending", "saved", "failed", "unknown"].includes(item.status)
    && (item.status === "pending" || item.command)
    && (!item.command || (item.command.id === item.id
      && [item.command.title, item.command.priority, item.command.description, item.command.source].every((field) => typeof field === "string")
      && (item.command.dueAt == null || typeof item.command.dueAt === "string")
      && (item.command.projectId == null || typeof item.command.projectId === "string"))))) return null;
  return value;
}

// Freeze every selected command before the first write. An interrupted request can
// then be replayed with the same ID and payload after a reload.
export function prepareMemoIntakeTasks(intake, memo) {
  return {
    ...intake,
    memoId: memo.id,
    actions: intake.actions.map((item) => !item.selected || item.command ? item : {
      ...item,
      command: {
        id: item.id,
        title: item.task,
        priority: item.priority || "medium",
        dueAt: item.suggestedDue || null,
        ...(item.projectId ? { projectId: item.projectId } : {}),
        description: `[AI 추출 메모: ${memo.id}]\n${memo.title || "메모"}\n${item.task}`,
        source: "memo-multimodal",
      },
    }),
  };
}

export function memoIntakeTaskSummary(intake) {
  const selected = intake?.actions.filter((item) => item.selected) || [];
  const saved = selected.filter((item) => item.status === "saved").length;
  return { total: selected.length, saved, remaining: selected.length - saved };
}

export async function saveMemoIntakeTasks(intake, fetchImpl = fetch, onProgress = () => {}) {
  let next = intake;
  function settle(id, patch) {
    next = { ...next, actions: next.actions.map((item) => item.id === id ? { ...item, ...patch } : item) };
    onProgress(next);
  }
  for (const item of intake.actions) {
    if (!item.selected || item.status === "saved") continue;
    if (!item.command || item.command.id !== item.id) {
      settle(item.id, { status: "failed", error: "등록할 내용을 확인하지 못했습니다. 원문과 후보를 유지했습니다." });
      continue;
    }
    // Persist this state before sending: a reload must not reset a potentially
    // completed write to a fresh command with a different identity.
    settle(item.id, { status: "unknown", error: "등록 결과 확인 필요" });
    try {
      const response = await fetchImpl("/api/hub/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.command),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => null);
      const task = data?.task || data?.entity;
      // PMS emits these statuses only after persistence or an exact duplicate
      // read. Preview, a bare 2xx, or a receipt for another task is not success.
      if (response.ok && ["saved", "duplicate"].includes(data?.status)
        && data.persisted !== false && data.persistence?.persisted !== false
        && task?.id === item.id) {
        settle(item.id, { status: "saved", error: null });
      } else if (data?.status === "preview" || ["invalid-input", "conflict"].includes(data?.status)
        || (response.status >= 400 && response.status < 500)) {
        settle(item.id, {
          status: "failed",
          error: data?.status === "preview"
            ? "할 일 저장이 연결되지 않았습니다. 연결 후 다시 등록하세요."
            : "할 일을 등록하지 못했습니다. 같은 내용으로 다시 확인하세요.",
        });
      } else {
        settle(item.id, { status: "unknown", error: "등록 응답을 확인하지 못했습니다. 같은 내용으로 다시 확인하세요." });
      }
    } catch {
      settle(item.id, { status: "unknown", error: "등록 응답을 확인하지 못했습니다. 같은 내용으로 다시 확인하세요." });
    }
  }
  return next;
}
