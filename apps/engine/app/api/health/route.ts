import { NextResponse } from "next/server";

import { getGeminiIntegrationStatus } from "../../../lib/gemini";
import { getGitHubIntegrationStatus } from "../../../lib/github-sync";
import { checkSupabaseRest } from "../../../lib/supabase-rest";
import { listSharedProjectWebhookRoutes, validateSharedWebhookRequest } from "../../../lib/shared-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authorization = validateSharedWebhookRequest(req);
  const includeDiagnostics = authorization.ok && authorization.mode !== "open";
  const supabase = await checkSupabaseRest();
  const isHealthy = supabase.reachable;
  const responseOptions = { status: isHealthy ? 200 : 503, headers: { "Cache-Control": "private, no-store" } };

  // Local open-webhook mode is not a verified server credential.
  if (!includeDiagnostics) {
    return NextResponse.json({
      status: isHealthy ? "ok" : "degraded",
      database: { supabase: { reachable: isHealthy } },
    }, responseOptions);
  }

  const sharedRoutes = listSharedProjectWebhookRoutes().map((path) => ({
    method: "POST",
    path,
  }));
  const body = {
    service: "com-moon-engine",
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database: {
      supabase,
    },
    integrations: {
      github: getGitHubIntegrationStatus(),
      gemini: getGeminiIntegrationStatus(),
    },
    auth: {
      sharedSecretConfigured: Boolean(process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()),
      openWebhookModeAllowed: process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS?.trim() === "true",
    },
    routes: [
      { method: "POST", path: "/api/webhook/project" },
      { method: "POST", path: "/api/email/send" },
      { method: "POST", path: "/api/integrations/github/sync" },
      { method: "POST", path: "/api/ai/brief" },
      ...sharedRoutes,
      { method: "GET", path: "/api/health" },
    ],
  };

  return NextResponse.json(body, responseOptions);
}
