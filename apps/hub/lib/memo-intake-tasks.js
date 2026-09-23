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

// AI 후보 한 줄에서 할 일 한 건을 만드는 화면(메모 액션 추출·메모 패턴 분석·할 일 분해)의 공용 경로.
// 명령은 첫 등록 시도 전에 한 번만 굳히고 재시도는 같은 id·같은 payload를 다시 보낸다 — 엔진은
// 같은 id를 duplicate(=이미 저장됨)로 돌려주므로 재시도가 중복 할 일을 만들지 않는다. 이미 굳힌
// 후보는 그대로 돌려준다(도중에 연결이 바뀌어 같은 id의 payload가 달라지면 엔진이 conflict로 거절한다).
export function freezeTaskCommand(item, fields = {}) {
  if (item.command) return item;
  return {
    ...item,
    command: {
      projectId: null, priority: "medium", dueAt: null, description: null, source: "manual",
      ...fields,
      id: item.id, title: item.task,
    },
  };
}

// 저장 판정은 saveMemoIntakeTasks가 소유한다: saved/duplicate + 같은 id + persisted!==false일 때만
// saved. 202 preview·빈 2xx·다른 id 영수증은 저장이 아니다. 기록기는 preview를 failed로 접으므로
// 봉투만 따로 읽어 "연결 전"과 "실패"를 가른다.
// 반환 status: saved | preview | failed | unknown(응답 확인 불가 — 같은 id로 재확인).
export async function saveTaskCommand(command, fetchImpl = fetch) {
  let envelope = null;
  const observed = async (url, init) => {
    const response = await fetchImpl(url, init);
    envelope = await response.clone().json().catch(() => null);
    return response;
  };
  const result = await saveMemoIntakeTasks({ actions: [{ id: command?.id, task: command?.title, selected: true, status: "pending", command }] }, observed);
  const item = result.actions[0];
  if (item.status === "saved") return { status: "saved", error: null };
  if (envelope?.status === "preview") return { status: "preview", error: item.error || "할 일 저장이 연결되지 않았습니다. 연결 후 다시 등록하세요." };
  return { status: item.status === "failed" ? "failed" : "unknown", error: item.error || "등록 응답을 확인하지 못했습니다. 같은 내용으로 다시 확인하세요." };
}

// saveTaskCommand 결과의 화면 표기(§5.3 source truth). unknown은 실패가 아니라 "확인 필요"라
// danger가 아닌 중립 partial로 그리고, 재시도 버튼은 "같은 내용으로 확인"이다.
export const TASK_OUTCOME = {
  preview: { truth: "preview", label: "Preview · 저장되지 않음", retry: "다시 등록" },
  failed: { truth: "error", label: "등록 실패", retry: "다시 등록" },
  unknown: { truth: "partial", label: "결과 확인 필요", retry: "같은 내용으로 확인" },
};
