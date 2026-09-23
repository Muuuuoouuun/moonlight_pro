// 자동화 실행 기록 — 크론(followup-autopilot·content-flywheel)이 매 실행을 `automation_runs`에
// 남긴다. 2026-09-03 성장 기획서 F-0 / CEO 리뷰 R-2: 두 크론이 몇 주간 매일 실패했는데
// `agent_runs(result='error')`만 남고 자동화 화면에는 아무것도 없었다. 자동화 화면은
// `automation_runs`(+`automations`)만 읽으므로 여기 쓰지 않으면 실패는 침묵한다.
//
// 자동화 행(`automations`)은 `meta.key`로 찾고 없으면 만든다 — 크론마다 안정된 키 하나.
// `aggregateRuns`가 automation_id 없는 실행을 세지 않기 때문에 행이 반드시 있어야 한다.

import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import { insertSupabaseRecord, resolveDefaultWorkspaceId, updateSupabaseRecord } from "@/lib/server-write";

const RUN_STATUSES = new Set(["queued", "running", "success", "failure", "ignored"]);

function normalizeStatus(value) {
  const v = String(value || "").toLowerCase();
  return RUN_STATUSES.has(v) ? v : "failure";
}

function compactError(value) {
  if (!value) return null;
  const text = value instanceof Error ? value.message : String(value);
  return text.trim().slice(0, 500) || null;
}

// 키로 자동화 행을 찾고, 없으면 active로 만든다. 읽기 실패(null)는 만들지 않고 null을 돌려
// 실행 기록이 automation_id 없이라도 남게 한다(행 생성보다 실행 기록이 먼저다).
export async function ensureAutomation({
  workspaceId = resolveDefaultWorkspaceId(),
  key,
  name,
  deps = { fetchSupabaseRows, insertSupabaseRecord },
} = {}) {
  if (!workspaceId || !key) return null;
  const rows = await deps.fetchSupabaseRows("automations", {
    select: "id,name,status,meta",
    // 호출자가 준 workspaceId로 명시 필터 — withWorkspaceFilter는 env 기본값을 읽어 크론 밖
    // (테스트·다른 workspace)에서 필터를 떨어뜨릴 수 있다.
    filters: [["workspace_id", eqFilter(workspaceId)], ["meta->>key", eqFilter(key)]],
    limit: 1,
  });
  if (rows === null) return null;
  if (rows[0]?.id) return rows[0].id;

  const inserted = await deps.insertSupabaseRecord("automations", {
    workspace_id: workspaceId,
    name: name || key,
    status: "active",
    meta: { key, source: "cron" },
  });
  return inserted?.persisted && inserted.id ? inserted.id : null;
}

// 한 번의 크론 실행을 기록한다. 성공/실패 판정은 호출자가 한다 — 여기서는 사실만 남긴다.
export async function recordAutomationRun({
  workspaceId = resolveDefaultWorkspaceId(),
  key,
  name,
  status = "success",
  correlationId = null,
  input = {},
  output = {},
  errorMessage = null,
  startedAt = null,
  deps = { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord },
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!key) return { persisted: false, reason: "missing-key" };

  const automationId = await ensureAutomation({ workspaceId, key, name, deps });
  const finishedAt = new Date().toISOString();
  const normalizedStatus = normalizeStatus(status);
  const inserted = await deps.insertSupabaseRecord("automation_runs", {
    workspace_id: workspaceId,
    automation_id: automationId,
    status: normalizedStatus,
    correlation_id: correlationId || `${key}:${finishedAt}`,
    input_payload: input && typeof input === "object" ? input : {},
    output_payload: {
      ...(output && typeof output === "object" ? output : {}),
      summary: output?.summary || (normalizedStatus === "success" ? `${name || key} 실행 완료` : `${name || key} 실패`),
      key,
    },
    error_message: compactError(errorMessage),
    ...(startedAt ? { created_at: startedAt } : {}),
    finished_at: finishedAt,
  });

  if (inserted?.persisted && automationId) {
    // last_run_at은 자동화 목록의 "마지막 실행" 열 — 실패해도 실행은 실행이다.
    await deps.updateSupabaseRecord(
      "automations",
      [["id", eqFilter(automationId)], ["workspace_id", eqFilter(workspaceId)]],
      { last_run_at: finishedAt, updated_at: finishedAt },
    );
  }

  return {
    persisted: Boolean(inserted?.persisted),
    reason: inserted?.persisted ? "ok" : inserted?.reason || "insert-failed",
    automationId,
    status: normalizedStatus,
  };
}
