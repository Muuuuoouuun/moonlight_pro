// CRM activity timeline ledger — the durable interaction log per lead/deal/account.
//
// Write: recordActivity (operator logs 통화/미팅/설명회/데모/방문/이메일/소식/노트).
// Read:  getActivitiesFor (Account/Lead detail pulls its timeline).
// Mutate: setActivityPinned (pin a note), deleteActivity.
// Backed by migration 0014 `crm_activities`.

import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import {
  deleteSupabaseRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { CONTACT_KINDS, activityToOutcomeAction } from "@/lib/sales-os/followup-scoring";

// 0016 CHECK와 동일한 12종 — 이전에는 9종이라 kakao/quote/ai가 "update"로 접혀 저장됐다.
export const ACTIVITY_KINDS = new Set([
  "call",
  "meeting",
  "info_session",
  "demo",
  "visit",
  "email",
  "update",
  "note",
  "deal",
  "kakao",
  "quote",
  "ai",
]);

const ENTITY_TYPES = new Set(["lead", "deal", "account"]);

function normalizeKind(value) {
  const v = String(value || "update").toLowerCase();
  return ACTIVITY_KINDS.has(v) ? v : "update";
}

function normalizeEntityType(value, { leadId, dealId }) {
  const v = String(value || "").toLowerCase();
  if (ENTITY_TYPES.has(v)) return v;
  if (leadId) return "lead";
  if (dealId) return "deal";
  return "account";
}

// Korean relative timestamp matching the rest of the Revenue surface (방금 / N분 전 / N일 전).
function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms < 60_000) return "방금";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return date.toISOString().slice(0, 10);
}

function mapActivity(row) {
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    body: row.body || "",
    pinned: Boolean(row.pinned),
    entityType: row.entity_type || "account",
    occurredAt: row.occurred_at || row.created_at,
    at: formatRelative(row.occurred_at || row.created_at),
    who: row.owner_id ? "Me" : "Me",
  };
}

function activityTime(row) {
  const t = new Date(row.occurred_at || row.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Log one interaction. entityType is inferred from which id is set when not explicit.
export async function recordActivity({
  workspaceId = resolveDefaultWorkspaceId(),
  leadId = null,
  dealId = null,
  accountId = null,
  companyId = null,
  entityType = null,
  kind = "update",
  body = "",
  pinned = false,
  ownerId = null,
  occurredAt = null,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!leadId && !dealId && !accountId) {
    return { persisted: false, reason: "missing-entity" };
  }

  const res = await insertSupabaseRecord(
    "crm_activities",
    {
      workspace_id: workspaceId,
      lead_id: leadId || null,
      deal_id: dealId || null,
      account_id: accountId || null,
      company_id: companyId || null,
      entity_type: normalizeEntityType(entityType, { leadId, dealId }),
      kind: normalizeKind(kind),
      body: String(body || "").trim(),
      pinned: Boolean(pinned),
      owner_id: ownerId || null,
      occurred_at: occurredAt || new Date().toISOString(),
    },
    { returnRepresentation: true, select: "*" },
  );

  if (!res.persisted) return { persisted: false, reason: res.reason, detail: res.detail };
  return { persisted: true, id: res.id, activity: res.record ? mapActivity(res.record) : null };
}

// Timeline for one entity (account/lead/deal). Newest first.
export async function getActivitiesFor({
  workspaceId = resolveDefaultWorkspaceId(),
  accountId = null,
  leadId = null,
  dealId = null,
  companyId = null,
  limit = 100,
} = {}) {
  if (!workspaceId) return { source: "preview", activities: [] };
  if (!accountId && !leadId && !dealId && !companyId) return { source: "preview", activities: [] };

  const scopes = [
    accountId ? ["account_id", accountId] : null,
    leadId ? ["lead_id", leadId] : null,
    dealId ? ["deal_id", dealId] : null,
    companyId ? ["company_id", companyId] : null,
  ].filter(Boolean);

  const results = await Promise.all(scopes.map(([key, value]) => fetchSupabaseRows("crm_activities", {
    filters: [["workspace_id", eqFilter(workspaceId)], [key, eqFilter(value)]],
    order: "occurred_at.desc",
    limit,
  })));

  let hasLiveResult = false;
  const byId = new Map();
  for (const rows of results) {
    if (!Array.isArray(rows)) continue;
    hasLiveResult = true;
    for (const row of rows) byId.set(row.id, row);
  }
  // Phase 0 분류: 전 스코프 read 실패는 구성돼 있으면 error — preview는 미구성 전용.
  if (!hasLiveResult) {
    return resolveSupabaseConfig()
      ? { source: "error", error: "crm-activities-read-failed", retryable: true, activities: [] }
      : { source: "preview", activities: [] };
  }

  const rows = Array.from(byId.values())
    .sort((a, b) => activityTime(b) - activityTime(a))
    .slice(0, limit);

  return { source: "supabase", activities: rows.map(mapActivity) };
}

export async function setActivityPinned({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  pinned,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id) return { persisted: false, reason: "missing-id" };

  const res = await updateSupabaseRecord(
    "crm_activities",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    { pinned: Boolean(pinned) },
    { returnRepresentation: true, select: "*" },
  );
  return res.persisted
    ? { persisted: true, activity: res.record ? mapActivity(res.record) : null }
    : { persisted: false, reason: res.reason, detail: res.detail };
}

export async function deleteActivity({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id) return { persisted: false, reason: "missing-id" };

  const res = await deleteSupabaseRecord("crm_activities", [
    ["id", eqFilter(id)],
    ["workspace_id", eqFilter(workspaceId)],
  ]);
  return res.persisted ? { persisted: true, id } : { persisted: false, reason: res.reason };
}

// ── 최근 활동 읽기 (2026-09-21 0a) ─────────────────────────────────────────────────
// 큐(followups-ledger)·주간 리포트·컨텍스트 어셈블러가 연락 기록을 읽는 단일 원천.
// 이전에는 셋 다 outreach_outcomes를 읽었는데 그 테이블의 UI writer는 0이라 앱에서 남긴
// 기록이 주간 "연락 N건"과 큐 boost에 한 번도 도달하지 않았다.
function mapRecentActivity(row) {
  return {
    id: row.id,
    kind: String(row.kind || "update").toLowerCase(),
    reaction: row.reaction || null,
    body: row.body || "",
    leadId: row.lead_id || null,
    dealId: row.deal_id || null,
    accountId: row.account_id || null,
    companyId: row.company_id || null,
    contactId: row.contact_id || null,
    occurredAt: row.occurred_at || row.created_at || null,
  };
}

// 최신순. since(ISO) 이후만. read 실패는 null — 호출측이 failedSources로 명명한다.
export async function listRecentActivities({
  workspaceId = resolveDefaultWorkspaceId(),
  since = null,
  limit = 500,
} = {}) {
  if (!workspaceId) return null;
  const rows = await fetchSupabaseRows("crm_activities", {
    select: "id,kind,reaction,body,lead_id,deal_id,account_id,company_id,contact_id,occurred_at,created_at",
    filters: [
      ["workspace_id", eqFilter(workspaceId)],
      ...(since ? [["occurred_at", `gte.${since}`]] : []),
    ],
    order: "occurred_at.desc",
    limit,
  });
  if (!Array.isArray(rows)) return null;
  return rows.map(mapRecentActivity);
}

// context-assembler용 — 예전 getRecentOutcomes와 같은 봉투·필드명(normalizeOutcome 호환).
// 대화가 아닌 기록은 제외하고, action은 outreach 어휘로 접는다.
export async function getRecentContactActivities({
  workspaceId = resolveDefaultWorkspaceId(),
  limit = 30,
} = {}) {
  if (!workspaceId || !resolveSupabaseConfig()) return { source: "preview", outcomes: [] };
  const rows = await listRecentActivities({ workspaceId, limit: Math.max(limit, 100) });
  if (!rows) return { source: "error", error: "crm-activities-read-failed", retryable: true, outcomes: [] };
  return {
    source: "supabase",
    outcomes: rows
      .filter((a) => CONTACT_KINDS.has(a.kind))
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        leadId: a.leadId,
        dealId: a.dealId,
        companyId: a.companyId,
        play: null,
        assetId: null,
        channel: a.kind,
        action: activityToOutcomeAction(a),
        note: a.body,
        meta: { reaction: a.reaction },
        occurredAt: a.occurredAt,
      })),
  };
}
