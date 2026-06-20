import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "./integration-state";
import { fetchSupabaseRows, insertSupabaseRecord } from "./supabase-rest";

type NotionDatabaseKind = "projects" | "tasks" | "decisions" | "notes";

interface NotionDatabaseConfig {
  kind: NotionDatabaseKind;
  databaseId: string;
  targetTable: string;
}

interface NotionApiResult<T> {
  ok: boolean;
  status: number | null;
  data: T | null;
  error?: string;
}

interface NotionDatabase {
  id?: string;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { type?: string }>;
}

interface NotionQueryResponse {
  results?: unknown[];
  has_more?: boolean;
}

function resolveNotionToken() {
  return process.env.NOTION_TOKEN?.trim() || "";
}

function resolveNotionApiBaseUrl() {
  return (process.env.NOTION_API_BASE_URL?.trim() || "https://api.notion.com/v1").replace(/\/$/, "");
}

function resolveNotionVersion() {
  return process.env.NOTION_VERSION?.trim() || "2022-06-28";
}

function databaseConfigs(): NotionDatabaseConfig[] {
  return [
    {
      kind: "projects",
      databaseId: process.env.NOTION_PROJECTS_DATABASE_ID?.trim() || "",
      targetTable: "projects",
    },
    {
      kind: "tasks",
      databaseId: process.env.NOTION_TASKS_DATABASE_ID?.trim() || "",
      targetTable: "tasks",
    },
    {
      kind: "decisions",
      databaseId: process.env.NOTION_DECISIONS_DATABASE_ID?.trim() || "",
      targetTable: "decisions",
    },
    {
      kind: "notes",
      databaseId: process.env.NOTION_NOTES_DATABASE_ID?.trim() || "",
      targetTable: "notes",
    },
  ];
}

export function getNotionIntegrationStatus() {
  const tokenConfigured = Boolean(resolveNotionToken());
  const databases = databaseConfigs().map((database) => ({
    kind: database.kind,
    targetTable: database.targetTable,
    configured: Boolean(database.databaseId),
  }));
  const requiredReady = tokenConfigured && databases
    .filter((database) => database.kind === "projects" || database.kind === "tasks")
    .every((database) => database.configured);

  return {
    configured: requiredReady,
    tokenConfigured,
    apiBaseUrl: resolveNotionApiBaseUrl(),
    version: resolveNotionVersion(),
    databases,
  };
}

function makeNotionHeaders() {
  return {
    authorization: `Bearer ${resolveNotionToken()}`,
    "content-type": "application/json",
    "notion-version": resolveNotionVersion(),
  };
}

async function fetchNotionJson<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<NotionApiResult<T>> {
  if (!resolveNotionToken()) {
    return {
      ok: false,
      status: null,
      data: null,
      error: "missing-notion-token",
    };
  }

  try {
    const response = await fetch(`${resolveNotionApiBaseUrl()}${path}`, {
      method: options.method || "GET",
      headers: makeNotionHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? (data as T) : null,
      error: response.ok ? undefined : data?.message || text || `http-${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function databaseTitle(database: NotionDatabase | null) {
  const title = database?.title?.map((item) => item.plain_text || "").join("").trim();
  return title || database?.id || "Untitled Notion database";
}

function targetFieldFor(kind: NotionDatabaseKind, sourceField: string, propertyType = "") {
  const normalized = sourceField.toLowerCase().replace(/[_\-\s]+/g, "");
  const table = kind === "projects"
    ? "projects"
    : kind === "tasks"
      ? "tasks"
      : kind === "decisions"
        ? "decisions"
        : "notes";

  if (["name", "title", "project", "task"].includes(normalized) || propertyType === "title") {
    return `${table}.${kind === "projects" ? "name" : "title"}`;
  }

  if (normalized.includes("status") || normalized.includes("state")) {
    return `${table}.status`;
  }

  if (normalized.includes("priority") && kind === "projects") {
    return "projects.priority";
  }

  if (normalized.includes("next") || normalized.includes("action")) {
    return `${table}.next_action`;
  }

  if (normalized.includes("due") || normalized.includes("date") || propertyType === "date") {
    return `${table}.due_at`;
  }

  if (normalized.includes("summary")) {
    return "decisions.summary";
  }

  if (normalized.includes("body") || normalized.includes("note")) {
    return "notes.body";
  }

  return `${table}.payload.${sourceField}`;
}

function mappingTypeFor(targetField: string) {
  return targetField.includes(".status") || targetField.includes(".due_at") ? "transform" : "copy";
}

async function ensureFieldMapping({
  connectionId,
  sourceField,
  targetField,
  mappingType,
}: {
  connectionId: string;
  sourceField: string;
  targetField: string;
  mappingType: string;
}) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      persisted: false,
      reason: "missing-workspace",
    };
  }

  const existing = await fetchSupabaseRows("field_mappings", {
    select: "id",
    filters: [
      ["workspace_id", `eq.${workspaceId}`],
      ["connection_id", `eq.${connectionId}`],
      ["source_field", `eq.${sourceField}`],
      ["target_field", `eq.${targetField}`],
    ],
    limit: 1,
  });

  if (Array.isArray(existing) && existing[0]?.id) {
    return {
      persisted: true,
      reason: "exists",
    };
  }

  return insertSupabaseRecord("field_mappings", {
    workspace_id: workspaceId,
    connection_id: connectionId,
    source_field: sourceField,
    target_field: targetField,
    mapping_type: mappingType,
  });
}

async function inspectDatabase(database: NotionDatabaseConfig) {
  if (!database.databaseId) {
    return {
      ok: false as const,
      kind: database.kind,
      targetTable: database.targetTable,
      databaseId: null,
      error: "missing-database-id",
    };
  }

  const [metadata, query] = await Promise.all([
    fetchNotionJson<NotionDatabase>(`/databases/${encodeURIComponent(database.databaseId)}`),
    fetchNotionJson<NotionQueryResponse>(
      `/databases/${encodeURIComponent(database.databaseId)}/query`,
      {
        method: "POST",
        body: {
          page_size: 10,
        },
      },
    ),
  ]);

  if (!metadata.ok) {
    return {
      ok: false as const,
      kind: database.kind,
      targetTable: database.targetTable,
      databaseId: database.databaseId,
      error: metadata.error || "metadata-fetch-failed",
      status: metadata.status,
    };
  }

  const properties = metadata.data?.properties || {};
  const mappings = Object.entries(properties).map(([sourceField, property]) => {
    const targetField = targetFieldFor(database.kind, sourceField, property.type || "");

    return {
      sourceField,
      propertyType: property.type || "unknown",
      targetField,
      mappingType: mappingTypeFor(targetField),
    };
  });

  return {
    ok: true as const,
    kind: database.kind,
    targetTable: database.targetTable,
    databaseId: database.databaseId,
    title: databaseTitle(metadata.data),
    propertyCount: mappings.length,
    sampleCount: query.ok ? query.data?.results?.length || 0 : 0,
    hasMore: query.ok ? Boolean(query.data?.has_more) : false,
    queryError: query.ok ? null : query.error || "query-failed",
    mappings,
  };
}

export async function syncNotionReadOnly() {
  const status = getNotionIntegrationStatus();
  const startedAt = new Date().toISOString();

  if (!status.tokenConfigured) {
    const connection = await upsertIntegrationConnection({
      provider: "notion",
      status: "pending",
      config: status,
      lastSyncedAt: null,
    });
    const syncRun = await insertIntegrationSyncRun({
      provider: "notion",
      connectionId: connection.connection?.id || null,
      status: "failure",
      payload: {
        startedAt,
        reason: "missing-notion-token",
      },
      errorMessage: "NOTION_TOKEN is not configured.",
    });

    return {
      status: "preview",
      configured: false,
      message: "NOTION_TOKEN is not configured.",
      persistence: {
        connection,
        syncRun,
      },
    };
  }

  const requiredMissing = databaseConfigs()
    .filter((database) => database.kind === "projects" || database.kind === "tasks")
    .filter((database) => !database.databaseId)
    .map((database) => database.kind);

  if (requiredMissing.length) {
    const connection = await upsertIntegrationConnection({
      provider: "notion",
      status: "pending",
      config: status,
      lastSyncedAt: null,
    });
    const syncRun = await insertIntegrationSyncRun({
      provider: "notion",
      connectionId: connection.connection?.id || null,
      status: "failure",
      payload: {
        startedAt,
        reason: "missing-required-databases",
        requiredMissing,
      },
      errorMessage: `Missing Notion database IDs: ${requiredMissing.join(", ")}`,
    });

    return {
      status: "preview",
      configured: false,
      message: `Missing Notion database IDs: ${requiredMissing.join(", ")}`,
      persistence: {
        connection,
        syncRun,
      },
    };
  }

  const configuredDatabases = databaseConfigs().filter((database) => database.databaseId);
  const results = await Promise.all(configuredDatabases.map(inspectDatabase));
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const finishedAt = new Date().toISOString();
  const connection = await upsertIntegrationConnection({
    provider: "notion",
    status: successes.length ? "connected" : "error",
    config: {
      ...status,
      lastResult: {
        syncedDatabases: successes.length,
        failedDatabases: failures.length,
      },
    },
    lastSyncedAt: successes.length ? finishedAt : null,
  });
  const connectionId = connection.connection?.id || null;
  const mappingWrites = connectionId
    ? await Promise.all(
        successes.flatMap((database) =>
          database.mappings.map((mapping) =>
            ensureFieldMapping({
              connectionId,
              sourceField: `${database.kind}.${mapping.sourceField}`,
              targetField: mapping.targetField,
              mappingType: mapping.mappingType,
            }),
          ),
        ),
      )
    : [];
  const projectUpdate = await insertSupabaseRecord("project_updates", {
    workspace_id: resolveDefaultWorkspaceId() || null,
    project_id: null,
    source: "notion",
    event_type: "notion.sync.read",
    status: failures.length && !successes.length ? "blocked" : "reported",
    title: "Notion read sync",
    summary: [
      `${successes.length} database(s) reachable`,
      `${failures.length} failure(s)`,
      `${mappingWrites.length} field mapping check(s)`,
    ].join(" · "),
    progress: null,
    milestone: null,
    next_action: failures.length
      ? "Fix Notion token or database IDs, then rerun Notion read sync."
      : "Review field mappings before enabling write-back.",
    payload: {
      successes,
      failures,
      mappingWrites,
    },
    happened_at: finishedAt,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "notion",
    connectionId,
    status: failures.length && !successes.length ? "failure" : "success",
    payload: {
      startedAt,
      finishedAt,
      successes,
      failures,
      mappingWrites,
      projectUpdate,
    },
    errorMessage: failures.length ? `${failures.length} Notion database sync failure(s)` : null,
  });

  return {
    status: failures.length ? (successes.length ? "partial" : "error") : "synced",
    configured: true,
    databases: successes,
    failures,
    persistence: {
      connection,
      syncRun,
      mappingWrites,
      projectUpdate,
    },
  };
}
