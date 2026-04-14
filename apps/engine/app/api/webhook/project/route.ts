import { NextResponse } from "next/server";

import { failProjectWebhook, handleProjectWebhook } from "../../../../lib/project-webhook";
import {
  getSharedWebhookAuthDetails,
  listSharedProjectWebhookRoutes,
  validateSharedWebhookRequest,
} from "../../../../lib/shared-webhook";

export const runtime = "nodejs";

export async function GET() {
  const auth = getSharedWebhookAuthDetails();

  return NextResponse.json({
    status: "ok",
    route: "/api/webhook/project",
    auth,
    sharedProviderRoutes: listSharedProjectWebhookRoutes(),
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
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      {
        status: "unauthorized",
        error: auth.error,
        route: "/api/webhook/project",
      },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};

  try {
    body = await req.json();
    const result = await handleProjectWebhook(body);
    return NextResponse.json(
      {
        ...result,
        auth: auth.mode,
      },
      { status: 202 },
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
