import { NextResponse } from "next/server";

import { sendEmail, type EmailSendRequest } from "../../../../lib/email/send";
import {
  SHARED_WEBHOOK_SECRET_HEADER,
  validateSharedWebhookRequest,
} from "../../../../lib/shared-webhook";
import { fetchSupabaseRows } from "../../../../lib/supabase-rest";

export const runtime = "nodejs";

function normalizeString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function buildEmailRequest(payload: Record<string, unknown>): EmailSendRequest {
  return {
    action: normalizeString(payload.action, "dry-run"),
    workspaceId: normalizeString(payload.workspaceId) || null,
    channel: normalizeString(payload.channel, "resend"),
    recipientEmail:
      normalizeString(payload.recipientEmail) || normalizeString(payload.to),
    recipientName: normalizeString(payload.recipientName) || null,
    subject: normalizeString(payload.subject),
    body: normalizeString(payload.body),
    fromName: normalizeString(payload.fromName) || null,
    replyTo: normalizeString(payload.replyTo) || null,
    templateId: normalizeString(payload.templateId) || null,
    templateName: normalizeString(payload.templateName) || null,
    segmentId: normalizeString(payload.segmentId) || null,
    segmentLabel: normalizeString(payload.segmentLabel) || null,
    audience: normalizeString(payload.audience) || null,
    approvedWorkOrderId:
      normalizeString(payload.approvedWorkOrderId) ||
      normalizeString(payload.workOrderId) ||
      null,
  };
}

function eqFilter(value: string) {
  return `eq.${value}`;
}

function valueAtPath(obj: Record<string, unknown>, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
}

function expectedBodyMatches(body: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.entries(expected).every(([key, value]) => {
    if (value == null || value === "") return true;
    return String(valueAtPath(body || {}, key) ?? "") === String(value);
  });
}

async function validateEmailApproval(input: EmailSendRequest) {
  if (normalizeString(input.action, "dry-run") !== "send") {
    return { ok: true, reason: "dry-run" };
  }
  if (!input.workspaceId || !input.approvedWorkOrderId) {
    return { ok: false, reason: "missing-approval" };
  }

  const rows = await fetchSupabaseRows("work_orders", {
    filters: [
      ["workspace_id", eqFilter(input.workspaceId)],
      ["id", eqFilter(input.approvedWorkOrderId)],
    ],
    limit: 1,
  });
  const order = rows?.[0] as
    | {
        status?: string;
        gate?: string;
        kind?: string;
        body?: Record<string, unknown>;
      }
    | undefined;
  if (!order) return { ok: false, reason: "approval-not-found" };
  if (order.status !== "executing") return { ok: false, reason: "approval-not-claimed" };
  if (order.gate !== "human_approval") return { ok: false, reason: "approval-gate-mismatch" };
  if (order.kind !== "email_send") return { ok: false, reason: "approval-kind-mismatch" };
  if (!expectedBodyMatches(order.body || {}, {
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    body: input.body,
    channel: input.channel,
    templateId: input.templateId,
    audience: input.audience,
  })) {
    return { ok: false, reason: "approval-body-mismatch" };
  }
  return { ok: true, reason: "ok" };
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "/api/email/send",
    auth: {
      header: SHARED_WEBHOOK_SECRET_HEADER,
      requiredWhenConfigured: true,
    },
    accepts: {
      action: "dry-run | send",
      channel: "resend | gmail",
      workspaceId: "string (optional)",
      recipientEmail: "string",
      recipientName: "string (optional)",
      subject: "string",
      body: "string",
      fromName: "string (optional)",
      replyTo: "string (optional)",
      templateId: "string (optional)",
      templateName: "string (optional)",
      segmentId: "string (optional)",
      segmentLabel: "string (optional)",
      audience: "string (optional)",
      approvedWorkOrderId: "string (required for action=send after Hub claims an approved work order)",
    },
  });
}

export async function POST(req: Request) {
  try {
    const auth = validateSharedWebhookRequest(req);
    if (!auth.ok) {
      return NextResponse.json(
        {
          status: "unauthorized",
          error: auth.error,
        },
        { status: 401 },
      );
    }

    const input = buildEmailRequest((await req.json()) as Record<string, unknown>);
    const approval = await validateEmailApproval(input);
    if (!approval.ok) {
      return NextResponse.json(
        {
          status: "approval_required",
          error: `Approved matching workOrderId is required before email send (${approval.reason}).`,
        },
        { status: 403 },
      );
    }

    const result = await sendEmail(input);

    if (!result.ok) {
      if (
        result.reason === "missing-resend-config" ||
        result.reason === "missing-gmail-refresh-token" ||
        result.reason === "missing-gmail-sender-email" ||
        result.reason === "missing-gmail-access-token" ||
        result.reason === "unsupported-channel"
      ) {
        return NextResponse.json(
          {
            status: "preview",
            message: "Provider is not fully connected yet. Preview only.",
            reason: result.reason,
            provider: input.channel,
          },
          { status: 202 },
        );
      }

      if (result.reason === "missing-required-fields") {
        return NextResponse.json(
          {
            status: "error",
            error: "Recipient, subject, and body are required.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json(
        {
          status: "error",
          error: result.reason,
          provider: input.channel,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: input.action === "send" ? "sent" : "preview",
      message:
        input.action === "send"
          ? "Email sent successfully."
          : "Dry-run complete. Provider is ready for a real send.",
      provider: result.provider,
      messageId: result.messageId,
      preview: result.preview,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
