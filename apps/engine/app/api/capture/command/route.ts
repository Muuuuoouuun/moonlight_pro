import { NextResponse } from "next/server.js";

import { executeCaptureCommand } from "../../../../lib/capture-command.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  fetchSupabaseRows,
  invokeSupabaseRpc,
} from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { status: "unauthorized", error: "invalid-shared-secret", retryable: false },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "invalid-json", error: "request-body-must-be-json", retryable: false },
      { status: 400 },
    );
  }

  const workspaceId =
    (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const ownerRows = workspaceId
    ? await fetchSupabaseRows("workspaces", {
        select: "owner_id",
        filters: [["id", `eq.${workspaceId}`]],
        limit: 1,
      })
    : null;
  const ownerId = typeof ownerRows?.[0]?.owner_id === "string" ? ownerRows[0].owner_id : null;
  const result = await executeCaptureCommand(body, { workspaceId, ownerId }, {
    rpc: invokeSupabaseRpc,
  });

  const statusCode = result.status === "saved"
    ? 201
    : result.status === "duplicate"
      ? 200
      : result.status === "conflict"
        ? 409
        : result.status === "invalid-input" || result.status === "invalid-json"
          ? 400
          : result.status === "preview"
            ? 202
            : 502;

  return NextResponse.json(result, { status: statusCode });
}
