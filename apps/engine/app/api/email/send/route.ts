import { NextResponse } from "next/server";

import { sendEmail, type EmailSendRequest } from "../../../../lib/email/send";

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
  };
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "/api/email/send",
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
    },
  });
}

export async function POST(req: Request) {
  try {
    const input = buildEmailRequest((await req.json()) as Record<string, unknown>);
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
