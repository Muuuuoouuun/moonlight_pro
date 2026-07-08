import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import {
  claimApprovedWorkOrderForExecution,
  createWorkOrder,
  decideWorkOrder,
  releaseWorkOrderExecution,
} from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedWebhookSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

function buildEmailPayload(payload) {
  return {
    action: normalizeString(payload.action, "dry-run"),
    workspaceId:
      normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId(),
    channel: normalizeString(payload.channel, "resend").toLowerCase(),
    recipientEmail:
      normalizeString(payload.recipientEmail) || normalizeString(payload.to),
    recipientName: normalizeString(payload.recipientName),
    subject: normalizeString(payload.subject),
    body: normalizeString(payload.body),
    fromName: normalizeString(payload.fromName),
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

function emailApprovalBody(payload) {
  return {
    recipientEmail: payload.recipientEmail,
    subject: payload.subject,
    body: payload.body,
    channel: payload.channel,
    templateId: payload.templateId,
    audience: payload.audience,
  };
}

async function requireEmailApproval(payload) {
  if (payload.action !== "send") {
    return { ok: true, approvedWorkOrderId: null };
  }

  if (payload.approvedWorkOrderId) {
    const approved = await claimApprovedWorkOrderForExecution({
      workspaceId: payload.workspaceId,
      id: payload.approvedWorkOrderId,
      kind: "email_send",
      expectedBody: emailApprovalBody(payload),
    });
    if (!approved.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            status: "approval_invalid",
            error: `Approved matching workOrderId is required before email send (${approved.reason}).`,
            approvedWorkOrderId: payload.approvedWorkOrderId,
          },
          { status: 403 },
        ),
      };
    }
    return { ok: true, approvedWorkOrderId: payload.approvedWorkOrderId };
  }

  const workOrder = await createWorkOrder({
    workspaceId: payload.workspaceId,
    persona: "production",
    kind: "email_send",
    title: `이메일 발송 승인 필요 · ${payload.recipientEmail}`,
    body: {
      gate: "human_approval",
      workspaceId: payload.workspaceId,
      ...emailApprovalBody(payload),
      recipientName: payload.recipientName,
      fromName: payload.fromName,
      replyTo: payload.replyTo,
      policy: {
        noDirectCustomerSendWithoutApproval: true,
      },
    },
    channel: "email",
    gate: "human_approval",
    source: "manual",
  });

  return {
    ok: false,
    response: NextResponse.json(
      {
        status: "approval_required",
        message: workOrder.persisted
          ? "Email send was queued for human approval. No customer email was sent."
          : "Email send requires human approval, but the approval queue could not be persisted. No customer email was sent.",
        workOrder,
      },
      { status: 202 },
    ),
  };
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req);
    if (parsed.error) {
      return parsed.error;
    }

    const payload = buildEmailPayload(parsed.data);

    if (!payload.recipientEmail) {
      return NextResponse.json(
        {
          status: "error",
          error: "Recipient email is required.",
        },
        { status: 400 },
      );
    }

    if (!payload.subject || !payload.body) {
      return NextResponse.json(
        {
          status: "error",
          error: "Subject and body are required.",
        },
        { status: 400 },
      );
    }

    const approval = await requireEmailApproval(payload);
    if (!approval.ok) {
      return approval.response;
    }

    const engineUrl = resolveEngineUrl();

    if (!engineUrl) {
      if (approval.approvedWorkOrderId) {
        await releaseWorkOrderExecution({
          workspaceId: payload.workspaceId,
          id: approval.approvedWorkOrderId,
        }).catch(() => null);
      }
      return NextResponse.json(
        {
          status: "preview",
          message: "Engine URL is not configured yet. Preview only.",
          preview: payload,
        },
        { status: 202 },
      );
    }

    const response = await fetch(`${engineUrl}/api/email/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(resolveSharedWebhookSecret()
          ? { "x-com-moon-shared-secret": resolveSharedWebhookSecret() }
          : {}),
      },
      body: JSON.stringify({
        ...payload,
        approvedWorkOrderId: approval.approvedWorkOrderId,
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      status: "error",
      error: `Engine email route returned ${response.status}.`,
    }));

    if (response.ok && data?.status === "sent" && approval.approvedWorkOrderId) {
      data.workOrderExecution = await decideWorkOrder({
        id: approval.approvedWorkOrderId,
        status: "executed",
      }).catch((error) => ({
        persisted: false,
        reason: "work-order-execution-failed",
        detail: error instanceof Error ? error.message : String(error),
      }));
    } else if (approval.approvedWorkOrderId) {
      data.workOrderRelease = await releaseWorkOrderExecution({
        workspaceId: payload.workspaceId,
        id: approval.approvedWorkOrderId,
      }).catch((error) => ({
        persisted: false,
        reason: "work-order-release-failed",
        detail: error instanceof Error ? error.message : String(error),
      }));
    }

    return NextResponse.json(data, { status: response.status });
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
