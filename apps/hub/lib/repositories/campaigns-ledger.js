// Campaigns ledger — backs the Hub Content → Campaigns war room list.
//
// Read: getCampaigns() maps `campaigns` rows to the display shape the existing
// war-room cards render (id/name/status/channels/progress/end/goal/current),
// same denormalized-display-model approach as revenue-ledger's leads/deals.
// Write: saveCampaign() mirrors persistRevenueRecord's status envelope
// (saved/preview/noop/error) so the route + client can share that contract.
//
// Backed by `campaigns` (supabase/schema.sql) + migration 0016 (`meta jsonb`,
// `updated_at`) for display fields the base columns don't carry yet.

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "../server-read.js";
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
  deleteSupabaseRecord,
} from "../server-write.js";

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"];

const STATUS_LABEL_BY_DB = {
  draft: "Draft",
  active: "Active",
  paused: "Planning",
  completed: "Done",
};

const STATUS_DB_BY_LABEL = {
  Draft: "draft",
  Active: "active",
  Planning: "paused",
  Done: "completed",
};

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function normalizeStatus(value, fallback = "draft") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return CAMPAIGN_STATUSES.includes(normalized) ? normalized : fallback;
}

// Display status label (war-room card) → DB `campaigns.status`. Accepts either
// a DB-shaped value ("active") or a display label ("Active"/"Planning") so the
// route can take payloads from either the create flow or the status-select PATCH.
export function statusToDb(value) {
  if (!value) return null;
  const asDb = normalizeStatus(value, "");
  if (asDb) return asDb;
  const byLabel = STATUS_DB_BY_LABEL[String(value)];
  return byLabel || null;
}

function statusLabel(status) {
  return STATUS_LABEL_BY_DB[status] || "Draft";
}

// Korean relative timestamp, matching crm-activities' formatRelative.
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

function formatEnd(value) {
  if (!value) return "미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(date);
}

function normalizeChannels(meta, channelColumn) {
  if (Array.isArray(meta?.channels) && meta.channels.length) {
    return meta.channels.filter(Boolean).map(String);
  }
  return channelColumn ? [channelColumn] : [];
}

function mapCampaign(row) {
  const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {};
  const status = normalizeStatus(row.status);

  return {
    id: row.id,
    name: row.name || "제목 없음",
    status: statusLabel(status),
    statusKey: status,
    channel: row.channel || null,
    channels: normalizeChannels(meta, row.channel),
    progress: Number.isFinite(meta.progress) ? Math.max(0, Math.min(100, Math.round(meta.progress))) : 0,
    goal: normalizeString(meta.goal, "목표 설정"),
    current: Number.isFinite(meta.current) ? Math.round(meta.current) : 0,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    end: formatEnd(row.end_date),
    at: formatRelative(row.updated_at || row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

// List campaigns for the war room. Honest empty/preview contract — no live
// Supabase config or workspace means `source: "preview"` with an empty list,
// never a silent mix of mock + live rows.
export async function getCampaigns({ workspaceId, limit = 50 } = {}) {
  const resolvedWorkspaceId = workspaceId || resolveDefaultWorkspaceId();

  if (!resolvedWorkspaceId) {
    return { source: "preview", configured: false, workspaceId: null, campaigns: [] };
  }

  if (!resolveSupabaseConfig()) {
    return { source: "preview", configured: false, workspaceId: resolvedWorkspaceId, campaigns: [] };
  }

  const rows = await fetchSupabaseRows("campaigns", {
    limit,
    order: "updated_at.desc",
    filters: withWorkspaceFilter(),
  });

  // Phase 0 분류: 구성된 환경의 read 실패는 error — preview는 미구성 전용(8차 안정성).
  if (!rows) {
    return { source: "error", error: "campaigns-read-failed", retryable: true, configured: true, workspaceId: resolvedWorkspaceId, campaigns: [] };
  }

  return {
    source: "supabase",
    configured: true,
    workspaceId: resolvedWorkspaceId,
    campaigns: rows.map(mapCampaign),
  };
}

// Build top-level columns + meta patch from a war-room payload. `undefined`
// fields are left untouched (so a status-only PATCH doesn't clobber name etc).
function buildCampaignWrite(payload = {}) {
  const columns = {};
  const metaPatch = {};

  if (payload.name !== undefined) {
    const name = normalizeString(payload.name);
    if (name) columns.name = name;
  }

  const status = statusToDb(payload.status);
  if (status) columns.status = status;

  if (payload.channel !== undefined) {
    columns.channel = normalizeString(payload.channel) || null;
  }
  if (payload.startDate !== undefined) {
    columns.start_date = payload.startDate || null;
  }
  if (payload.endDate !== undefined) {
    columns.end_date = payload.endDate || null;
  }

  if (Array.isArray(payload.channels)) {
    metaPatch.channels = payload.channels.filter(Boolean).map(String);
    if (!columns.channel) columns.channel = metaPatch.channels[0] || null;
  }
  if (payload.progress !== undefined) {
    const n = Number(payload.progress);
    metaPatch.progress = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  if (payload.goal !== undefined) {
    metaPatch.goal = normalizeString(payload.goal) || null;
  }
  if (payload.current !== undefined) {
    const n = Number(payload.current);
    metaPatch.current = Number.isFinite(n) ? Math.round(n) : 0;
  }

  return { columns, metaPatch };
}

async function readExistingMeta(id, workspaceId) {
  const rows = await fetchSupabaseRows("campaigns", {
    select: "meta",
    filters: [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    limit: 1,
  });
  const meta = Array.isArray(rows) && rows[0] ? rows[0].meta : null;
  return meta && typeof meta === "object" ? meta : {};
}

// create/update/delete envelope — mirrors persistRevenueRecord's contract:
// saved (persisted) / preview (config or workspace missing, caller keeps its
// optimistic row) / noop (nothing to change) / error (bad input).
export async function saveCampaign({ op = "create", id, payload = {} } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (op === "delete") {
    if (!id) return { status: "error", reason: "missing-id" };
    if (!workspaceId) return { status: "preview", reason: "missing-workspace" };
    const res = await deleteSupabaseRecord("campaigns", [
      ["id", eqFilter(id)],
      ["workspace_id", eqFilter(workspaceId)],
    ]);
    return res.persisted
      ? { status: "saved", id }
      : res.reason === "missing-config"
        ? { status: "preview", reason: res.reason, detail: res.detail }
        : { status: "failed", reason: res.reason, detail: res.detail }; // 라이브 거부는 preview가 아니다(Phase 0)
  }

  const { columns, metaPatch } = buildCampaignWrite(payload);
  const hasMeta = Object.keys(metaPatch).length > 0;

  if (op === "create") {
    if (!workspaceId) return { status: "preview", reason: "missing-workspace" };
    const timestamp = new Date().toISOString();
    const record = {
      name: normalizeString(payload.name, "새 캠페인"),
      channel: normalizeString(payload.channel) || (Array.isArray(payload.channels) ? payload.channels[0] : null) || "Email",
      status: statusToDb(payload.status) || "draft",
      start_date: payload.startDate || null,
      end_date: payload.endDate || null,
      workspace_id: workspaceId,
      meta: {
        channels: Array.isArray(payload.channels) ? payload.channels.filter(Boolean).map(String) : ["Email"],
        progress: Number.isFinite(Number(payload.progress)) ? Math.round(Number(payload.progress)) : 0,
        goal: normalizeString(payload.goal, "목표 설정"),
        current: Number.isFinite(Number(payload.current)) ? Math.round(Number(payload.current)) : 0,
      },
      updated_at: timestamp,
      ...columns,
    };
    const res = await insertSupabaseRecord("campaigns", record, { returnRepresentation: true, select: "*" });
    return res.persisted
      ? { status: "saved", id: res.id, campaign: res.record ? mapCampaign(res.record) : null }
      : { status: "preview", reason: res.reason, detail: res.detail };
  }

  // update
  if (!id) return { status: "error", reason: "missing-id" };
  if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

  const mergedMeta = hasMeta ? { ...(await readExistingMeta(id, workspaceId)), ...metaPatch } : null;
  const patch = {
    ...columns,
    ...(mergedMeta ? { meta: mergedMeta } : {}),
    updated_at: new Date().toISOString(),
  };
  if (!Object.keys(patch).length) return { status: "noop" };

  const res = await updateSupabaseRecord(
    "campaigns",
    [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    patch,
    { returnRepresentation: true, select: "*" },
  );
  return res.persisted
    ? { status: "saved", id, campaign: res.record ? mapCampaign(res.record) : null }
    : { status: "preview", reason: res.reason, detail: res.detail };
}
