import { NextResponse } from "next/server.js";

import { executeCaptureCommand } from "../../../../lib/capture-command.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  fetchSupabaseRows,
  invokeSupabaseRpc,
} from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";


const MAX_COMMAND_BODY_BYTES = 64 * 1024;

async function readJsonBounded(req: Request): Promise<Record<string, unknown> | null> {
  // content-length가 있으면 먼저 확인, 없으면 텍스트 길이로 — 인증된 호출자라도
  // 원시 페이로드 폭주가 파서/메모리를 잡아먹지 않게 한다.
  const declared = Number(req.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > MAX_COMMAND_BODY_BYTES) return null;
  const text = await req.text();
  if (text.length > MAX_COMMAND_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { status: "unauthorized", error: "invalid-shared-secret", retryable: false },
      { status: 401 },
    );
  }

  const body = await readJsonBounded(req);
  if (!body) {
    return NextResponse.json(
      { status: "invalid-json", error: "request-body-must-be-json-under-64kb", retryable: false },
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
