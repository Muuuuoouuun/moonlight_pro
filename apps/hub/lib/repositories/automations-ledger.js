import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const AUTOMATION_STATUSES = ["draft", "active", "paused", "disabled"];
const RUN_STATUSES = ["queued", "running", "success", "failure", "ignored"];
const WEBHOOK_STATUSES = ["received", "processed", "ignored", "failed"];
const INTEGRATION_STATUSES = ["pending", "connected", "error", "disabled"];

const AUTOMATION_STATUS_LABEL = {
  draft: "Paused",
  active: "Active",
  paused: "Paused",
  disabled: "Paused",
};

const RUN_STATUS_TONE = {
  success: "ok",
  running: "ok",
  queued: "ok",
  ignored: "warn",
  failure: "err",
};

const WEBHOOK_STATUS_TONE = {
  processed: "ok",
  received: "ok",
  ignored: "warn",
  failed: "err",
};

function startOfDayUTC() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

function last24hThreshold() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "곧";

  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;

  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
}

function formatClock(value) {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function computeDurationMs(startedAt, finishedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function resolveTriggerLabel(trigger) {
  if (!trigger) return "Manual";
  if (trigger.trigger_type === "schedule") {
    const when = trigger.config?.cron || trigger.config?.time || trigger.config?.label;
    return when ? `Schedule · ${when}` : "Schedule";
  }
  if (trigger.trigger_type === "webhook") return "Webhook";
  if (trigger.trigger_type === "event") {
    const event = trigger.config?.event || trigger.config?.type;
    return event ? `Event · ${event}` : "Event";
  }
  return "Manual";
}

function mapAutomations(rows, triggerById, runsByAutomation) {
  return rows.map((row) => {
    const trigger = row.trigger_id ? triggerById.get(row.trigger_id) : null;
    const stats = runsByAutomation.get(row.id) || { runs24: 0, success: 0 };
    const statusKey = AUTOMATION_STATUSES.includes(row.status) ? row.status : "draft";

    return {
      id: row.id,
      name: row.name || "Untitled flow",
      trigger: resolveTriggerLabel(trigger),
      status: AUTOMATION_STATUS_LABEL[statusKey] || "Paused",
      lastRun: formatRelative(row.last_run_at),
      runs24: stats.runs24,
      success: stats.success,
    };
  });
}

function mapRuns(rows, automationById) {
  return rows.map((row) => {
    const automation = row.automation_id ? automationById.get(row.automation_id) : null;
    const duration = computeDurationMs(row.created_at, row.finished_at);
    const statusKey = RUN_STATUSES.includes(row.status) ? row.status : "queued";

    return {
      id: row.id,
      at: formatClock(row.created_at),
      flow: automation?.name || "System",
      status: RUN_STATUS_TONE[statusKey] || "ok",
      statusKey,
      ms: duration == null ? 0 : duration,
      detail: row.error_message || row.output_payload?.summary || row.output_payload?.detail || "ok",
      correlationId: row.correlation_id || null,
      providerEventId: row.provider_event_id || null,
      startedAt: row.created_at,
      finishedAt: row.finished_at || null,
    };
  });
}

function mapWebhookEvents(rows) {
  return rows.map((row) => {
    const statusKey = WEBHOOK_STATUSES.includes(row.status) ? row.status : "received";
    return {
      id: row.id,
      source: row.source || "webhook",
      eventType: row.event_type,
      status: WEBHOOK_STATUS_TONE[statusKey] || "ok",
      statusKey,
      receivedAt: row.received_at,
      processedAt: row.processed_at || null,
      lastHit: formatRelative(row.received_at),
      errorMessage: row.error_message || null,
      correlationId: row.correlation_id || null,
      providerEventId: row.provider_event_id || null,
    };
  });
}

function mapIntegrations(rows) {
  return rows.map((row) => {
    const statusKey = INTEGRATION_STATUSES.includes(row.status) ? row.status : "pending";
    return {
      id: row.id,
      provider: row.provider,
      status: statusKey,
      lastSync: formatRelative(row.last_synced_at),
      lastSyncedAt: row.last_synced_at || null,
      externalAccountId: row.external_account_id || null,
    };
  });
}

function mapErrors(rows) {
  return rows.map((row) => ({
    id: row.id,
    context: row.context,
    level: row.level,
    source: row.source,
    resolved: !!row.resolved,
    when: formatRelative(row.timestamp),
    timestamp: row.timestamp,
    correlationId: row.correlation_id || null,
    automationRunId: row.automation_run_id || null,
  }));
}

function aggregateRuns(runRows, since) {
  const byAutomation = new Map();
  let runsToday = 0;
  let failuresToday = 0;

  runRows.forEach((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (!row.automation_id || !createdAt) return;
    if (createdAt < since) return;

    runsToday += 1;
    if (row.status === "failure") failuresToday += 1;

    const stats = byAutomation.get(row.automation_id) || { runs24: 0, success: 0 };
    stats.runs24 += 1;
    if (row.status === "success") stats.success += 1;
    byAutomation.set(row.automation_id, stats);
  });

  return { byAutomation, runsToday, failuresToday };
}

function emptyLedger({ configured, workspaceId }) {
  return {
    source: "preview",
    configured,
    workspaceId,
    automations: [],
    runs: [],
    webhookEvents: [],
    errors: [],
    integrations: [],
    summary: {
      runsToday: 0,
      failuresToday: 0,
      activeAutomations: 0,
      webhookEventsToday: 0,
      integrationsConnected: 0,
    },
  };
}

export async function getAutomationsLedger() {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return emptyLedger({ configured: false, workspaceId: null });
  }

  const since = last24hThreshold();
  const sinceDayStart = startOfDayUTC();

  const [automationRows, triggerRows, runRows, webhookRows, integrationRows, errorRows] = await Promise.all([
    fetchSupabaseRows("automations", {
      limit: 40,
      order: "last_run_at.desc.nullslast",
      filters: withWorkspaceFilter([
        ["status", inFilter(AUTOMATION_STATUSES)],
      ]),
    }),
    fetchSupabaseRows("triggers", {
      limit: 80,
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("automation_runs", {
      limit: 120,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("webhook_events", {
      limit: 60,
      order: "received_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("integration_connections", {
      limit: 40,
      order: "last_synced_at.desc.nullslast",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("error_logs", {
      limit: 40,
      order: "timestamp.desc",
      filters: withWorkspaceFilter([["resolved", eqFilter("false")]]),
    }),
  ]);

  if (!automationRows || !runRows || !webhookRows) {
    return emptyLedger({ configured: true, workspaceId });
  }

  const triggerById = new Map((triggerRows || []).map((t) => [t.id, t]));
  const { byAutomation, runsToday, failuresToday } = aggregateRuns(runRows, since);
  const automations = mapAutomations(automationRows, triggerById, byAutomation);
  const automationById = new Map(automations.map((a) => [a.id, a]));
  const runs = mapRuns(runRows.slice(0, 40), automationById);
  const webhookEvents = mapWebhookEvents(webhookRows);
  const integrations = mapIntegrations(integrationRows || []);
  const errors = mapErrors(errorRows || []);

  const webhookEventsToday = webhookRows.filter((row) => {
    if (!row.received_at) return false;
    return new Date(row.received_at) >= sinceDayStart;
  }).length;

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    automations,
    runs,
    webhookEvents,
    errors,
    integrations,
    summary: {
      runsToday,
      failuresToday,
      activeAutomations: automations.filter((a) => a.status === "Active").length,
      webhookEventsToday,
      integrationsConnected: integrations.filter((i) => i.status === "connected").length,
    },
  };
}
