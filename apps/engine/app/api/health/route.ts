import { NextResponse } from "next/server";

import { listSharedProjectWebhookRoutes } from "../../../lib/shared-webhook";

export const runtime = "nodejs";

export async function GET() {
  const sharedRoutes = listSharedProjectWebhookRoutes().map((path) => ({
    method: "POST",
    path,
  }));

  return NextResponse.json({
    service: "com-moon-engine",
    status: "ok",
    timestamp: new Date().toISOString(),
    commands: ["/cardnews", "/status", "/ping", "/projects", "/pms", "/webhooks"],
    routes: [
      { method: "POST", path: "/api/webhook/telegram" },
      { method: "POST", path: "/api/webhook/project" },
      ...sharedRoutes,
      { method: "GET", path: "/api/health" },
    ],
  });
}
