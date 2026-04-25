import { randomUUID } from "crypto";

import { generateCardNews } from "@com-moon/content-manager";
import { logError, logEvent } from "@com-moon/hub-gateway";

import {
  countSupabaseRows,
  fetchSupabaseRows,
  inFilter,
  insertSupabaseRecord,
  updateSupabaseRecord,
} from "./supabase-rest";
import {
  getTelegramMessage,
  getTelegramText,
  parseTelegramCommand,
  type TelegramUpdate,
} from "./telegram";
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

function withWorkspaceFilter(filters: SupabaseFilter[] = []) {
  const workspaceId = resolveWorkspaceId();
  return workspaceId ? [makeFilter("workspace_id", `eq.${workspaceId}`), ...filters] : filters;
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

  return {
    reserved: reservation.persisted,
    workspaceId,
    providerEventId,
    reason: reservation.reason,
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

  if (normalized === "blocked") {
    return "blocked";
  }

  if (["doing", "active", "in_progress"].includes(normalized || "")) {
    return "doing";
  }

  if (normalized === "inbox") {
    return "inbox";
  }

  return "todo";
}

async function buildProjectsCommandResponse() {
  const [projectCount, openTaskCount, projects, tasks, updates] = await Promise.all([
    countSupabaseRows(
      "projects",
      withWorkspaceFilter([makeFilter("status", inFilter(["active", "blocked"]))]),
    ),
    countSupabaseRows(
      "tasks",
      withWorkspaceFilter([makeFilter("status", inFilter(["inbox", "todo", "doing", "blocked"]))]),
    ),
    fetchSupabaseRows("projects", {
      limit: 3,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("tasks", {
      limit: 3,
      order: "created_at.desc",
      filters: withWorkspaceFilter([
        makeFilter("status", inFilter(["inbox", "todo", "doing", "blocked"])),
      ]),
    }),
    fetchSupabaseRows("project_updates", {
      limit: 3,
      order: "happened_at.desc",
      filters: withWorkspaceFilter(),
    }),
  ]);

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
  const [checks, tasks, decisions, projects] = await Promise.all([
    fetchSupabaseRows("routine_checks", {
      limit: 4,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("tasks", {
      limit: 3,
      order: "created_at.desc",
      filters: withWorkspaceFilter([
        makeFilter("status", inFilter(["inbox", "todo", "doing", "blocked"])),
      ]),
    }),
    fetchSupabaseRows("decisions", {
      limit: 2,
      order: "decided_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("projects", {
      limit: 12,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
  ]);

  if (!checks?.length && !tasks?.length && !decisions?.length) {
    return {
      message: "PMS cadence lane is ready.",
      checkpoints: ["morning", "midday", "evening", "weekly"],
    };
  }

  const projectNames = new Map((projects || []).map((item: any) => [item.id, item.name]));
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
      project: projectNames.get(item.project_id) || "Unassigned",
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

  await logEvent({
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

  if (!command) {
    const finishedAt = new Date().toISOString();
    const response = {
      message: "No slash command detected.",
    };

    await persistEngineArtifacts({
      runId,
      command: null,
      status: "ignored",
      update,
      text,
      response,
      startedAt,
      finishedAt,
    });

    return {
      runId,
      source: "telegram",
      status: "ignored",
      command: null,
      response,
      startedAt,
      finishedAt,
    };
  }

  try {
    if (command.name === "cardnews") {
      const topic =
        command.args.join(" ").trim() ||
        message?.chat?.title?.trim() ||
        "Untitled Card News";

      const result = await generateCardNews({
        topic,
        templateId: DEFAULT_CARD_NEWS_TEMPLATE_ID,
      });
      const workspaceId = resolveWorkspaceId();
      const contentItemId = randomUUID();
      const contentVariantId = randomUUID();
      const contentPersistence = workspaceId
        ? await Promise.all([
            insertSupabaseRecord("content_items", {
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
            }),
            insertSupabaseRecord("content_variants", {
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
            }),
          ])
        : [
            { persisted: false, reason: "missing-workspace" },
            { persisted: false, reason: "missing-workspace" },
          ];
      const response = {
        ...result,
        contentItemId: workspaceId ? contentItemId : null,
        contentVariantId: workspaceId ? contentVariantId : null,
        hubPath: "/dashboard/content/queue",
        persistence: {
          contentItem: contentPersistence[0],
          contentVariant: contentPersistence[1],
        },
      };

      const finishedAt = new Date().toISOString();

      await logEvent({
        context: "telegram-command",
        payload: {
          runId,
          command: command.name,
          topic,
          result: response,
        },
        trace: `telegram:${runId}`,
        timestamp: finishedAt,
        level: "info",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "completed",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "completed",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
    }

    if (command.name === "status" || command.name === "ping") {
      const finishedAt = new Date().toISOString();
      const response = {
        message: "Engine is alive.",
        command: command.name,
      };

      await logEvent({
        context: "telegram-command",
        payload: {
          runId,
          command: command.name,
          response,
        },
        trace: `telegram:${runId}`,
        timestamp: finishedAt,
        level: "info",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "completed",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "completed",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
    }

    if (command.name === "projects") {
      const finishedAt = new Date().toISOString();
      const response = await buildProjectsCommandResponse();

      await logEvent({
        context: "telegram-command",
        payload: {
          runId,
          command: command.name,
          response,
        },
        trace: `telegram:${runId}`,
        timestamp: finishedAt,
        level: "info",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "completed",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "completed",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
    }

    if (command.name === "pms") {
      const finishedAt = new Date().toISOString();
      const response = await buildPmsCommandResponse();

      await logEvent({
        context: "telegram-command",
        payload: {
          runId,
          command: command.name,
          response,
        },
        trace: `telegram:${runId}`,
        timestamp: finishedAt,
        level: "info",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "completed",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "completed",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
    }

    if (command.name === "webhooks") {
      const finishedAt = new Date().toISOString();
      const response = {
        message: "Webhook surface is ready.",
        routes: [
          "/api/webhook/telegram",
          "/api/webhook/project",
          ...listSharedProjectWebhookRoutes(),
          "/api/health",
        ],
      };

      await logEvent({
        context: "telegram-command",
        payload: {
          runId,
          command: command.name,
          response,
        },
        trace: `telegram:${runId}`,
        timestamp: finishedAt,
        level: "info",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "completed",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "completed",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
    }

    const finishedAt = new Date().toISOString();
    const response = {
      message: `Unsupported command: ${command.name}`,
      command: command.name,
    };

    await logEvent({
      context: "telegram-command",
      payload: {
        runId,
        command: command.name,
        response,
      },
      trace: `telegram:${runId}`,
      timestamp: finishedAt,
        level: "warn",
      });

      await persistEngineArtifacts({
        runId,
        command: command.name,
        status: "ignored",
        update,
        text,
        response,
        startedAt,
        finishedAt,
      });

      return {
        runId,
        source: "telegram",
        status: "ignored",
        command: command.name,
        response,
        startedAt,
        finishedAt,
      };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logError({
      context: "telegram-command",
      payload: {
        runId,
        command: command.name,
        text,
        error: errorMessage,
      },
      trace: `telegram:${runId}`,
      timestamp: finishedAt,
      level: "error",
    });

    await persistEngineArtifacts({
      runId,
      command: command.name,
      status: "failed",
      update,
      text,
      response: {
        error: errorMessage,
      },
      startedAt,
      finishedAt,
      errorMessage,
    });

    return {
      runId,
      source: "telegram",
      status: "failed",
      command: command.name,
      response: {
        error: errorMessage,
      },
      startedAt,
      finishedAt,
    };
  }
}
