// "AI는 끝냈고 내가 볼 것" — 로컬 스킬 receipt가 completed인데 연결된 할 일이 아직
// done이 아닌 것만 모은다(마이그레이션 0047 local_skill_requests 위의 읽기 전용 뷰).
// 자동 완료·자동 생성 금지 — 여기는 목록만 만든다. 운영자가 할 일을 직접 완료한다.
// 문서: docs/superpowers/specs/2026-09-26-open-ai-tools-borrowed-concepts-plan.md §4 11-2.
import { skillRequestService } from "@/lib/skill-requests.js";
import { getTaskLedger } from "./operating-ledger.js";

const ACTOR_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "claude-desktop": "Claude Desktop",
};

export function actorLabel(actorId) {
  if (!actorId) return "알 수 없음";
  return ACTOR_LABELS[actorId] || actorId;
}

// Pure. requests: local_skill_request_list_v1의 items(요청 객체 배열).
// taskById: Map<taskId, { title, status }> — /api/hub/tasks가 읽는 할 일 상태
// (inbox·todo·doing·blocked·done)와 같은 값이다. 범위는 completed 하나뿐이다 —
// unconfirmed·failed는 이 묶음이 아니다(운영자 확정 범위).
export function filterReviewWaiting(requests, taskById) {
  if (!Array.isArray(requests)) return [];
  const items = [];
  for (const request of requests) {
    if (!request || request.state !== "completed") continue;
    const task = taskById?.get ? taskById.get(request.taskId) : taskById?.[request.taskId];
    // 연결된 할 일을 찾지 못하면(읽기 범위 밖·삭제됨) "아직 안 끝남"을 추측하지 않고 뺀다.
    if (!task || task.status === "done") continue;
    const receipt = request.receipt && typeof request.receipt === "object" ? request.receipt : {};
    const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : [];
    items.push({
      requestId: request.requestId,
      taskId: request.taskId,
      taskTitle: task.title || "",
      scope: request.scope,
      summary: typeof receipt.summary === "string" ? receipt.summary : "",
      evidence: evidence[0] || null,
      actorId: request.receiptActorId || null,
      completedAt: request.receiptAt || null,
    });
  }
  return items;
}

// listRequests·readTasks는 테스트가 실제 Supabase 클라이언트 없이 봉투 분기를
// 주입할 수 있도록 둔 훅이다(office-usage.js의 fetchRows 선례) — 운영 경로는 기본값 그대로 쓴다.
export async function getReviewWaitingLedger({
  limit = 50,
  listRequests = (opts) => skillRequestService.list(opts),
  readTasks = getTaskLedger,
} = {}) {
  const [listResult, taskLedger] = await Promise.all([
    listRequests({ limit }),
    readTasks(),
  ]);
  const listData = listResult.data || {};

  // skill-requests.js의 read 계약: 저장소 미구성은 get/list에서 status:'error' +
  // error:'skill-storage-not-configured'로 온다(create의 202/preview와 다른 어휘).
  // 여기서는 그 코드를 preview로 다시 읽는다 — "연결 필요"이지 실제 읽기 실패가 아니다.
  const storageUnconfigured = listData.error === "skill-storage-not-configured";
  if (storageUnconfigured || taskLedger.source === "preview") {
    return { source: "preview", configured: false, items: [] };
  }
  if (listData.status !== "ready" || !Array.isArray(listData.items) || taskLedger.source === "error") {
    return {
      source: "error",
      configured: true,
      error: listData.status !== "ready" ? listData.error || "skill-request-list-failed" : "task-ledger-read-failed",
      items: [],
    };
  }

  const taskById = new Map(taskLedger.todos.map((task) => [task.id, { title: task.title, status: task.status }]));
  return {
    source: "supabase",
    configured: true,
    partial: Boolean(taskLedger.partial),
    items: filterReviewWaiting(listData.items, taskById),
  };
}
