import { NextResponse } from "next/server";
import { getGenaiStatus } from "@com-moon/genai-transport";
import { hasHubServerCredential } from "@/lib/hub-write-guard";

import {
  resolveControlPlaneReadiness,
  resolveGoogleOAuthProviderReadiness,
  resolveSecretReadiness,
} from "@/lib/integration-readiness";
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
      signal: AbortSignal.timeout(5000),
    });

    return {
      ok: response.ok,
      status: response.status,
      reason: response.ok ? "ok" : "http-error",
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "request-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(req) {
  const includeDiagnostics = Boolean(req && hasHubServerCredential(req));
  const [supabase, controlPlane] = await Promise.all([
    checkSupabaseRest(),
    includeDiagnostics ? resolveControlPlaneReadiness() : null,
  ]);
  const isHealthy = supabase.ok;
  const responseOptions = { status: isHealthy ? 200 : 503, headers: { "Cache-Control": "private, no-store" } };

  // Public probes retain the readiness fields used by deployment checks.
  // Configuration and upstream errors require the existing server credential.
  if (!includeDiagnostics) {
    return NextResponse.json({
      status: isHealthy ? "ok" : "degraded",
      database: { supabase: { ok: isHealthy } },
    }, responseOptions);
  }

  const googleOAuth = resolveGoogleOAuthProviderReadiness();
  const secrets = resolveSecretReadiness();

  return NextResponse.json({
    service: "moonlight-hub",
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database: {
      supabase,
    },
    config: {
      workspaceConfigured: Boolean(resolveDefaultWorkspaceId()),
      engineUrlConfigured: controlPlane.engine.configured,
      hubUrlConfigured: Boolean(
        process.env.COM_MOON_HUB_URL?.trim() ||
          process.env.NEXT_PUBLIC_APP_URL?.trim(),
      ),
      sharedWebhookSecretConfigured: secrets.sharedWebhook.configured,
      oauthStateSecretConfigured: secrets.oauthState.configured,
      hubWriteSecretConfigured: secrets.hubWrite.configured,
      secretsSeparated: secrets.separated,
      googleOAuthConfigured: googleOAuth.calendar.configured,
      githubConfigured: Boolean(process.env.GITHUB_REPOSITORIES?.trim()),
      geminiConfigured: getGenaiStatus().configured,
    },
    integrations: {
      engine: controlPlane.engine,
      googleOAuth,
      secrets,
    },
    routes: [
      { method: "GET", path: "/api/health" },
      { method: "POST", path: "/api/ai/brief" },
      { method: "GET", path: "/api/calendar/google/connect" },
      { method: "GET", path: "/api/email/gmail/connect" },
      { method: "POST", path: "/api/email/send" },
      { method: "POST", path: "/api/integrations/github/sync" },
      { method: "POST", path: "/api/projects/update" },
      { method: "POST", path: "/api/routine/check" },
      { method: "POST", path: "/api/webhooks/project-test" },
      { method: "GET", path: "/dashboard" },
    ],
  }, responseOptions);
}
