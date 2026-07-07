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
  updateSupabaseRecord,
} from "@/lib/server-write";

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
  if (!hasLiveResult) return { source: "preview", activities: [] };

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
