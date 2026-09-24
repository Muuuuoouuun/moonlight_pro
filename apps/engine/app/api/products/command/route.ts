import { NextResponse } from "next/server.js";

import { executeProductCommand } from "../../../../lib/product-command.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import {
  deleteSupabaseRecord,
  fetchSupabaseRows,
  insertSupabaseRecord,
  updateSupabaseRecord,
} from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";

// 제품 카드(details)는 제공 범위 30 + 필수 조건 20 + 링크 10 정도라 64KB면 넉넉하다.
const MAX_COMMAND_BODY_BYTES = 64 * 1024;

async function readJsonBounded(req: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > MAX_COMMAND_BODY_BYTES) return null;
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_COMMAND_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ status: "unauthorized", error: "invalid-shared-secret" }, { status: 401 });
  }
  const body = await readJsonBounded(req);
  if (!body) {
    return NextResponse.json({ status: "invalid-json", error: "request-body-must-be-json-under-64kb" }, { status: 400 });
  }
  const workspaceId =
    (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();

  const result = await executeProductCommand(body, { workspaceId }, {
    insert: (table, record) => insertSupabaseRecord(table, record, { returnRepresentation: true }),
    update: (table, filters, patch) => updateSupabaseRecord(table, filters, patch, { returnRepresentation: true }),
    remove: (table, filters) => deleteSupabaseRecord(table, filters),
    fetchRows: (table, options = {}) => fetchSupabaseRows(table, options as Parameters<typeof fetchSupabaseRows>[1]),
  });
  const statusCode = result.status === "saved"
    ? (String(body.action).startsWith("create_") || body.action === "connect_repository" ? 201 : 200)
    : result.status === "duplicate"
      ? 200
      : result.status === "conflict"
        ? 409
        : result.status === "invalid-input"
          ? 400
          : result.error === "not-found"
            ? 404
            : result.error === "missing-config"
              ? 202
              : 502;
  return NextResponse.json(result, { status: statusCode });
}
