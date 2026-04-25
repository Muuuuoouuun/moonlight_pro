import { NextResponse } from "next/server";

import {
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkSupabaseRest() {
  const config = resolveSupabaseConfig();

  if (!config) {
    return {
      ok: false,
      reason: "missing-config",
    };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/projects?select=id&limit=1`, {
      headers: makeSupabaseHeaders(config.apiKey),
      cache: "no-store",
    });

    return {
      ok: response.ok,
      status: response.status,
      reason: response.ok ? "ok" : "http-error",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "request-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const supabase = await checkSupabaseRest();
  const isHealthy = supabase.ok;

  return NextResponse.json({
    service: "moonlight-hub",
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database: {
      supabase,
    },
    config: {
      workspaceConfigured: Boolean(resolveDefaultWorkspaceId()),
      engineUrlConfigured: Boolean(process.env.COM_MOON_ENGINE_URL?.trim()),
      hubUrlConfigured: Boolean(
        process.env.COM_MOON_HUB_URL?.trim() ||
          process.env.NEXT_PUBLIC_APP_URL?.trim(),
      ),
      sharedWebhookSecretConfigured: Boolean(
        process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim(),
      ),
      oauthStateSecretConfigured: Boolean(
        process.env.COM_MOON_OAUTH_STATE_SECRET?.trim() ||
          process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim(),
      ),
      googleOAuthConfigured: Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_CLIENT_SECRET?.trim(),
      ),
      githubConfigured: Boolean(process.env.GITHUB_REPOSITORIES?.trim()),
      openClawConfigured: Boolean(
        process.env.OPENCLAW_LOCAL_URL?.trim() ||
          process.env.OPENCLAW_REMOTE_URL?.trim() ||
          (
            process.env.TELEGRAM_BOT_TOKEN?.trim() &&
            process.env.OPENCLAW_TELEGRAM_CHAT_ID?.trim()
          ) ||
          process.env.OPENCLAW_SLACK_WEBHOOK_URL?.trim(),
      ),
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY?.trim() ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
      ),
    },
    routes: [
      { method: "GET", path: "/api/health" },
      { method: "POST", path: "/api/ai/brief" },
      { method: "GET", path: "/api/calendar/google/connect" },
      { method: "GET", path: "/api/email/gmail/connect" },
      { method: "POST", path: "/api/email/send" },
      { method: "POST", path: "/api/integrations/github/sync" },
      { method: "POST", path: "/api/integrations/openclaw/sync" },
      { method: "POST", path: "/api/projects/update" },
      { method: "POST", path: "/api/routine/check" },
      { method: "POST", path: "/api/webhooks/project-test" },
      { method: "GET", path: "/dashboard" },
    ],
  }, { status: isHealthy ? 200 : 503 });
}
