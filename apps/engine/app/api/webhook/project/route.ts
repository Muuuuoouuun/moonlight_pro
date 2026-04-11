import { NextResponse } from "next/server";

import { failProjectWebhook, handleProjectWebhook } from "../../../../lib/project-webhook";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "/api/webhook/project",
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
    body = await req.json();
    const result = await handleProjectWebhook(body);
    return NextResponse.json(result, { status: 202 });
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
