import {
  fetchSupabaseRows,
  insertSupabaseRecord,
  updateSupabaseRecord,
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

export function resolveDefaultWorkspaceId() {
  return (
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
}

function eqFilter(value: string) {
  return `eq.${value}`;
}

export async function findIntegrationConnection(
  provider: string,
  workspaceId = resolveDefaultWorkspaceId(),
) {
  if (!workspaceId) {
    return null;
  }

  const rows = await fetchSupabaseRows("integration_connections", {
    select: "id,workspace_id,provider,status,config,last_synced_at,created_at",
    filters: [
      ["workspace_id", eqFilter(workspaceId)],
      ["provider", eqFilter(provider)],
    ],
    order: "created_at.desc",
    limit: 1,
  });

  return Array.isArray(rows) ? rows[0] || null : null;
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

  const existing = await findIntegrationConnection(input.provider, workspaceId);
  const record = {
    workspace_id: workspaceId,
    provider: input.provider,
    status: input.status,
    config: input.config || {},
    last_synced_at: input.lastSyncedAt || null,
  };

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
    connection: await findIntegrationConnection(input.provider, workspaceId),
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
