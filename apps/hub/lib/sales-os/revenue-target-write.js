// 월별 매출 목표 쓰기 — workspaces.meta.revenue_targets(마이그레이션 없음, workspaces.meta는
// 20260420_0001에서 이미 jsonb로 존재). deals/leads처럼 workspace_id 컬럼을 갖지 않는 테이블
// 자체를 patch하므로 lib/sales-os/revenue-write.js의 persistRevenueRecord를 재사용하지 않고
// 같은 안전-병합 패턴(기존 meta 읽고 얕게 병합)을 직접 구현한다.

import { eqFilter, fetchSupabaseRows } from "../server-read.js";
import { resolveDefaultWorkspaceId, updateSupabaseRecord } from "../server-write.js";
import { isValidMonthKey, normalizeTargetAmount } from "../revenue-target.js";

export async function saveRevenueTarget({ month, amount }) {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

  if (!isValidMonthKey(month)) return { status: "error", reason: "invalid-month" };

  // amount === null은 그 달 목표를 지운다(운영자가 되돌릴 수 있는 편의 — UI는 현재 설정만
  // 노출하지만 API 계약은 처음부터 삭제를 허용해 둔다).
  const normalizedAmount = amount === null ? null : normalizeTargetAmount(amount);
  if (amount !== null && normalizedAmount === null) return { status: "error", reason: "invalid-amount" };

  const rows = await fetchSupabaseRows("workspaces", {
    select: "meta",
    filters: [["id", eqFilter(workspaceId)]],
    limit: 1,
  });
  if (!Array.isArray(rows)) {
    // 기준 meta를 못 읽었으면 저장을 중단한다 — 빈 meta 위에 덮어쓰면 다른 워크스페이스
    // 설정을 무언으로 지운다(revenue-write.js의 meta-read-failed와 같은 원칙).
    return { status: "failed", reason: "meta-read-failed", detail: "workspace meta unreadable; save aborted to avoid wiping sibling keys" };
  }

  const existingMeta = rows[0]?.meta && typeof rows[0].meta === "object" ? rows[0].meta : {};
  const existingTargets = existingMeta.revenue_targets && typeof existingMeta.revenue_targets === "object"
    ? existingMeta.revenue_targets
    : {};
  const nextTargets = { ...existingTargets };
  if (normalizedAmount === null) delete nextTargets[month];
  else nextTargets[month] = normalizedAmount;
  const mergedMeta = { ...existingMeta, revenue_targets: nextTargets };

  const res = await updateSupabaseRecord(
    "workspaces",
    [["id", eqFilter(workspaceId)]],
    { meta: mergedMeta },
    { returnRepresentation: true, select: "meta" },
  );
  if (!res.persisted) {
    return res.reason === "missing-config"
      ? { status: "preview", reason: res.reason, detail: res.detail }
      : { status: "failed", reason: res.reason, detail: res.detail };
  }
  return { status: "saved", month, amount: normalizedAmount, targets: nextTargets };
}
