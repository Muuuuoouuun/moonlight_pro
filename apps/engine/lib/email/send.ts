import { randomUUID } from "crypto";

import { logError, logEvent } from "@com-moon/hub-gateway";

import { insertSupabaseRecord, updateSupabaseRecord } from "../supabase-rest";
import { sendWithGmail } from "./gmail";
import { sendWithResend } from "./resend";
import { type EmailRecipient } from "./format";

export interface EmailSendRequest {
  action?: string;
  workspaceId?: string | null;
  channel?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  fromName?: string | null;
  replyTo?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  segmentId?: string | null;
  segmentLabel?: string | null;
  audience?: string | null;
}

function normalizeString(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

async function recordEmailSync({
  runId,
  workspaceId,
  connectionId = null,
  status,
  payload,
  startedAt,
  errorMessage = null,
}: {
  runId: string;
  workspaceId?: string | null;
  connectionId?: string | null;
  status: string;
  payload: Record<string, unknown>;
  startedAt: string;
  errorMessage?: string | null;
}) {
  return updateSupabaseRecord(
    "sync_runs",
    [["id", `eq.${runId}`]],
    {
      connection_id: connectionId,
      status,
      payload: {
        kind: "email_send",
        ...payload,
      },
      error_message: errorMessage,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    },
  );
}

async function initializeEmailSync({
  runId,
  workspaceId,
  startedAt,
  payload,
}: {
  runId: string;
  workspaceId?: string | null;
  startedAt: string;
  payload: Record<string, unknown>;
}) {
  return insertSupabaseRecord("sync_runs", {
    id: runId,
    workspace_id: workspaceId || null,
    status: "running",
    payload: {
      kind: "email_send",
      ...payload,
    },
    error_message: null,
    started_at: startedAt,
  });
}

function buildRecipient(input: EmailSendRequest): EmailRecipient[] {
  return [
    {
      email: normalizeString(input.recipientEmail),
      name: normalizeString(input.recipientName) || undefined,
    },
  ];
}

export async function sendEmail(input: EmailSendRequest) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const action = normalizeString(input.action, "dry-run");
  const dryRun = action !== "send";
  const channel = normalizeString(input.channel, "resend").toLowerCase();
  const workspaceId = normalizeString(input.workspaceId);
  const to = buildRecipient(input);
  const subject = normalizeString(input.subject);
  const body = normalizeString(input.body);

  if (!to[0]?.email || !subject || !body) {
    return {
      ok: false as const,
      reason: "missing-required-fields",
    };
  }

  if (!["resend", "gmail"].includes(channel)) {
    return {
      ok: false as const,
      reason: "unsupported-channel",
    };
  }

  const basePayload = {
    provider: channel,
    action,
    recipient: to[0].email,
    subject,
    templateId: normalizeString(input.templateId) || null,
    templateName: normalizeString(input.templateName) || null,
    segmentId: normalizeString(input.segmentId) || null,
    segmentLabel: normalizeString(input.segmentLabel) || null,
    audience: normalizeString(input.audience) || null,
    messageId: null,
  };

  await initializeEmailSync({
    runId,
    workspaceId,
    startedAt,
    payload: basePayload,
  });

  const result =
    channel === "gmail"
      ? await sendWithGmail({
          workspaceId,
          dryRun,
          to,
          subject,
          text: body,
          fromName: normalizeString(input.fromName) || undefined,
          replyTo: normalizeString(input.replyTo) || undefined,
        })
      : await sendWithResend({
          dryRun,
          to,
          subject,
          text: body,
          fromName: normalizeString(input.fromName) || undefined,
          replyTo: normalizeString(input.replyTo) || undefined,
        });

  const finalPayload = {
    ...basePayload,
    messageId: "messageId" in result ? result.messageId : null,
  };

  if (!result.ok) {
    const timestamp = new Date().toISOString();

    await recordEmailSync({
      runId,
      workspaceId,
      connectionId: "connection" in result ? result.connection?.id || null : null,
      status: "failure",
      payload: finalPayload,
      startedAt,
      errorMessage: result.reason,
    });

    await logError({
      source: "email",
      context: `${channel} email send failed`,
      trace: "apps/engine/lib/email/send.ts",
      timestamp,
      workspace_id: workspaceId || undefined,
      payload: {
        ...finalPayload,
        error: result.reason,
      },
    });

    return result;
  }

  const timestamp = new Date().toISOString();

  await recordEmailSync({
    runId,
    workspaceId,
    connectionId: "connection" in result ? result.connection?.id || null : null,
    status: "success",
    payload: finalPayload,
    startedAt,
  });

  await logEvent({
    source: "email",
    context: `${channel} email ${dryRun ? "preview" : "send"}`,
    trace: "apps/engine/lib/email/send.ts",
    timestamp,
    workspace_id: workspaceId || undefined,
    payload: finalPayload,
  });

  return result;
}
