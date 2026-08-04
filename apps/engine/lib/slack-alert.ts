import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "./integration-state";
import { fetchSupabaseRows } from "./supabase-rest";

type SlackTransport = "webhook" | "bot" | "preview";

interface SlackAlertInput {
  message?: string | null;
  severity?: string | null;
  source?: string | null;
  payload?: Record<string, unknown> | null;
}

interface SlackDelivery {
  transport: SlackTransport;
  sent: boolean;
  status: number | null;
  reason: string;
}

function resolveSlackWebhookUrl() {
  return process.env.SLACK_WEBHOOK_URL?.trim() || "";
}

function resolveSlackBotToken() {
  return process.env.SLACK_BOT_TOKEN?.trim() || "";
}

function resolveSlackChannelId() {
  return process.env.SLACK_ALERT_CHANNEL_ID?.trim() || "";
}

function resolveTransport(): SlackTransport {
  if (resolveSlackWebhookUrl()) {
    return "webhook";
  }

  if (resolveSlackBotToken() && resolveSlackChannelId()) {
    return "bot";
  }

  return "preview";
}

export function getSlackAlertIntegrationStatus() {
  return {
    configured: resolveTransport() !== "preview",
    transport: resolveTransport(),
    webhookConfigured: Boolean(resolveSlackWebhookUrl()),
    botConfigured: Boolean(resolveSlackBotToken() && resolveSlackChannelId()),
    signingSecretConfigured: Boolean(process.env.SLACK_SIGNING_SECRET?.trim()),
    alertChannelConfigured: Boolean(resolveSlackChannelId()),
  };
}

function normalizeSeverity(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "";

  if (["critical", "high", "medium", "low", "info"].includes(normalized)) {
    return normalized;
  }

  return "medium";
}

async function latestFailures() {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      errorLogs: [],
      syncFailures: [],
    };
  }

  const [errorLogs, syncFailures] = await Promise.all([
    // error_logs keys its event time as `timestamp` (not created_at) — asking for
    // created_at made PostgREST 400 and this digest permanently reported "none".
    fetchSupabaseRows("error_logs", {
      select: "id,context,source,level,trace,timestamp,payload",
      filters: [["workspace_id", `eq.${workspaceId}`]],
      order: "timestamp.desc",
      limit: 5,
    }),
    fetchSupabaseRows("sync_runs", {
      select: "id,status,error_message,started_at,finished_at,payload",
      filters: [
        ["workspace_id", `eq.${workspaceId}`],
        ["status", "eq.failure"],
      ],
      order: "started_at.desc",
      limit: 5,
    }),
  ]);

  return {
    errorLogs: Array.isArray(errorLogs) ? errorLogs : [],
    syncFailures: Array.isArray(syncFailures) ? syncFailures : [],
  };
}

function failureLines(items: any[], label: string) {
  if (!items.length) {
    return [`${label}: none`];
  }

  return [
    `${label}:`,
    ...items.slice(0, 5).map((item) => {
      const title = item.context || item.error_message || item.payload?.provider || item.id;
      const source = item.source || item.payload?.provider || "unknown";
      const timestamp = item.timestamp || item.started_at || item.finished_at || "";
      return `- ${title} (${source}) ${timestamp}`.trim();
    }),
  ];
}

async function buildAlertText(input: SlackAlertInput = {}) {
  const failures = await latestFailures();
  const severity = normalizeSeverity(input.severity);
  const message = input.message?.trim() || "Moonlight failure alert digest.";
  const source = input.source?.trim() || "moonlight-engine";

  return [
    `[Moonlight][${severity}] ${message}`,
    `source=${source}`,
    ...failureLines(failures.errorLogs, "error_logs"),
    ...failureLines(failures.syncFailures, "sync_runs failures"),
  ].join("\n");
}

async function sendWebhook(text: string): Promise<SlackDelivery> {
  const webhookUrl = resolveSlackWebhookUrl();

  if (!webhookUrl) {
    return {
      transport: "webhook",
      sent: false,
      status: null,
      reason: "missing-slack-webhook-url",
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
      signal: AbortSignal.timeout(10_000),
    });

    return {
      transport: "webhook",
      sent: response.ok,
      status: response.status,
      reason: response.ok ? "sent" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      transport: "webhook",
      sent: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendBotMessage(text: string): Promise<SlackDelivery> {
  const token = resolveSlackBotToken();
  const channel = resolveSlackChannelId();

  if (!token || !channel) {
    return {
      transport: "bot",
      sent: false,
      status: null,
      reason: "missing-slack-bot-config",
    };
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => null);
    const ok = response.ok && data?.ok !== false;

    return {
      transport: "bot",
      sent: ok,
      status: response.status,
      reason: ok ? "sent" : data?.error || `http-${response.status}`,
    };
  } catch (error) {
    return {
      transport: "bot",
      sent: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function deliverSlackAlert(transport: SlackTransport, text: string) {
  if (transport === "webhook") {
    return sendWebhook(text);
  }

  if (transport === "bot") {
    return sendBotMessage(text);
  }

  return {
    transport: "preview",
    sent: false,
    status: null,
    reason: "no-slack-transport-configured",
  };
}

export async function sendSlackFailureAlert(input: SlackAlertInput = {}) {
  const startedAt = new Date().toISOString();
  const status = getSlackAlertIntegrationStatus();
  const text = await buildAlertText(input);
  const delivery = await deliverSlackAlert(status.transport, text);
  const finishedAt = new Date().toISOString();
  const connection = await upsertIntegrationConnection({
    provider: "slack",
    status: delivery.sent ? "connected" : delivery.transport === "preview" ? "pending" : "error",
    config: {
      ...status,
      lastDelivery: delivery,
    },
    lastSyncedAt: delivery.sent ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "slack",
    connectionId: connection.connection?.id || null,
    status: delivery.sent ? "success" : "failure",
    payload: {
      startedAt,
      finishedAt,
      delivery,
      textPreview: text.slice(0, 1000),
      input,
    },
    errorMessage: delivery.sent ? null : delivery.reason,
  });

  return {
    status: delivery.sent ? "sent" : delivery.transport === "preview" ? "preview" : "error",
    configured: status.configured,
    delivery,
    textPreview: text,
    persistence: {
      connection,
      syncRun,
    },
  };
}
