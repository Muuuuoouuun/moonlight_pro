import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

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

    const engineUrl = resolveEngineUrl();

    if (!engineUrl) {
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
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      status: "error",
      error: `Engine email route returned ${response.status}.`,
    }));

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
