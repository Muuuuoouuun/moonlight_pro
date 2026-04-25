import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "./integration-state";
import { fetchSupabaseRows, insertSupabaseRecord } from "./supabase-rest";

type OpenClawTransport = "local" | "remote" | "telegram" | "slack" | "preview";

interface OpenClawSyncInput {
  projectId?: string | null;
  transport?: string | null;
  message?: string | null;
}

interface DeliveryResult {
  transport: OpenClawTransport;
  sent: boolean;
  status: number | null;
  reason: string;
}

function eqFilter(value: string) {
  return `eq.${value}`;
}

function normalizeTransport(value: string | null | undefined): OpenClawTransport | "auto" {
  const normalized = value?.trim().toLowerCase() || "auto";

  if (["local", "remote", "telegram", "slack", "preview"].includes(normalized)) {
    return normalized as OpenClawTransport;
  }

  return "auto";
}

function resolveOpenClawProjectId(input?: OpenClawSyncInput) {
  return input?.projectId?.trim() || process.env.OPENCLAW_PROJECT_ID?.trim() || "";
}

function resolveLocalUrl() {
  return process.env.OPENCLAW_LOCAL_URL?.trim() || "";
}

function resolveRemoteUrl() {
  return process.env.OPENCLAW_REMOTE_URL?.trim() || "";
}

function resolveTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
    chatId: process.env.OPENCLAW_TELEGRAM_CHAT_ID?.trim() || "",
  };
}

function resolveSlackWebhookUrl() {
  return process.env.OPENCLAW_SLACK_WEBHOOK_URL?.trim() || "";
}

function resolveSyncSecret() {
  return process.env.OPENCLAW_SYNC_SECRET?.trim() || "";
}

function resolveTransport(input?: OpenClawSyncInput): OpenClawTransport {
  const requested = normalizeTransport(input?.transport || process.env.OPENCLAW_SYNC_TRANSPORT);

  if (requested !== "auto") {
    return requested;
  }

  if (resolveLocalUrl()) {
    return "local";
  }

  if (resolveRemoteUrl()) {
    return "remote";
  }

  const telegram = resolveTelegramConfig();
  if (telegram.botToken && telegram.chatId) {
    return "telegram";
  }

  if (resolveSlackWebhookUrl()) {
    return "slack";
  }

  return "preview";
}

export function getOpenClawIntegrationStatus() {
  const telegram = resolveTelegramConfig();

  return {
    configured:
      Boolean(resolveLocalUrl()) ||
      Boolean(resolveRemoteUrl()) ||
      Boolean(telegram.botToken && telegram.chatId) ||
      Boolean(resolveSlackWebhookUrl()),
    transport: resolveTransport(),
    projectMapped: Boolean(resolveOpenClawProjectId()),
    inboundRoute: "/api/webhook/project/openclaw",
    localConfigured: Boolean(resolveLocalUrl()),
    remoteConfigured: Boolean(resolveRemoteUrl()),
    telegramConfigured: Boolean(telegram.botToken && telegram.chatId),
    slackConfigured: Boolean(resolveSlackWebhookUrl()),
    syncSecretConfigured: Boolean(resolveSyncSecret()),
  };
}

async function buildOpenClawSnapshot(input: OpenClawSyncInput = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const projectId = resolveOpenClawProjectId(input);

  if (!workspaceId) {
    return {
      workspaceId,
      projectId,
      generatedAt: new Date().toISOString(),
      projects: [],
      tasks: [],
      updates: [],
      integrations: [],
    };
  }

  const workspaceFilter: Array<[string, string]> = [["workspace_id", eqFilter(workspaceId)]];
  const childFilter: Array<[string, string]> = projectId
    ? [
        ["workspace_id", eqFilter(workspaceId)],
        ["project_id", eqFilter(projectId)],
      ]
    : workspaceFilter;
  const [projects, tasks, updates, integrations] = await Promise.all([
    fetchSupabaseRows("projects", {
      select: "id,name,status,priority,next_action,due_at,created_at",
      filters: projectId ? [...workspaceFilter, ["id", eqFilter(projectId)]] : workspaceFilter,
      order: "created_at.desc",
      limit: projectId ? 1 : 8,
    }),
    fetchSupabaseRows("tasks", {
      select: "id,project_id,title,status,next_action,due_at,created_at",
      filters: childFilter,
      order: "created_at.desc",
      limit: 16,
    }),
    fetchSupabaseRows("project_updates", {
      select: "id,project_id,source,event_type,status,title,summary,next_action,happened_at",
      filters: childFilter,
      order: "happened_at.desc",
      limit: 16,
    }),
    fetchSupabaseRows("integration_connections", {
      select: "provider,status,last_synced_at,config,created_at",
      filters: workspaceFilter,
      order: "created_at.desc",
      limit: 12,
    }),
  ]);

  return {
    workspaceId,
    projectId,
    generatedAt: new Date().toISOString(),
    projects: projects || [],
    tasks: tasks || [],
    updates: updates || [],
    integrations: integrations || [],
  };
}

function summarizeSnapshot(snapshot: Awaited<ReturnType<typeof buildOpenClawSnapshot>>) {
  const blockedProjects = snapshot.projects.filter((project: any) => project.status === "blocked").length;
  const activeProjects = snapshot.projects.filter((project: any) => project.status === "active").length;
  const openTasks = snapshot.tasks.filter((task: any) => task.status !== "done").length;
  const latestUpdate = snapshot.updates[0] as any;

  return {
    activeProjects,
    blockedProjects,
    openTasks,
    updateCount: snapshot.updates.length,
    latestUpdate: latestUpdate
      ? {
          title: latestUpdate.title,
          source: latestUpdate.source,
          status: latestUpdate.status,
          happenedAt: latestUpdate.happened_at,
        }
      : null,
  };
}

function buildOpenClawPayload(
  snapshot: Awaited<ReturnType<typeof buildOpenClawSnapshot>>,
  input: OpenClawSyncInput,
) {
  const summary = summarizeSnapshot(snapshot);

  return {
    type: "moonlight.openclaw.sync",
    source: "moonlight-engine",
    generatedAt: snapshot.generatedAt,
    message:
      input.message?.trim() ||
      "Moonlight sync snapshot for OpenClaw. Use this as operating context and return project updates to /api/webhook/project/openclaw.",
    inbound: {
      route: "/api/webhook/project/openclaw",
      authHeader: "x-com-moon-shared-secret",
    },
    summary,
    snapshot,
  };
}

function buildOpenClawText(payload: ReturnType<typeof buildOpenClawPayload>) {
  const projectNames = payload.snapshot.projects
    .slice(0, 4)
    .map((project: any) => `- ${project.name} [${project.status}] ${project.next_action || ""}`.trim())
    .join("\n");
  const latest = payload.summary.latestUpdate;

  return [
    "Moonlight -> OpenClaw sync",
    `active=${payload.summary.activeProjects} blocked=${payload.summary.blockedProjects} open_tasks=${payload.summary.openTasks}`,
    projectNames ? `projects:\n${projectNames}` : "projects: none",
    latest ? `latest: ${latest.title} (${latest.source})` : "latest: none",
    "Return updates through /api/webhook/project/openclaw with the shared secret.",
  ].join("\n");
}

async function postJson(url: string, payload: unknown): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = resolveSyncSecret();

  if (secret) {
    headers["x-openclaw-sync-secret"] = secret;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    return {
      transport: url === resolveLocalUrl() ? "local" : "remote",
      sent: response.ok,
      status: response.status,
      reason: response.ok ? "sent" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      transport: url === resolveLocalUrl() ? "local" : "remote",
      sent: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendTelegram(text: string): Promise<DeliveryResult> {
  const telegram = resolveTelegramConfig();

  if (!telegram.botToken || !telegram.chatId) {
    return {
      transport: "telegram",
      sent: false,
      status: null,
      reason: "missing-telegram-config",
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegram.chatId,
        text,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });

    return {
      transport: "telegram",
      sent: response.ok,
      status: response.status,
      reason: response.ok ? "sent" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      transport: "telegram",
      sent: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendSlack(text: string): Promise<DeliveryResult> {
  const webhookUrl = resolveSlackWebhookUrl();

  if (!webhookUrl) {
    return {
      transport: "slack",
      sent: false,
      status: null,
      reason: "missing-slack-config",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });

    return {
      transport: "slack",
      sent: response.ok,
      status: response.status,
      reason: response.ok ? "sent" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      transport: "slack",
      sent: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function deliverOpenClawPayload(
  transport: OpenClawTransport,
  payload: ReturnType<typeof buildOpenClawPayload>,
): Promise<DeliveryResult> {
  if (transport === "local") {
    const url = resolveLocalUrl();
    return url
      ? postJson(url, payload)
      : { transport, sent: false, status: null, reason: "missing-local-url" };
  }

  if (transport === "remote") {
    const url = resolveRemoteUrl();
    return url
      ? postJson(url, payload)
      : { transport, sent: false, status: null, reason: "missing-remote-url" };
  }

  if (transport === "telegram") {
    return sendTelegram(buildOpenClawText(payload));
  }

  if (transport === "slack") {
    return sendSlack(buildOpenClawText(payload));
  }

  return {
    transport: "preview",
    sent: false,
    status: null,
    reason: "no-transport-configured",
  };
}

export async function syncOpenClaw(input: OpenClawSyncInput = {}) {
  const transport = resolveTransport(input);
  const snapshot = await buildOpenClawSnapshot(input);
  const payload = buildOpenClawPayload(snapshot, input);
  const delivery = await deliverOpenClawPayload(transport, payload);
  const finishedAt = new Date().toISOString();
  const connection = await upsertIntegrationConnection({
    provider: "openclaw",
    status: delivery.sent ? "connected" : delivery.transport === "preview" ? "pending" : "error",
    config: {
      ...getOpenClawIntegrationStatus(),
      lastDelivery: delivery,
    },
    lastSyncedAt: delivery.sent ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "openclaw",
    connectionId: connection.connection?.id || null,
    status: delivery.sent ? "success" : "failure",
    payload: {
      delivery,
      summary: payload.summary,
      snapshot,
    },
    errorMessage: delivery.sent ? null : delivery.reason,
  });
  const projectUpdate = snapshot.workspaceId
    ? await insertSupabaseRecord("project_updates", {
        workspace_id: snapshot.workspaceId,
        project_id: snapshot.projectId || null,
        source: "openclaw",
        event_type: "openclaw.sync.outbound",
        status: delivery.sent ? "reported" : "blocked",
        title: `OpenClaw sync via ${delivery.transport}`,
        summary: delivery.sent
          ? `Sent Moonlight context to OpenClaw over ${delivery.transport}.`
          : `OpenClaw sync not sent: ${delivery.reason}.`,
        progress: null,
        milestone: null,
        next_action: delivery.sent
          ? "Wait for OpenClaw to return progress through /api/webhook/project/openclaw."
          : "Configure an OpenClaw local URL, Telegram chat, or Slack webhook.",
        payload: {
          delivery,
          summary: payload.summary,
        },
        happened_at: finishedAt,
      })
    : null;

  return {
    status: delivery.sent ? "synced" : delivery.transport === "preview" ? "preview" : "error",
    delivery,
    payload,
    persistence: {
      connection,
      syncRun,
      projectUpdate,
    },
  };
}
