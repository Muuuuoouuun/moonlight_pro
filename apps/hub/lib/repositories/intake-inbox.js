// Intake Inbox — per-row review surface for `lead_intake_raw` staging rows.
//
// Today only aggregate counts exist (sheets-sync page): rows that land in
// `review`/`ignored` become invisible after upload. This repo exposes the raw
// staging rows themselves (business_card + google_sheets sources) so an
// operator can inspect, edit, promote, or reject them one at a time.
//
// Promotion itself is NOT reimplemented here — `promoteStagedLeads` in
// sheets-sync.js already owns the staging -> companies/leads dedupe logic and
// is reused as-is via the API route.

import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "@/lib/server-write";
import { computeMatchKey } from "@/lib/sheets-normalize";

const STAGING_TABLE = "lead_intake_raw";

// Korean relative timestamp — same helper pattern as crm-activities.js formatRelative,
// kept local so this repo has no cross-import beyond server-read/server-write.
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

// DB row -> display shape consumed by the Intake Inbox page.
function mapIntakeRow(row) {
  const n = row.normalized || {};
  return {
    id: row.id,
    source: row.source || "manual",
    status: row.status || "pending",
    name: n.name || null,
    contactName: n.contact_name || null,
    phone: n.phone || null,
    email: n.email || null,
    title: n.title || null,
    address: n.address || null,
    matchKey: row.match_key || n.match_key || null,
    note: row.note || null,
    createdAt: row.created_at || null,
    at: formatRelative(row.created_at),
    leadId: row.lead_id || null,
    companyId: row.company_id || null,
  };
}

// List staged intake rows for operator review. Never mixes mock data with
// live data — missing config/workspace returns an explicit `preview` source.
export async function listStagedIntake({
  workspaceId = resolveDefaultWorkspaceId(),
  status = null,
  source = null,
  limit = 100,
} = {}) {
  if (!workspaceId || !resolveSupabaseConfig()) return { source: "preview", rows: [] };

  const filters = [["workspace_id", eqFilter(workspaceId)]];
  if (status) filters.push(["status", eqFilter(status)]);
  if (source) filters.push(["source", eqFilter(source)]);

  const rows = await fetchSupabaseRows(STAGING_TABLE, {
    filters,
    order: "created_at.desc",
    limit,
  });
  // Phase 0 분류: 구성된 환경의 read 실패는 error — preview는 미구성 전용.
  if (!rows) return { source: "error", error: "intake-read-failed", retryable: true, rows: [] };

  return { source: "supabase", rows: rows.map(mapIntakeRow) };
}

// Reject one staged row — status -> 'ignored'. This is a terminal disposition;
// the row stays visible (not deleted) so the operator retains an audit trail.
export async function rejectStagedIntake({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  note = "운영자 거절",
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id) return { persisted: false, reason: "missing-id" };

  const res = await updateSupabaseRecord(
    STAGING_TABLE,
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    { status: "ignored", note },
    { returnRepresentation: true, select: "*" },
  );
  return res.persisted
    ? { persisted: true, row: res.record ? mapIntakeRow(res.record) : null }
    : { persisted: false, reason: res.reason, detail: res.detail };
}

async function readExistingRow(table, id, workspaceId) {
  const rows = await fetchSupabaseRows(table, {
    filters: [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    limit: 1,
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Edit a staged row's normalized fields before promotion (e.g. filling in a
// contact name/phone the vision extract missed). Merges onto the existing
// `normalized` jsonb — never clobbers sibling keys (source_ref, campaign, …) —
// and recomputes match_key so promoteStagedLeads can dedupe correctly. A
// 'review' row that gets edited becomes 'pending' again (promotable).
export async function updateStagedIntake({
  workspaceId = resolveDefaultWorkspaceId(),
  id,
  normalized = {},
} = {}) {
  if (!workspaceId) return { persisted: false, reason: "missing-workspace" };
  if (!id) return { persisted: false, reason: "missing-id" };

  const existing = await readExistingRow(STAGING_TABLE, id, workspaceId);
  if (!existing) return { persisted: false, reason: "not-found" };

  const mergedNormalized = { ...(existing.normalized || {}), ...normalized };
  mergedNormalized.match_key = computeMatchKey({
    phone: mergedNormalized.phone,
    name: mergedNormalized.name,
    address: mergedNormalized.address,
  });

  const patch = {
    normalized: mergedNormalized,
    match_key: mergedNormalized.match_key,
  };
  if (existing.status === "review") {
    patch.status = "pending";
  }

  const res = await updateSupabaseRecord(
    STAGING_TABLE,
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    patch,
    { returnRepresentation: true, select: "*" },
  );
  return res.persisted
    ? { persisted: true, row: res.record ? mapIntakeRow(res.record) : null }
    : { persisted: false, reason: res.reason, detail: res.detail };
}
