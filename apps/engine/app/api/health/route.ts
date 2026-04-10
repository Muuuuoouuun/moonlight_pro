import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    status: "ok",
    timestamp: new Date().toISOString(),
    commands: ["/cardnews", "/status", "/ping", "/projects", "/pms", "/webhooks"],
    routes: [
      { method: "POST", path: "/api/webhook/telegram" },
      { method: "POST", path: "/api/webhook/project" },
      { method: "GET", path: "/api/health" },
    ],
  });
}
