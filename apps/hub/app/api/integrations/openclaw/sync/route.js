import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

async function callEngine(path, options = {}) {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return {
      status: 202,
      data: {
        status: "preview",
        error: "COM_MOON_ENGINE_URL is not configured.",
      },
    };
  }

  const headers = {
    ...(options.headers || {}),
  };
  const sharedSecret = resolveSharedSecret();

  if (sharedSecret) {
    headers["x-com-moon-shared-secret"] = sharedSecret;
  }

  const response = await fetch(`${engineUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  return {
    status: response.status,
    data,
  };
}

export async function GET() {
  const result = await callEngine("/api/integrations/openclaw/sync");

  return NextResponse.json(result.data, { status: result.status });
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  const result = await callEngine("/api/integrations/openclaw/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(parsed.data || {}),
  });

  return NextResponse.json(result.data, { status: result.status });
}
