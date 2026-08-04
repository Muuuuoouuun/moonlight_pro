import { randomUUID } from "crypto";

import { generateCardNews } from "@com-moon/content-manager";
import { logError, logEvent } from "@com-moon/hub-gateway";

import {
  fetchSupabaseRows,
  fetchSupabaseRowsDetailed,
  inFilter,
  insertSupabaseRecord,
  updateSupabaseRecord,
} from "./supabase-rest";
import {
  getTelegramMessage,
  getTelegramText,
  parseTelegramCommand,
  type TelegramCommand,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram";
import { generateGeminiText } from "./gemini";
import { listSharedProjectWebhookRoutes } from "./shared-webhook";

const DEFAULT_CARD_NEWS_TEMPLATE_ID = "classin_cardnews_math_v3";
type SupabaseFilter = [string, string];

function resolveWorkspaceId() {
  return (
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
}

function makeFilter(key: string, value: string): SupabaseFilter {
  return [key, value];
}

function workspaceFilter(workspaceId: string, filters: SupabaseFilter[] = []) {
  return [makeFilter("workspace_id", `eq.${workspaceId}`), ...filters];
}

function resolveTelegramProviderEventId(update: TelegramUpdate) {
  return update.update_id == null ? null : `telegram:${String(update.update_id)}`;
}

async function reserveTelegramUpdate(update: TelegramUpdate, startedAt: string) {
  const workspaceId = resolveWorkspaceId();
  const providerEventId = resolveTelegramProviderEventId(update);

  if (!workspaceId || !providerEventId) {
    return {
      reserved: true,
      workspaceId,
      providerEventId,
      reason: workspaceId ? "missing-provider-event-id" : "missing-workspace",
    };
  }

  const reservation = await insertSupabaseRecord("webhook_events", {
    workspace_id: workspaceId,
    event_type: "telegram.update",
    source: "telegram",
    status: "received",
    correlation_id: providerEventId,
    provider_event_id: providerEventId,
    payload: {
      update_id: update.update_id,
      phase: "received",
    },
    received_at: startedAt,
  });

  if (reservation.persisted || reservation.reason !== "duplicate") {
    return {
      reserved: reservation.persisted,
      workspaceId,
      providerEventId,
      reason: reservation.reason,
      detail: reservation.detail,
    };
  }

  // Duplicate delivery. If the earlier attempt *failed*, atomically re-claim the
  // row (status failed → received) so Telegram's retry actually re-processes it —
  // otherwise a transient failure would be dropped forever behind the unique index.
  const reclaim = await updateSupabaseRecord(
    "webhook_events",
    [
      makeFilter("workspace_id", `eq.${workspaceId}`),
      makeFilter("source", "eq.telegram"),
      makeFilter("provider_event_id", `eq.${providerEventId}`),
      makeFilter("status", "eq.failed"),
    ],
    {
      status: "received",
      error_message: null,
      payload: {
        update_id: update.update_id,
        phase: "retry",
      },
    },
    { returnRepresentation: true, select: "id" },
  );

  return {
    reserved: reclaim.persisted,
    workspaceId,
    providerEventId,
    reason: reclaim.persisted ? "reclaimed-failed" : "duplicate",
    detail: reservation.detail,
  };
}

function normalizeProjectStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "done") {
    return "completed";
  }

  if (["draft", "planned", "queued", "ready", "reported"].includes(normalized || "")) {
    return "planned";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "archived") {
    return "archived";
  }

  return "active";
}

function normalizeRoutineStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "done") {
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

function normalizeTaskStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "done") {
    return "done";
  }

  if (normalized === "doing") {
    return "doing";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "inbox") {
    return "inbox";
  }

  return "todo";
}

const OPEN_TASK_STATUSES = ["inbox", "todo", "doing", "blocked"];

async function buildProjectsCommandResponse() {
  const workspaceId = resolveWorkspaceId();

  if (!workspaceId) {
    // Fail closed: without a workspace scope we refuse to query at all — the
    // service-role key would otherwise read every workspace's rows.
    return {
      message: "Project lane needs COM_MOON_DEFAULT_WORKSPACE_ID before it can read the ledger.",
      next: ["Set COM_MOON_DEFAULT_WORKSPACE_ID to the target workspaces.id."],
    };
  }

  // tasks: one request returns both the open-task rows and the exact open count.
  const [projectCount, projects, tasksDetailed, updates] = await Promise.all([
    fetchSupabaseRowsDetailed("projects", {
      select: "id",
      limit: 1,
      count: "exact",
      filters: workspaceFilter(workspaceId, [makeFilter("status", inFilter(["active", "blocked"]))]),
    }).then((result) => result.count),
    fetchSupabaseRows("projects", {
      select: "id,name,status,next_action",
      limit: 3,
      order: "created_at.desc",
      filters: workspaceFilter(workspaceId),
    }),
    fetchSupabaseRowsDetailed("tasks", {
      select: "id,title,status,next_action",
      limit: 3,
      order: "created_at.desc",
      count: "exact",
      filters: workspaceFilter(workspaceId, [makeFilter("status", inFilter(OPEN_TASK_STATUSES))]),
    }),
    fetchSupabaseRows("project_updates", {
      select: "id,title,happened_at",
      limit: 3,
      order: "happened_at.desc",
      filters: workspaceFilter(workspaceId),
    }),
  ]);

  const tasks = tasksDetailed.rows;
  const openTaskCount = tasksDetailed.count;

  if (projectCount == null && openTaskCount == null && !projects?.length && !tasks?.length && !updates?.length) {
    return {
      message: "Project lane is online.",
      next: [
        "Review /dashboard/work/projects for milestones and blockers.",
        "Send progress events to POST /api/webhook/project.",
      ],
    };
  }

  return {
    message:
      projects?.length || tasks?.length
        ? "Project lane is live."
        : "Project lane is wired, but still waiting for live records.",
    summary: {
      activeProjects: projectCount ?? 0,
      openTasks: openTaskCount ?? 0,
      recentUpdates: updates?.length ?? 0,
    },
    projects: (projects || []).map((item: any) => ({
      name: item.name,
      status: normalizeProjectStatus(item.status),
      nextAction: item.next_action || "Define the next action before this project stalls.",
    })),
    tasks: (tasks || []).map((item: any) => ({
      title: item.title,
      status: normalizeTaskStatus(item.status),
      nextAction: item.next_action || "Move this task to a concrete next step.",
    })),
    next: [
      "Review /dashboard/work/projects for milestones and blockers.",
      "Send progress events to POST /api/webhook/project.",
    ],
  };
}

async function buildPmsCommandResponse() {
  const workspaceId = resolveWorkspaceId();

  if (!workspaceId) {
    return {
      message: "PMS cadence lane needs COM_MOON_DEFAULT_WORKSPACE_ID before it can read the ledger.",
      checkpoints: ["morning", "midday", "evening", "weekly"],
    };
  }

  // tasks embed their project name via the FK (select=...,projects(name)) — no
  // separate projects fetch just to build an id → name map.
  const [checks, tasks, decisions] = await Promise.all([
    fetchSupabaseRows("routine_checks", {
      select: "id,check_type,status,note",
      limit: 4,
      order: "created_at.desc",
      filters: workspaceFilter(workspaceId),
    }),
    fetchSupabaseRows("tasks", {
      select: "id,title,status,next_action,project_id,projects(name)",
      limit: 3,
      order: "created_at.desc",
      filters: workspaceFilter(workspaceId, [makeFilter("status", inFilter(OPEN_TASK_STATUSES))]),
    }),
    fetchSupabaseRows("decisions", {
      select: "id,title,summary",
      limit: 2,
      order: "decided_at.desc",
      filters: workspaceFilter(workspaceId),
    }),
  ]);

  if (!checks?.length && !tasks?.length && !decisions?.length) {
    return {
      message: "PMS cadence lane is ready.",
      checkpoints: ["morning", "midday", "evening", "weekly"],
    };
  }

  const normalizedChecks = (checks || []).map((item: any) => normalizeRoutineStatus(item.status));

  return {
    message: "PMS cadence lane is live.",
    cadence: {
      pending: normalizedChecks.filter((item: string) => item === "pending").length,
      blocked: normalizedChecks.filter((item: string) => item === "blocked").length,
      done: normalizedChecks.filter((item: string) => item === "done").length,
    },
    checkpoints: (checks || []).map((item: any) => ({
      type: item.check_type,
      status: normalizeRoutineStatus(item.status),
      note: item.note || "Routine checkpoint captured.",
    })),
    tasks: (tasks || []).map((item: any) => ({
      title: item.title,
      project: item.projects?.name || "Unassigned",
      status: normalizeTaskStatus(item.status),
      nextAction: item.next_action || "Define the next move before this task stalls.",
    })),
    decisions: (decisions || []).map((item: any) => ({
      title: item.title,
      summary: item.summary,
    })),
  };
}

async function persistEngineArtifacts({
  runId,
  command,
  status,
  update,
  text,
  response,
  startedAt,
  finishedAt,
  errorMessage,
}: {
  runId: string;
  command: string | null;
  status: "completed" | "ignored" | "failed";
  update: TelegramUpdate;
  text: string | null;
  response: unknown;
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}) {
  const workspaceId = resolveWorkspaceId();

  if (!workspaceId) {
    return;
  }

  const automationStatus =
    status === "completed" ? "success" : status === "failed" ? "failure" : "ignored";
  const webhookStatus =
    status === "completed" ? "processed" : status === "failed" ? "failed" : "ignored";
  const providerEventId =
    resolveTelegramProviderEventId(update);
  const correlationId = providerEventId || `telegram:${runId}`;
  const webhookEventPatch = {
    event_type: command ? `telegram.${command}` : "telegram.update",
    status: webhookStatus,
    correlation_id: correlationId,
    provider_event_id: providerEventId,
    payload: {
      text,
      update_id: update.update_id ?? null,
      command,
    },
    error_message: errorMessage ?? null,
    processed_at: finishedAt,
  };

  const mutations: Array<Promise<unknown>> = [
    insertSupabaseRecord("automation_runs", {
      id: runId,
      workspace_id: workspaceId,
      status: automationStatus,
      correlation_id: correlationId,
      provider_event_id: providerEventId,
      input_payload: {
        source: "telegram",
        command,
        text,
        update_id: update.update_id ?? null,
      },
      output_payload:
        response && typeof response === "object" ? response : { value: response ?? null },
      error_message: errorMessage ?? null,
      created_at: startedAt,
      finished_at: finishedAt,
    }),
  ];

  if (providerEventId) {
    mutations.push(
      updateSupabaseRecord(
        "webhook_events",
        [
          makeFilter("workspace_id", `eq.${workspaceId}`),
          makeFilter("source", "eq.telegram"),
          makeFilter("provider_event_id", `eq.${providerEventId}`),
        ],
        webhookEventPatch,
      ),
    );
  } else {
    mutations.push(
      insertSupabaseRecord("webhook_events", {
        workspace_id: workspaceId,
        source: "telegram",
        received_at: startedAt,
        ...webhookEventPatch,
      }),
    );
  }

  await Promise.all(mutations);
}

export interface EngineRunResult {
  runId: string;
  source: "telegram";
  status: "completed" | "ignored" | "failed";
  command: string | null;
  response: unknown;
  startedAt: string;
  finishedAt: string;
}

interface CommandContext {
  runId: string;
  command: TelegramCommand;
  message: TelegramMessage | null;
}

interface CommandOutcome {
  status: "completed" | "ignored";
  response: unknown;
  logLevel?: "info" | "warn";
}

async function handleCardNewsCommand({ runId, command, message }: CommandContext): Promise<CommandOutcome> {
  const topic =
    command.args.join(" ").trim() ||
    message?.chat?.title?.trim() ||
    "Untitled Card News";

  const result = await generateCardNews(
    {
      topic,
      templateId: DEFAULT_CARD_NEWS_TEMPLATE_ID,
    },
    generateGeminiText,
  );
  const workspaceId = resolveWorkspaceId();
  const contentItemId = randomUUID();
  const contentVariantId = randomUUID();

  let contentItemPersistence: { persisted: boolean; reason: string } = {
    persisted: false,
    reason: "missing-workspace",
  };
  let contentVariantPersistence: { persisted: boolean; reason: string } = {
    persisted: false,
    reason: "missing-workspace",
  };

  if (workspaceId) {
    // content_variants.content_id references content_items(id) — the parent row
    // must land first; firing both concurrently loses the FK race.
    contentItemPersistence = await insertSupabaseRecord("content_items", {
      id: contentItemId,
      workspace_id: workspaceId,
      title: result.title,
      source_idea: topic,
      idea_source: "telegram",
      source_type: "idea",
      status: "draft",
      summary: result.summary,
      next_action: "Review the generated draft in Content > Queue.",
      visibility: "private",
      meta: {
        generated_by: "telegram",
        template_id: result.templateId,
        run_id: runId,
      },
      created_at: result.generatedAt,
      updated_at: result.generatedAt,
    });

    contentVariantPersistence = contentItemPersistence.persisted
      ? await insertSupabaseRecord("content_variants", {
          id: contentVariantId,
          workspace_id: workspaceId,
          content_id: contentItemId,
          variant_type: "card_news",
          title: result.title,
          body: JSON.stringify(result),
          summary: result.summary,
          excerpt: result.summary,
          status: "draft",
          visibility: "private",
          meta: {
            generated_by: "telegram",
            template_id: result.templateId,
            slide_count: result.slideCount,
            run_id: runId,
          },
          created_at: result.generatedAt,
          updated_at: result.generatedAt,
        })
      : { persisted: false, reason: "content-item-not-persisted" };
  }

  return {
    status: "completed",
    response: {
      ...result,
      contentItemId: workspaceId ? contentItemId : null,
      contentVariantId: workspaceId ? contentVariantId : null,
      hubPath: "/dashboard/content/queue",
      persistence: {
        contentItem: contentItemPersistence,
        contentVariant: contentVariantPersistence,
      },
    },
  };
}

const COMMAND_HANDLERS: Record<string, (context: CommandContext) => Promise<CommandOutcome>> = {
  cardnews: handleCardNewsCommand,
  status: async ({ command }) => ({
    status: "completed",
    response: { message: "Engine is alive.", command: command.name },
  }),
  ping: async ({ command }) => ({
    status: "completed",
    response: { message: "Engine is alive.", command: command.name },
  }),
  projects: async () => ({
    status: "completed",
    response: await buildProjectsCommandResponse(),
  }),
  pms: async () => ({
    status: "completed",
    response: await buildPmsCommandResponse(),
  }),
  webhooks: async () => ({
    status: "completed",
    response: {
      message: "Webhook surface is ready.",
      routes: [
        "/api/webhook/telegram",
        "/api/webhook/project",
        ...listSharedProjectWebhookRoutes(),
        "/api/health",
      ],
    },
  }),
};

export async function runTelegramUpdate(update: TelegramUpdate): Promise<EngineRunResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const reservation = await reserveTelegramUpdate(update, startedAt);
  if (!reservation.reserved && reservation.reason === "duplicate") {
    const finishedAt = new Date().toISOString();
    return {
      runId,
      source: "telegram",
      status: "ignored",
      command: null,
      response: {
        message: "Duplicate Telegram update ignored.",
        providerEventId: reservation.providerEventId,
      },
      startedAt,
      finishedAt,
    };
  }

  const message = getTelegramMessage(update);
  const text = getTelegramText(update);
  const command = parseTelegramCommand(text);

  // Receipt log — held (not awaited) so it overlaps with command work; finalize
  // awaits it before the response returns. logEvent never rejects (hub-gateway
  // catches internally), so holding the promise cannot produce an unhandled rejection.
  const receiptLogged = logEvent({
    context: "telegram-webhook",
    payload: {
      runId,
      update,
      text,
      command: command?.name ?? null,
      messageId: message?.message_id ?? null,
    },
    trace: `telegram:${runId}`,
    timestamp: startedAt,
    level: "info",
  });

  const finalize = async ({
    status,
    response,
    commandName,
    logLevel,
    errorMessage,
  }: {
    status: "completed" | "ignored" | "failed";
    response: unknown;
    commandName: string | null;
    logLevel?: "info" | "warn";
    errorMessage?: string;
  }): Promise<EngineRunResult> => {
    const finishedAt = new Date().toISOString();
    const commandLog = errorMessage
      ? logError({
          context: "telegram-command",
          payload: { runId, command: commandName, text, error: errorMessage },
          trace: `telegram:${runId}`,
          timestamp: finishedAt,
          level: "error",
        })
      : commandName
        ? logEvent({
            context: "telegram-command",
            payload: { runId, command: commandName, response },
            trace: `telegram:${runId}`,
            timestamp: finishedAt,
            level: logLevel ?? "info",
          })
        : Promise.resolve();

    await Promise.all([
      receiptLogged,
      commandLog,
      persistEngineArtifacts({
        runId,
        command: commandName,
        status,
        update,
        text,
        response,
        startedAt,
        finishedAt,
        errorMessage,
      }),
    ]);

    return {
      runId,
      source: "telegram",
      status,
      command: commandName,
      response,
      startedAt,
      finishedAt,
    };
  };

  if (!command) {
    return finalize({
      status: "ignored",
      response: { message: "No slash command detected." },
      commandName: null,
    });
  }

  try {
    const handler = COMMAND_HANDLERS[command.name];

    if (!handler) {
      return await finalize({
        status: "ignored",
        response: {
          message: `Unsupported command: ${command.name}`,
          command: command.name,
        },
        commandName: command.name,
        logLevel: "warn",
      });
    }

    const outcome = await handler({ runId, command, message });
    return await finalize({
      status: outcome.status,
      response: outcome.response,
      commandName: command.name,
      logLevel: outcome.logLevel,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return finalize({
      status: "failed",
      response: { error: errorMessage },
      commandName: command.name,
      errorMessage,
    });
  }
}
