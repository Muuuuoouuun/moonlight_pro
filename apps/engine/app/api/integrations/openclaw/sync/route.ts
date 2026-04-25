import { NextResponse } from "next/server";

import { getOpenClawIntegrationStatus, syncOpenClaw } from "../../../../../lib/openclaw-sync";
import { validateSharedWebhookRequest } from "../../../../../lib/shared-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJson(req: Request) {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "openclaw",
    status: getOpenClawIntegrationStatus(),
  });
}

export async function POST(req: Request) {
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

  let payload: any = {};

  try {
    payload = await readJson(req);
  } catch {
    return NextResponse.json(
      {
        status: "invalid-json",
        error: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const result = await syncOpenClaw({
    projectId: typeof payload.projectId === "string" ? payload.projectId : null,
    transport: typeof payload.transport === "string" ? payload.transport : null,
    message: typeof payload.message === "string" ? payload.message : null,
  });
  const statusCode = result.status === "synced" ? 200 : result.status === "preview" ? 202 : 502;

  return NextResponse.json(result, { status: statusCode });
}
