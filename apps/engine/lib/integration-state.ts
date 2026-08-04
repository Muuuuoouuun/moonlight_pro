import { eqFilter, resolveDefaultWorkspaceId } from "@com-moon/supabase-rest";

import {
  fetchSupabaseRows,
  insertSupabaseRecord,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "./supabase-rest";

type IntegrationStatus = "pending" | "connected" | "error" | "disabled";
type SyncRunStatus = "queued" | "running" | "success" | "failure";

interface IntegrationConnectionInput {
  provider: string;
  status: IntegrationStatus;
  config?: Record<string, unknown>;
  lastSyncedAt?: string | null;
}

interface SyncRunInput {
  provider: string;
  connectionId?: string | null;
  status: SyncRunStatus;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
}

export { resolveDefaultWorkspaceId };

const CONNECTION_SELECT = "id,workspace_id,provider,status,config,last_synced_at,created_at";

export async function findIntegrationConnection(
  provider: string,
  workspaceId = resolveDefaultWorkspaceId(),
) {
  if (!workspaceId) {
    return null;
  }

  const rows = await fetchSupabaseRows("integration_connections", {
    select: CONNECTION_SELECT,
    filters: [
      ["workspace_id", eqFilter(workspaceId)],
      ["provider", eqFilter(provider)],
    ],
    order: "created_at.desc",
    limit: 1,
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

// Missing-constraint marker (42P10) — raised until migration 0018's
// unique (workspace_id, provider) lands; we then take the legacy 3-call path.
function isMissingOnConflictTarget(result: { reason?: string; detail?: string }) {
  return typeof result.detail === "string" && result.detail.includes("42P10");
}

async function legacyUpsertIntegrationConnection(
  workspaceId: string,
  record: Record<string, unknown>,
  provider: string,
) {
  const existing = await findIntegrationConnection(provider, workspaceId);

  const persistence = existing?.id
    ? await updateSupabaseRecord(
        "integration_connections",
        [
          ["id", eqFilter(existing.id)],
          ["workspace_id", eqFilter(workspaceId)],
        ],
        record,
      )
    : await insertSupabaseRecord("integration_connections", record);

  return {
    ...persistence,
    connection: await findIntegrationConnection(provider, workspaceId),
  };
}

export async function upsertIntegrationConnection(input: IntegrationConnectionInput) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      persisted: false,
      reason: "missing-workspace",
      connection: null,
    };
  }

  const record = {
    workspace_id: workspaceId,
    provider: input.provider,
    status: input.status,
    config: input.config || {},
    last_synced_at: input.lastSyncedAt || null,
  };

  // One round trip: INSERT ... ON CONFLICT (workspace_id, provider) DO UPDATE.
  const result = await upsertSupabaseRecords("integration_connections", record, {
    onConflict: "workspace_id,provider",
    returnRepresentation: true,
    select: CONNECTION_SELECT,
  });

  if (!result.persisted && isMissingOnConflictTarget(result)) {
    return legacyUpsertIntegrationConnection(workspaceId, record, input.provider);
  }

  return {
    persisted: result.persisted,
    reason: result.reason,
    ...(result.detail ? { detail: result.detail } : {}),
    connection: result.record || null,
  };
}

export async function insertIntegrationSyncRun(input: SyncRunInput) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      persisted: false,
      reason: "missing-workspace",
    };
  }

  return insertSupabaseRecord("sync_runs", {
    workspace_id: workspaceId,
    connection_id: input.connectionId || null,
    status: input.status,
    payload: {
      provider: input.provider,
      ...(input.payload || {}),
    },
    error_message: input.errorMessage || null,
    started_at: new Date().toISOString(),
    finished_at: input.status === "queued" || input.status === "running" ? null : new Date().toISOString(),
  });
}
