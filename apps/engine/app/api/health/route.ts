import { NextResponse } from "next/server";

import { getGeminiIntegrationStatus } from "../../../lib/gemini";
import { getGitHubIntegrationStatus } from "../../../lib/github-sync";
import { getOpenClawIntegrationStatus } from "../../../lib/openclaw-sync";
import { checkSupabaseRest } from "../../../lib/supabase-rest";
import { listSharedProjectWebhookRoutes } from "../../../lib/shared-webhook";

export const runtime = "nodejs";

export async function GET() {
  const sharedRoutes = listSharedProjectWebhookRoutes().map((path) => ({
    method: "POST",
    path,
  }));
  const supabase = await checkSupabaseRest();
  const isHealthy = supabase.reachable;
  const body = {
    service: "com-moon-engine",
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database: {
      supabase,
    },
    integrations: {
      github: getGitHubIntegrationStatus(),
      openclaw: getOpenClawIntegrationStatus(),
      gemini: getGeminiIntegrationStatus(),
    },
    auth: {
      sharedSecretConfigured: Boolean(process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()),
      telegramSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
      openWebhookModeAllowed: process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS?.trim() === "true",
    },
    commands: ["/cardnews", "/status", "/ping", "/projects", "/pms", "/webhooks"],
    routes: [
      { method: "POST", path: "/api/webhook/telegram" },
      { method: "POST", path: "/api/webhook/project" },
      { method: "POST", path: "/api/email/send" },
      { method: "POST", path: "/api/integrations/github/sync" },
      { method: "POST", path: "/api/integrations/openclaw/sync" },
      { method: "POST", path: "/api/ai/brief" },
      ...sharedRoutes,
      { method: "GET", path: "/api/health" },
    ],
  };

  return NextResponse.json(body, { status: isHealthy ? 200 : 503 });
}
