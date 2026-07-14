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

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { status: "unauthorized", error: "invalid-shared-secret" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "invalid-json", error: "request-body-must-be-json" },
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
