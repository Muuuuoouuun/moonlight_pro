import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

export async function GET() {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return NextResponse.json({
      status: "missing-config",
      provider: "resend",
      configured: false,
      reason: "COM_MOON_ENGINE_URL not set",
    });
  }

  try {
    const response = await fetch(`${engineUrl}/api/health`, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({
        status: "degraded",
        provider: "resend",
        configured: false,
        reason: `engine-health-http-${response.status}`,
      });
    }

    const body = await response.json();
    const resend = body?.integrations?.resend || null;

    return NextResponse.json({
      status: resend?.configured ? "connected" : "missing-config",
      provider: "resend",
      configured: Boolean(resend?.configured),
      fromEmail: resend?.fromEmail || null,
    });
  } catch (error) {
    return NextResponse.json({
      status: "degraded",
      provider: "resend",
      configured: false,
      reason: error instanceof Error ? error.message : "engine-unreachable",
    });
  }
}
