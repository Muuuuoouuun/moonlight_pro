import { NextResponse } from "next/server";

import {
  getGitHubIntegrationStatus,
  parseProductRepositories,
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

  // 본문은 선택이다 — 비어 있으면 환경 변수 목록만 동기화한다(기존 호출 호환).
  const body = await req.json().catch(() => null);
  const result = await syncGitHubRepositories({
    productRepositories: parseProductRepositories(body?.productRepositories),
  });
  const status = result.status === "error" ? 502 : result.status === "preview" ? 202 : 200;

  return NextResponse.json(result, { status });
}
