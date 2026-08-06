import { NextResponse } from "next/server.js";

import { normalizeContentCommand } from "../../../../lib/content-command.ts";
import { executeContentCommand } from "../../../../lib/content-command-service.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  deleteSupabaseRecord,
  fetchSupabaseRows,
  insertSupabaseRecord,
  updateSupabaseRecord,
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
      { status: "unauthorized", error: "invalid-shared-secret" },
      { status: 401 },
    );
  }

  const body = await readJsonBounded(req);
  if (!body) {
    return NextResponse.json(
      { status: "invalid-json", error: "request-body-must-be-json-under-64kb" },
      { status: 400 },
    );
  }

  const workspaceId =
    (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  const command = normalizeContentCommand(body, { workspaceId });
  if (!command.ok) {
    return NextResponse.json(
      { status: "invalid-input", error: command.reason },
      { status: 400 },
    );
  }

  const result = await executeContentCommand(body, { workspaceId }, {
    insert: insertSupabaseRecord,
    update: updateSupabaseRecord,
    remove: deleteSupabaseRecord,
    fetchRows: async (table, options = {}) => fetchSupabaseRows(
      table,
      options as Parameters<typeof fetchSupabaseRows>[1],
    ),
  });
  const statusCode = result.status === "saved" || result.status === "logged"
    ? (body.action === "update_draft" ? 200 : 201)
    : result.status === "duplicate"
      ? 200
      : result.status === "invalid-input"
        ? 400
        : result.status === "preview"
          ? 202
          : 502;

  return NextResponse.json(result, { status: statusCode });
}
