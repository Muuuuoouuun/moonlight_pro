import { NextResponse } from "next/server";
import { createHash } from "crypto";

import {
  buildMetaThreadsSetupUrls,
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

function buildConfirmationCode(userId) {
  return createHash("sha256")
    .update(`${userId || "unknown"}:${Date.now()}`)
    .digest("hex")
    .slice(0, 20);
}

export async function GET(req) {
  const { origin } = req.nextUrl;
  return NextResponse.json({
    status: "ready",
    provider: "meta_threads",
    callback: "data-deletion",
    instructionsUrl: buildMetaThreadsSetupUrls(origin).dataDeletionUrl,
  });
}

export async function POST(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const signedRequest = await readSignedRequest(req);
  const parsed = parseMetaThreadsSignedRequest(signedRequest);
  const setup = buildMetaThreadsSetupUrls(origin);

  if (!parsed.valid) {
    await recordMetaThreadsSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "data_deletion_callback",
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
  const confirmationCode = buildConfirmationCode(userId);
  const result = await disableMetaThreadsConnectionsForUser({
    workspaceId,
    userId,
    reason: "data-deletion",
  });
  const statusUrl = `${setup.dataDeletionUrl}?code=${encodeURIComponent(confirmationCode)}`;

  await recordMetaThreadsSync({
    workspaceId,
    status: "success",
    payload: {
      action: "data_deletion_callback",
      userId,
      confirmationCode,
      matchedConnections: result.matched,
      updatedConnections: result.updated,
    },
  });

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
}
