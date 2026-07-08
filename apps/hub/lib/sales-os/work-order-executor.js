import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { decideWorkOrder, getApprovedWorkOrder } from "@/lib/sales-os/work-orders";

const EXTERNAL_ACTION_KINDS = new Set(["content_handoff", "content_export", "email_send"]);

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item != null && item !== ""),
  );
}

function parseReplayPayload(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function forwardedWriteHeaders(req) {
  const headers = { "content-type": "application/json" };
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const cookie = req.headers.get("cookie");
  const writeSecret = req.headers.get("x-com-moon-hub-write-secret");
  const authorization = req.headers.get("authorization");

  headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (writeSecret) headers["x-com-moon-hub-write-secret"] = writeSecret;
  if (authorization) headers.authorization = authorization;

  return headers;
}

async function postHubRoute(req, path, payload) {
  const response = await fetch(new URL(path, req.url), {
    method: "POST",
    headers: forwardedWriteHeaders(req),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({
    status: "error",
    error: `Route returned ${response.status}.`,
  }));

  return { ok: response.ok, status: response.status, data };
}

function contentPayloadFor(order) {
  const body = order.body || {};
  const replay = parseReplayPayload(body.replay);
  const action = body.action || (order.kind === "content_export" ? "export" : "handoff");

  return compactObject({
    ...replay,
    action,
    contentId: body.contentId,
    variantId: body.variantId || order.assetId,
    event: body.event,
    status: body.status,
    channel: body.channel || order.channel,
    targetChannel: body.targetChannel,
    exportProfile: body.exportProfile,
    approvedWorkOrderId: order.id,
  });
}

function emailPayloadFor(order) {
  const body = order.body || {};
  return compactObject({
    action: "send",
    workspaceId: body.workspaceId || resolveDefaultWorkspaceId(),
    channel: body.channel || order.channel || "resend",
    recipientEmail: body.recipientEmail,
    recipientName: body.recipientName,
    subject: body.subject,
    body: body.body,
    fromName: body.fromName,
    replyTo: body.replyTo,
    templateId: body.templateId,
    audience: body.audience,
    approvedWorkOrderId: order.id,
  });
}

export function workOrderCanExecute(order) {
  return EXTERNAL_ACTION_KINDS.has(order?.kind);
}

export async function executeApprovedWorkOrder({ req, id } = {}) {
  const approved = await getApprovedWorkOrder({ id });
  if (!approved.ok) {
    return {
      ok: false,
      status: 403,
      data: {
        status: "approval_invalid",
        error: `Approved work order is required before execution (${approved.reason}).`,
        workOrderId: id || null,
      },
    };
  }

  const order = approved.order;

  if (order.kind === "content_handoff" || order.kind === "content_export") {
    const payload = contentPayloadFor(order);
    if (!payload.variantId) {
      return {
        ok: false,
        status: 400,
        data: {
          status: "execution_blocked",
          error: "Content work order is missing variantId.",
          workOrderId: order.id,
        },
      };
    }
    const result = await postHubRoute(req, "/api/hub/content", payload);
    return {
      ok: result.ok,
      status: result.status,
      data: {
        ...result.data,
        workOrderId: order.id,
        executedVia: "content",
      },
    };
  }

  if (order.kind === "email_send") {
    const payload = emailPayloadFor(order);
    if (!payload.recipientEmail || !payload.subject || !payload.body) {
      return {
        ok: false,
        status: 400,
        data: {
          status: "execution_blocked",
          error: "Email work order is missing recipientEmail, subject, or body.",
          workOrderId: order.id,
        },
      };
    }
    const result = await postHubRoute(req, "/api/email/send", payload);
    return {
      ok: result.ok,
      status: result.status,
      data: {
        ...result.data,
        workOrderId: order.id,
        executedVia: "email",
      },
    };
  }

  const persistence = await decideWorkOrder({ id: order.id, status: "executed" });
  return {
    ok: persistence.persisted,
    status: persistence.persisted ? 200 : 400,
    data: {
      status: persistence.persisted ? "marked_executed" : "execution_failed",
      message: persistence.persisted
        ? "Approved manual work order was marked executed."
        : "Approved manual work order could not be marked executed.",
      workOrderId: order.id,
      persistence,
    },
  };
}
