import { randomUUID } from "crypto";

import { logError, logEvent } from "@com-moon/hub-gateway";

import { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord } from "./supabase-rest";

const PROJECT_STATUSES = new Set(["reported", "active", "blocked", "done"]);
const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
type SupabaseFilter = [string, string];

export interface ProjectWebhookPayload {
  workspaceId?: string;
  projectId?: string;
  title?: string;
  summary?: string;
  status?: string;
  progress?: number;
  milestone?: string;
  nextAction?: string;
  eventType?: string;
  provider?: string;
  providerEventId?: string;
  correlationId?: string;
  source?: string;
  checkType?: string;
  note?: string;
  payload?: Record<string, unknown>;
}

function resolveWorkspaceId(inputWorkspaceId?: string) {
  return (
    inputWorkspaceId?.trim() ||
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
}

function makeFilter(key: string, value: string): SupabaseFilter {
  return [key, value];
}

function normalizeStatus(value?: string) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "reported";
  }

  if (["completed", "complete"].includes(normalized)) {
    return "done";
  }

  if (["draft", "planned", "queued", "ready", "pending"].includes(normalized)) {
    return "reported";
  }

  return PROJECT_STATUSES.has(normalized) ? normalized : "reported";
}

function normalizeRoutineStatus(value?: string) {
  const normalized = value?.trim().toLowerCase();

  if (["done", "completed", "complete"].includes(normalized || "")) {
    return "done";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "skipped") {
    return "skipped";
  }

  return "pending";
}

function toProjectRecordStatus(value: string) {
  if (value === "done") {
    return "completed";
  }

  if (value === "active" || value === "blocked") {
    return value;
  }

  return null;
}

function normalizeCheckType(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && CHECK_TYPES.has(normalized) ? normalized : null;
}

function clampProgress(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeIdentifier(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function resolvePayloadIdentifier(payload: Record<string, unknown>) {
  return (
    normalizeIdentifier(payload.providerEventId) ||
    normalizeIdentifier(payload.externalId) ||
    normalizeIdentifier(payload.eventId) ||
    normalizeIdentifier(payload.id)
  );
}

function resolveProviderEventId(input: ProjectWebhookPayload, source: string) {
  const rawPayload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const candidate =
    normalizeIdentifier(input.providerEventId) || resolvePayloadIdentifier(rawPayload);

  if (!candidate) {
    return null;
  }

  return candidate.includes(":") ? candidate : `${source}:${candidate}`;
}

async function findDuplicateWebhookEvent({
  workspaceId,
  source,
  providerEventId,
}: {
  workspaceId: string;
  source: string;
  providerEventId: string | null;
}) {
  if (!workspaceId || !providerEventId) {
    return null;
  }

  const rows = await fetchSupabaseRows("webhook_events", {
    limit: 1,
    filters: [
      ["workspace_id", `eq.${workspaceId}`],
      ["source", `eq.${source}`],
      ["provider_event_id", `eq.${providerEventId}`],
    ],
  });

  return rows?.[0] || null;
}

function summarizePersistence({
  webhookEventRecord,
  projectUpdateRecord,
}: {
  webhookEventRecord: Awaited<ReturnType<typeof insertSupabaseRecord>>;
  projectUpdateRecord: Awaited<ReturnType<typeof insertSupabaseRecord>>;
}) {
  const essential = [webhookEventRecord, projectUpdateRecord];
  const persistedCount = essential.filter((item) => item.persisted).length;

  if (persistedCount === essential.length) {
    return "accepted";
  }

  if (persistedCount > 0) {
    return "partial";
  }

  return "failed";
}

export async function handleProjectWebhook(input: ProjectWebhookPayload) {
  const eventId = randomUUID();
  const updateId = randomUUID();
  const receivedAt = new Date().toISOString();
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const title = input.title?.trim() || "Project progress update";
  const eventType = input.eventType?.trim() || "project.progress";
  const normalized = {
    eventId,
    updateId,
    workspaceId,
    projectId: input.projectId?.trim() || null,
    title,
    summary: input.summary?.trim() || input.note?.trim() || "No summary provided.",
    status: normalizeStatus(input.status),
    progress: clampProgress(input.progress),
    milestone: input.milestone?.trim() || null,
    nextAction: input.nextAction?.trim() || null,
    eventType,
    provider: input.provider?.trim() || "manual",
    source: input.source?.trim() || "webhook",
    providerEventId: null as string | null,
    correlationId: normalizeIdentifier(input.correlationId),
    checkType: normalizeCheckType(input.checkType),
    note: input.note?.trim() || null,
    payload: input.payload ?? {},
    receivedAt,
  };
  normalized.providerEventId = resolveProviderEventId(input, normalized.source);
  normalized.correlationId =
    normalized.correlationId || normalized.providerEventId || `project-webhook:${eventId}`;

  const duplicate = await findDuplicateWebhookEvent({
    workspaceId,
    source: normalized.source,
    providerEventId: normalized.providerEventId,
  });

  if (duplicate) {
    return {
      status: "duplicate",
      eventId: duplicate.id || eventId,
      projectUpdateId: null,
      normalized,
      persistence: {
        webhookEvent: { persisted: true, reason: "duplicate" },
        projectUpdate: { persisted: false, reason: "duplicate" },
        routineCheck: { persisted: false, reason: "duplicate" },
        project: { persisted: false, reason: "duplicate" },
      },
    };
  }

  await logEvent({
    context: "project-webhook",
    trace: `project-webhook:${eventId}`,
    timestamp: receivedAt,
    level: "info",
    source: "webhook",
    workspace_id: workspaceId || undefined,
    payload: normalized,
  });

  const webhookEventRecord = workspaceId
    ? await insertSupabaseRecord("webhook_events", {
        id: eventId,
        workspace_id: workspaceId,
        event_type: eventType,
        source: normalized.source,
        status: "processed",
        correlation_id: normalized.correlationId,
        provider_event_id: normalized.providerEventId,
        payload: normalized.payload,
        received_at: receivedAt,
        processed_at: new Date().toISOString(),
      })
    : { persisted: false, reason: "missing-workspace" };

  if (webhookEventRecord.reason === "duplicate") {
    const persistedDuplicate = await findDuplicateWebhookEvent({
      workspaceId,
      source: normalized.source,
      providerEventId: normalized.providerEventId,
    });

    return {
      status: "duplicate",
      eventId: persistedDuplicate?.id || eventId,
      projectUpdateId: null,
      normalized,
      persistence: {
        webhookEvent: webhookEventRecord,
        projectUpdate: { persisted: false, reason: "duplicate" },
        routineCheck: { persisted: false, reason: "duplicate" },
        project: { persisted: false, reason: "duplicate" },
      },
    };
  }

  const projectUpdateRecord =
    workspaceId && (normalized.projectId || normalized.title)
      ? await insertSupabaseRecord("project_updates", {
          id: updateId,
          workspace_id: workspaceId,
          project_id: normalized.projectId,
          source: normalized.provider,
          event_type: eventType,
          status: normalized.status,
          title: normalized.title,
          summary: normalized.summary,
          progress: normalized.progress,
          milestone: normalized.milestone,
          next_action: normalized.nextAction,
          correlation_id: normalized.correlationId,
          payload: normalized.payload,
          happened_at: receivedAt,
        })
      : { persisted: false, reason: "missing-workspace" };

  const routineStatus = normalizeRoutineStatus(input.status);

  const routineCheckRecord =
    workspaceId && normalized.checkType
      ? await insertSupabaseRecord("routine_checks", {
          workspace_id: workspaceId,
          project_id: normalized.projectId,
          check_type: normalized.checkType,
          status: routineStatus,
          meta: {
            correlation_id: normalized.correlationId,
            provider_event_id: normalized.providerEventId,
          },
          note: normalized.note || normalized.summary,
          checked_at: routineStatus === "done" ? receivedAt : null,
        })
      : { persisted: false, reason: "not-a-check" };

  const projectPatch = {
    ...(toProjectRecordStatus(normalized.status) ? { status: toProjectRecordStatus(normalized.status) } : {}),
    ...(normalized.nextAction ? { next_action: normalized.nextAction } : {}),
  };

  const projectRecord =
    workspaceId && normalized.projectId && Object.keys(projectPatch).length
      ? await updateSupabaseRecord(
          "projects",
          [
            makeFilter("id", `eq.${normalized.projectId}`),
            makeFilter("workspace_id", `eq.${workspaceId}`),
          ],
          projectPatch,
        )
      : { persisted: false, reason: "missing-project" };
  const persistenceStatus = summarizePersistence({
    webhookEventRecord,
    projectUpdateRecord,
  });

  return {
    status: persistenceStatus,
    eventId,
    projectUpdateId: updateId,
    normalized,
    persistence: {
      webhookEvent: webhookEventRecord,
      projectUpdate: projectUpdateRecord,
      routineCheck: routineCheckRecord,
      project: projectRecord,
    },
  };
}

export async function failProjectWebhook(error: unknown, payload: Record<string, unknown>) {
  const timestamp = new Date().toISOString();

  await logError({
    context: "project-webhook",
    trace: "project-webhook:failed",
    timestamp,
    level: "error",
    source: "webhook",
    payload: {
      error: error instanceof Error ? error.message : String(error),
      payload,
    },
  });
}
