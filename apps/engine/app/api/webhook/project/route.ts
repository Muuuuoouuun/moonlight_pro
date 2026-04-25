import { NextResponse } from "next/server";

import { failProjectWebhook, handleProjectWebhook } from "../../../../lib/project-webhook";
import {
  SHARED_WEBHOOK_SECRET_HEADER,
  validateSharedWebhookRequest,
} from "../../../../lib/shared-webhook";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "/api/webhook/project",
    auth: {
      header: SHARED_WEBHOOK_SECRET_HEADER,
      requiredWhenConfigured: true,
    },
    sharedProviderRoutes: [
      "/api/webhook/project/openclaw",
      "/api/webhook/project/moltbot",
    ],
    accepts: {
      workspaceId: "string (optional if COM_MOON_DEFAULT_WORKSPACE_ID is configured)",
      projectId: "uuid (optional)",
      title: "string",
      summary: "string",
      status: "reported | active | blocked | done | completed | pending | skipped",
      progress: "number (0-100)",
      milestone: "string",
      nextAction: "string",
      checkType: "morning | midday | evening | weekly",
    },
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};

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

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          status: "invalid-json",
          error: "Request body must be valid JSON.",
        },
        { status: 400 },
      );
    }

    const result = await handleProjectWebhook(body);
    const statusCode =
      result.status === "duplicate"
        ? 200
        : result.status === "accepted"
          ? 202
          : result.status === "partial"
            ? 207
            : result.persistence.webhookEvent.reason === "missing-config" ||
                result.persistence.projectUpdate.reason === "missing-config"
              ? 202
              : result.persistence.webhookEvent.reason === "missing-workspace" ||
                  result.persistence.projectUpdate.reason === "missing-workspace"
                ? 400
            : 500;
    return NextResponse.json(
      {
        ...result,
        auth: auth.mode,
      },
      { status: statusCode },
    );
  } catch (error) {
    await failProjectWebhook(error, body);
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
