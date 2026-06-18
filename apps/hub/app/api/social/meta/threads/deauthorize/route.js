import { NextResponse } from "next/server";

import {
  disableMetaThreadsConnectionsForUser,
  parseMetaThreadsSignedRequest,
  recordMetaThreadsSync,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSignedRequest(req) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    return body?.signed_request || body?.signedRequest || "";
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.text().catch(() => "");
    return new URLSearchParams(body).get("signed_request") || "";
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return form?.get("signed_request") || "";
  }

  const body = await req.text().catch(() => "");
  return new URLSearchParams(body).get("signed_request") || "";
}

function extractUserId(payload) {
  return payload?.user_id || payload?.userId || payload?.profile_id || null;
}

export async function GET() {
  return NextResponse.json({
    status: "ready",
    provider: "meta_threads",
    callback: "deauthorize",
  });
}

export async function POST(req) {
  const workspaceId = resolveDefaultWorkspaceId();
  const signedRequest = await readSignedRequest(req);
  const parsed = parseMetaThreadsSignedRequest(signedRequest);

  if (!parsed.valid) {
    await recordMetaThreadsSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "deauthorize_callback",
      },
      errorMessage: parsed.error,
    });

    return NextResponse.json(
      {
        status: "invalid",
        error: parsed.error,
      },
      { status: 400 },
    );
  }

  const userId = extractUserId(parsed.payload);
  const result = await disableMetaThreadsConnectionsForUser({
    workspaceId,
    userId,
    reason: "deauthorize",
  });

  await recordMetaThreadsSync({
    workspaceId,
    status: "success",
    payload: {
      action: "deauthorize_callback",
      userId,
      matchedConnections: result.matched,
      updatedConnections: result.updated,
    },
  });

  return NextResponse.json({
    status: "received",
    provider: "meta_threads",
    userId,
    matchedConnections: result.matched,
    updatedConnections: result.updated,
  });
}
