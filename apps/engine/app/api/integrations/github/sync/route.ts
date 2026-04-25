import { NextResponse } from "next/server";

import {
  getGitHubIntegrationStatus,
  syncGitHubRepositories,
} from "../../../../../lib/github-sync";
import { validateSharedWebhookRequest } from "../../../../../lib/shared-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "github",
    status: getGitHubIntegrationStatus(),
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

  const result = await syncGitHubRepositories();
  const status = result.status === "error" ? 502 : result.status === "preview" ? 202 : 200;

  return NextResponse.json(result, { status });
}
